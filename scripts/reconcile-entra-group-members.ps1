#Requires -Version 5.1
<#
.SYNOPSIS
    Reconcile an Entra ID group's membership against a users.txt file.

.DESCRIPTION
    Reads desired members from users.txt (one UPN per line) in the script directory.
    Fetches current group membership in a single call, diffs, prompts for confirmation,
    then executes adds/removes and logs results.

.EXAMPLE
    .\Reconcile-EntraGroupMembers.ps1 -GroupName "FCT Global Navigation"
#>

param (
    [Parameter(Mandatory)][string] $GroupName
)

$ErrorActionPreference = 'Stop'

# -- CONFIG -------------------------------------------------------------------
$TenantId = '00dd0d1d-d7e6-4338-ac51-565339c7088c'
$ClientId = '8d6133af-9593-47c6-94d0-5c65e9e310f1'
# -----------------------------------------------------------------------------

$ScriptDir  = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$UsersFile  = Join-Path $ScriptDir 'users.txt'
$SecretFile = Join-Path $ScriptDir 'client-secret.txt'
$LogFile    = Join-Path $ScriptDir ("log-" + (Get-Date -Format 'yyyy-MM-dd-HH-mm') + ".log")

function Write-Log {
    param([string]$Message, [string]$Level = 'INFO')
    $line = "[{0}] [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
    Add-Content -Path $LogFile -Value $line
    switch ($Level) {
        'INFO'  { Write-Host $line -ForegroundColor Cyan }
        'OK'    { Write-Host $line -ForegroundColor Green }
        'WARN'  { Write-Host $line -ForegroundColor Yellow }
        'ERROR' { Write-Host $line -ForegroundColor Red }
        default { Write-Host $line }
    }
}

function Invoke-Graph {
    param([string]$Method, [string]$Uri, [object]$Body = $null, [switch]$Eventual)
    $headers = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' }
    if ($Eventual) { $headers['ConsistencyLevel'] = 'eventual' }
    $params = @{ Method = $Method; Uri = $Uri; Headers = $headers; ErrorAction = 'Stop' }
    if ($Body) { $params['Body'] = ($Body | ConvertTo-Json -Depth 5) }
    try {
        return Invoke-RestMethod @params
    } catch {
        $rawBody = $_.ErrorDetails.Message
        $detail  = $rawBody | ConvertFrom-Json -ErrorAction SilentlyContinue
        $msg     = if ($detail.error.message) { $detail.error.message } else { $rawBody }
        $code    = if ($detail.error.code)    { $detail.error.code    } else { $_.Exception.Response.StatusCode }
        throw "Graph API error [$code] on $Method $Uri`n  $msg`n  Raw: $rawBody"
    }
}

# Fetch all pages from a Graph list endpoint
function Get-GraphAll {
    param([string]$Uri, [switch]$Eventual)
    $results = @()
    $next    = $Uri
    while ($next) {
        $page    = Invoke-Graph -Method GET -Uri $next -Eventual:$Eventual
        $results += $page.value
        $next    = $page.'@odata.nextLink'
    }
    return $results
}

# -- 1. Read desired users from users.txt -------------------------------------
if (-not (Test-Path $UsersFile)) {
    Write-Error "users.txt not found at: $UsersFile"
    exit 1
}
$desiredUPNs = (Get-Content $UsersFile) |
    ForEach-Object { $_.Trim() } |
    Where-Object   { $_ -ne '' } |
    ForEach-Object { $_.ToLower() }

if ($desiredUPNs.Count -eq 0) {
    Write-Error "users.txt is empty."
    exit 1
}
Write-Host "`nDesired members loaded: $($desiredUPNs.Count) UPN(s) from users.txt" -ForegroundColor Cyan

# -- 2. Acquire token ---------------------------------------------------------
if (-not (Test-Path $SecretFile)) {
    $ClientSecret = Read-Host "Enter client secret"
} else {
    $ClientSecret = (Get-Content $SecretFile -Raw).Trim()
    Write-Host "Client secret loaded from client-secret.txt" -ForegroundColor Cyan
}

