#!/usr/bin/env bash
#
# release-snapshots.test.sh — exercise release-snapshots.sh end to end against Azurite, the local
# Azure Storage emulator, the way the workflows use it: deploy, deploy again with new files,
# restore the previous build, roll forward, prune.
#
# Talks ONLY to Azurite's publicly documented development account on localhost — it refuses to
# run otherwise — and only touches the "demo" environment's container and snapshots.
#
# Run the emulator in another terminal first:
#   npx -p azurite azurite-blob --inMemoryPersistence --blobHost 127.0.0.1 --blobPort 10000 --skipApiVersionCheck --loose
# then:
#   .github/scripts/release-snapshots.test.sh

set -uo pipefail
cd "$(dirname "$0")"

BASE="http://127.0.0.1:10000/devstoreaccount1"
# Azurite's well-known development account key — published by Microsoft, not a secret.
export AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=$BASE;"
ENV_NAME="demo"
S=./release-snapshots.sh

if [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE?comp=list")" = "000" ]; then
  echo "✗ Azurite is not running on 127.0.0.1:10000 — see the header of this file"
  exit 1
fi

PASS=0
FAILED=0
check() {
  if [ "$2" = "$3" ]; then
    echo "  ✓ $1"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $1 — got [$2] want [$3]"
    FAILED=$((FAILED + 1))
  fi
}
http() {
  curl -s -o /dev/null -w '%{http_code}' "$1"
}
body() {
  curl -s "$1"
}
held() {
  $S list "$ENV_NAME" | awk '{ print $2 }' | sort | tr '\n' ' '
}

# Mirrors sub-workflow-deploy-script: snapshot what is live, overwrite-upload the new build with the
# same cache-control and buildsha metadata the real deploy uses, then prune.
deploy() {
  local sha="$1" dir="$2"
  $S snapshot "$ENV_NAME" >/dev/null || return 1
  az storage container create --name "$ENV_NAME" --public-access container --output none
  az storage blob upload-batch --destination "$ENV_NAME" --source "$dir" --overwrite true \
    --content-cache-control "max-age=20, stale-while-revalidate=3600, stale-if-error=3600" \
    --metadata "buildsha=$sha" --output none
  $S prune "$ENV_NAME" 2>/dev/null
}

