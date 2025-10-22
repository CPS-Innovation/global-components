# Azure Blob Storage Configuration Sync

This project includes scripts to sync configuration files from `./configuration` to Azure Blob Storage.

## Setup

### 1. Create your `.env` file

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

### 2. Configure your `.env` file

Edit `.env` and set:

```bash
# Your Azure storage account name
AZURE_STORAGE_ACCOUNT=yourstorageaccount

# Your SAS token (without the leading '?')
AZURE_STORAGE_SAS_TOKEN=sv=2024-11-04&ss=b&srt=co&sp=rwltf&se=2025-10-16T17:58:50Z&st=2025-10-16T09:43:50Z&spr=https&sig=...
```

**Important:**
- The `.env` file is already in `.gitignore` and will NOT be committed to git
- Remove the leading `?` from your SAS token if it has one

### 3. Verify your SAS token has the required permissions

Your SAS token needs these permissions:
- **Read (r)** - to check if files exist and download them
- **Write (w)** - to upload files
- **List (l)** - to list containers
- **Tag (t)** - optional, for tagging blobs
- **Filter (f)** - optional, for filtering blobs

## Usage

### Check if files are in sync (read-only)

```bash
npm run config-sync-check
# or
pnpm run config-sync-check

# Check only a specific environment
npm run config-sync-check dev
```

This will:
1. Compare local files in `./configuration` with remote files in Azure
2. Report which files are in sync, out of sync, or missing
3. Exit with code 0 if all files are in sync, 1 otherwise
4. **Does not modify any files**

### Sync (upload) files to Azure

```bash
npm run config-sync
# or
pnpm run config-sync

# Sync only a specific environment
npm run config-sync test
```

This will:
1. Compare local files with remote files
2. Upload any files that are out of sync or missing
3. Skip files that are already in sync
4. Report upload results

## File Mapping

Local files are mapped to Azure containers as follows:

| Local File | Azure Container | Remote File |
|------------|-----------------|-------------|
| `config.dev.json` | `dev` | `config.json` |
| `config.dev.override.json` | `dev` | `config.override.json` |
| `config.test.json` | `test` | `config.json` |
| `config.test.override.json` | `test` | `config.override.json` |
| `config.prod.json` | `prod` | `config.json` |
| `config.prod.override.json` | `prod` | `config.override.json` |
| etc. | | |

## Alternative Authentication Methods

Instead of using a SAS token in `.env`, you can also use:

### Azure CLI Login (for local development)

```bash
# Remove AZURE_STORAGE_SAS_TOKEN from .env
az login
npm run check-config-sync
```

### Environment Variables Only (for CI/CD)

```bash
export AZURE_STORAGE_ACCOUNT=yourstorageaccount
export AZURE_STORAGE_SAS_TOKEN=sv=2024-11-04&ss=b&...
npm run check-config-sync
```

## Troubleshooting

### "AZURE_STORAGE_ACCOUNT environment variable is not set"
- Make sure you've created a `.env` file from `.env.example`
- Make sure `AZURE_STORAGE_ACCOUNT` is set in your `.env` file

### "Not authenticated with Azure"
- If using SAS token: Make sure `AZURE_STORAGE_SAS_TOKEN` is set in `.env`
- If using Azure CLI: Run `az login` first

### "Remote file does not exist"
- The container for that environment doesn't exist yet, or
- The file hasn't been uploaded to Azure yet