$tokenResponse = Invoke-RestMethod `
    -Method Post `
    -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token" `
    -ContentType 'application/x-www-form-urlencoded' `
    -Body @{
        grant_type    = 'client_credentials'
        client_id     = $ClientId
        client_secret = $ClientSecret
        scope         = 'https://graph.microsoft.com/.default'
    }
$token = $tokenResponse.access_token
Write-Host "Token acquired." -ForegroundColor Cyan

# -- 3. Resolve the group -----------------------------------------------------
Write-Host "Resolving group '$GroupName'..." -ForegroundColor Cyan
$encoded     = "displayName eq '$GroupName'" -replace ' ', '%20' -replace "'", '%27'
$groupResult = Invoke-Graph -Method GET -Eventual `
    -Uri "https://graph.microsoft.com/v1.0/groups?`$filter=$encoded&`$select=id,displayName,groupTypes,membershipRule&`$count=true"

if ($groupResult.value.Count -eq 0) { Write-Error "Group '$GroupName' not found."; exit 1 }
if ($groupResult.value.Count -gt 1)  { Write-Error "Multiple groups matched '$GroupName'."; exit 1 }
$group = $groupResult.value[0]
Write-Host "  Found: $($group.displayName) [$($group.id)]" -ForegroundColor Green

if ($group.membershipRule) {
    Write-Error "Group '$GroupName' has dynamic membership rules -- cannot reconcile manually."
    exit 1
}

# -- 4. Fetch all current members in one paged call ---------------------------
Write-Host "Fetching current group members..." -ForegroundColor Cyan
$currentMembers = Get-GraphAll `
    -Uri "https://graph.microsoft.com/v1.0/groups/$($group.id)/members?`$select=id,userPrincipalName,displayName&`$top=999"

# Build a lookup: lowercase UPN -> member object
$currentMap = @{}
foreach ($m in $currentMembers) {
    if ($m.userPrincipalName) {
        $currentMap[$m.userPrincipalName.ToLower()] = $m
    }
}
Write-Host "  Current members: $($currentMap.Count)" -ForegroundColor Cyan

# -- 5. Resolve desired UPNs to user objects (batched) ------------------------
Write-Host "Resolving desired users from Entra..." -ForegroundColor Cyan
$desiredMap   = @{}   # lowercase UPN -> user object
$unknownUPNs  = @()

# Graph batch API: up to 20 requests per batch
$batchSize = 20
$batches   = @()  # unused placeholder, kept for structure
for ($i = 0; $i -lt $desiredUPNs.Count; $i += $batchSize) {
    $end = $i + $batchSize - 1
    if ($end -ge $desiredUPNs.Count) { $end = $desiredUPNs.Count - 1 }
    $chunk = $desiredUPNs[$i..$end]
    $requests = @()
    foreach ($j in 0..($chunk.Count - 1)) {
        $requests += @{
            id     = "$j"
            method = "GET"
            url    = "/users/$($chunk[$j] -replace '@', '%40')?`$select=id,userPrincipalName,displayName"
        }
    }
    $batchBody     = @{ requests = $requests }
    $batchResponse = Invoke-RestMethod `
        -Method Post `
        -Uri "https://graph.microsoft.com/v1.0/`$batch" `
        -Headers @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' } `
        -Body ($batchBody | ConvertTo-Json -Depth 10)

    foreach ($resp in $batchResponse.responses) {
        if ($resp.status -eq 200) {
            $u = $resp.body
            $desiredMap[$u.userPrincipalName.ToLower()] = $u
        } else {
            $unknownUPNs += $chunk[[int]$resp.id]
        }
    }
}

if ($unknownUPNs.Count -gt 0) {
    Write-Host "`n  WARNING -- $($unknownUPNs.Count) UPN(s) not found in Entra and will be skipped:" -ForegroundColor Yellow
    $unknownUPNs | ForEach-Object { Write-Host "    - $_" -ForegroundColor Yellow }
}