build() {
  mkdir -p "$WORK/$1"
  echo "$1-script" >"$WORK/$1/global-components.js"
  echo "{\"v\":\"$1\"}" >"$WORK/$1/config.json"
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
az storage container delete --name "$ENV_NAME" --output none 2>/dev/null
if [ "$(az storage container exists --name release-snapshots --query exists -o tsv)" = "true" ]; then
  az storage blob delete-batch --source release-snapshots --pattern "$ENV_NAME/*" --output none
fi
sleep 1
mkdir -p "$WORK/v1/preview" "$WORK/v2/preview" "$WORK/v2/cms-augmentation"
echo "v1-script" >"$WORK/v1/global-components.js"
echo '{"v":1}' >"$WORK/v1/config.json"
echo "p1" >"$WORK/v1/preview/index.html"
echo "v2-script" >"$WORK/v2/global-components.js"
echo '{"v":2}' >"$WORK/v2/config.json"
echo "p2" >"$WORK/v2/preview/index.html"
echo '{}' >"$WORK/v2/csp.json"
echo "c" >"$WORK/v2/cms-augmentation/client-classic.js"

echo "1. first deploy into an empty environment"
check "snapshot with nothing live is a graceful no-op" "$($S snapshot "$ENV_NAME" 2>&1 | grep -c 'nothing live')" "1"
deploy aaaaaaa "$WORK/v1"
check "live is aaaaaaa" "$($S live "$ENV_NAME")" "aaaaaaa"

echo "2. second deploy adds new files"
deploy bbbbbbb "$WORK/v2"
check "live is bbbbbbb" "$($S live "$ENV_NAME")" "bbbbbbb"
check "aaaaaaa was snapshotted before the overwrite" "$(held)" "aaaaaaa "
check "csp.json now served" "$(http "$BASE/$ENV_NAME/csp.json")" "200"
check "snapshot container is private (anonymous GET refused)" "$(http "$BASE/release-snapshots/$ENV_NAME/aaaaaaa/global-components.js" | grep -cE '40[34]')" "1"
check "snapshots share one container (no per-snapshot containers)" "$(az storage container list --query "length([?starts_with(name, 'snapshot-')])" -o tsv)" "0"

echo "3. snapshots are idempotent"
$S snapshot "$ENV_NAME" >/dev/null 2>&1
check "re-snapshot of the same build reports already held" "$($S snapshot "$ENV_NAME" 2>&1 >/dev/null | grep -c 'already held')" "1"

echo "4. restore previous"
$S restore "$ENV_NAME" previous >/dev/null
check "live is aaaaaaa again" "$($S live "$ENV_NAME")" "aaaaaaa"
check "script content is v1" "$(body "$BASE/$ENV_NAME/global-components.js")" "v1-script"
check "config content is v1" "$(body "$BASE/$ENV_NAME/config.json")" '{"v":1}'
check "nested file restored" "$(body "$BASE/$ENV_NAME/preview/index.html")" "p1"
check "file only in v2 (csp.json) removed" "$(http "$BASE/$ENV_NAME/csp.json")" "404"
check "folder only in v2 (cms-augmentation) removed" "$(http "$BASE/$ENV_NAME/cms-augmentation/client-classic.js")" "404"
check "marker not copied into the live container" "$(http "$BASE/$ENV_NAME/_snapshot.json")" "404"
check "cache-control preserved" "$(az storage blob show --container-name "$ENV_NAME" --name global-components.js --query properties.contentSettings.cacheControl --output tsv)" "max-age=20, stale-while-revalidate=3600, stale-if-error=3600"
check "content-type preserved" "$(az storage blob show --container-name "$ENV_NAME" --name config.json --query properties.contentSettings.contentType --output tsv)" "application/json"
check "rolled-away build (bbbbbbb) is still held" "$(held)" "aaaaaaa bbbbbbb "

echo "5. roll forward again"
$S restore "$ENV_NAME" bbbbbbb >/dev/null
check "live is bbbbbbb" "$($S live "$ENV_NAME")" "bbbbbbb"
check "script content is v2" "$(body "$BASE/$ENV_NAME/global-components.js")" "v2-script"
check "csp.json back" "$(http "$BASE/$ENV_NAME/csp.json")" "200"

echo "6. guards"
check "restoring the live build is a no-op" "$($S restore "$ENV_NAME" bbbbbbb 2>&1 | grep -c 'already serving')" "1"
$S restore "$ENV_NAME" deadbee >/dev/null 2>&1
check "unknown sha fails" "$?" "1"
$S restore "$ENV_NAME" previous >/dev/null 2>&1
check "previous picks aaaaaaa" "$($S live "$ENV_NAME")" "aaaaaaa"

echo "7. previous means most recently LIVE, not most recently copied"
# History so far: a, b, restore a, forward b, restore a. bbbbbbb's copy is newer than aaaaaaa's,
# but aaaaaaa is what was live last — so after deploying c, "previous" must be aaaaaaa.
build ccccccc
deploy ccccccc "$WORK/ccccccc"
$S restore "$ENV_NAME" previous >/dev/null 2>&1
check "previous after deploying c is aaaaaaa" "$($S live "$ENV_NAME")" "aaaaaaa"
$S restore "$ENV_NAME" ccccccc >/dev/null 2>&1

echo "8. prune keeps the 5 most recently live"
for sha in ddddddd eeeeeee fffffff 1111111 2222222; do
  build "$sha"
  deploy "$sha" "$WORK/$sha"
done
check "exactly 5 held after 8 builds" "$($S list "$ENV_NAME" | wc -l | tr -d ' ')" "5"
check "the 5 most recently live are kept" "$(held)" "1111111 ccccccc ddddddd eeeeeee fffffff "
check "pruned snapshot's files are gone too" "$(az storage blob list --container-name release-snapshots --prefix "$ENV_NAME/bbbbbbb/" --query 'length(@)' -o tsv)" "0"

echo "9. prune never removes the live build's snapshot"
$S restore "$ENV_NAME" ccccccc >/dev/null 2>&1
SNAPSHOTS_TO_KEEP=0 $S prune "$ENV_NAME" 2>/dev/null
check "keep 0 still keeps the live build" "$(held)" "ccccccc "
check "and it is still restorable" "$($S live "$ENV_NAME")" "ccccccc"

echo
echo "PASS=$PASS FAILED=$FAILED"
[ "$FAILED" -eq 0 ]