# -- 6. Diff ------------------------------------------------------------------
$toAdd    = $desiredMap.Keys | Where-Object { $currentMap.Keys -notcontains $_ }
$toRemove = $currentMap.Keys | Where-Object { $desiredMap.Keys -notcontains $_ }

Write-Host "`n---- Reconciliation Summary for '$GroupName' ----" -ForegroundColor White
Write-Host "  Current members : $($currentMap.Count)"
Write-Host "  Desired members : $($desiredMap.Count)"
Write-Host "  To add          : $($toAdd.Count)"
Write-Host "  To remove       : $($toRemove.Count)"

if ($toAdd.Count -eq 0 -and $toRemove.Count -eq 0) {
    Write-Host "`n[OK] Group membership already matches users.txt. Nothing to do." -ForegroundColor Green
    Write-Log "Reconcile '$GroupName' -- no changes needed. Desired=$($desiredMap.Count) Current=$($currentMap.Count)"
    exit 0
}

if ($toAdd.Count -gt 0) {
    Write-Host "`n  ADD ($($toAdd.Count)):" -ForegroundColor Green
    $toAdd | ForEach-Object { Write-Host "    + $($desiredMap[$_].displayName) ($_)" -ForegroundColor Green }
}
if ($toRemove.Count -gt 0) {
    Write-Host "`n  REMOVE ($($toRemove.Count)):" -ForegroundColor Red
    $toRemove | ForEach-Object { Write-Host "    - $($currentMap[$_].displayName) ($_)" -ForegroundColor Red }
}

# -- 7. Confirm ---------------------------------------------------------------
Write-Host ""
$confirm = Read-Host "Proceed with $($toAdd.Count) addition(s) and $($toRemove.Count) removal(s)? [Y/N]"
if ($confirm -notmatch '^[Yy]') {
    Write-Host "Aborted. No changes made." -ForegroundColor Yellow
    Write-Log "Reconcile '$GroupName' -- aborted by user before any changes."
    exit 0
}

Write-Log "Reconcile '$GroupName' started -- adding $($toAdd.Count), removing $($toRemove.Count)"

# -- 8. Execute adds ----------------------------------------------------------
$addOk = 0; $addFail = 0
foreach ($upn in $toAdd) {
    $u = $desiredMap[$upn]
    try {
        $body = @{ '@odata.id' = "https://graph.microsoft.com/v1.0/directoryObjects/$($u.id)" }
        Invoke-Graph -Method POST `
            -Uri "https://graph.microsoft.com/v1.0/groups/$($group.id)/members/`$ref" `
            -Body $body | Out-Null
        Write-Log "  ADD OK    $($u.displayName) ($upn)" 'OK'
        $addOk++
    } catch {
        Write-Log "  ADD FAIL  $($u.displayName) ($upn) -- $_" 'ERROR'
        $addFail++
    }
}

# -- 9. Execute removes -------------------------------------------------------
$removeOk = 0; $removeFail = 0
foreach ($upn in $toRemove) {
    $u = $currentMap[$upn]
    try {
        Invoke-Graph -Method DELETE `
            -Uri "https://graph.microsoft.com/v1.0/groups/$($group.id)/members/$($u.id)/`$ref" | Out-Null
        Write-Log "  REMOVE OK    $($u.displayName) ($upn)" 'OK'
        $removeOk++
    } catch {
        Write-Log "  REMOVE FAIL  $($u.displayName) ($upn) -- $_" 'ERROR'
        $removeFail++
    }
}

# -- 10. Final summary --------------------------------------------------------
$summary = "Reconcile '$GroupName' complete -- Added: $addOk/$($toAdd.Count)  Removed: $removeOk/$($toRemove.Count)  Failures: $($addFail + $removeFail)"
Write-Log $summary 'INFO'
Write-Host "`nLog written to: $LogFile" -ForegroundColor Cyan