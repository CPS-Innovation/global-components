# Deployment

Deployment is done from a remote machine with network access to Azure blob storage. The deploy script downloads build artifacts from GitHub Actions.

**Note**: This deployment only handles vnext-specific files. The base global-components config (`nginx.js`, `global-components.conf.template`, `global-components.js`) is deployed by the parent project.

## Prerequisites

- [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated
- [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli) (`az`) installed and authenticated

## One-time setup

1. Create a deployment directory:
   ```bash
   mkdir global-components-deploy && cd global-components-deploy
   ```

2. Create `secrets.env` with these variables:
   ```bash
   AZURE_SUBSCRIPTION_ID=your-subscription-id
   AZURE_RESOURCE_GROUP=your-resource-group
   AZURE_STORAGE_ACCOUNT=your-storage-account
   AZURE_STORAGE_CONTAINER=content
   AZURE_WEBAPP_NAME=your-webapp-name
   STATUS_ENDPOINT=https://your-proxy-domain/global-components/status
   GLOBAL_COMPONENTS_APPLICATION_ID=your-app-id
   GLOBAL_COMPONENTS_BLOB_STORAGE_URL=https://your-storage.blob.core.windows.net
   ```

## Deploy

```bash
curl -sSL https://raw.githubusercontent.com/CPS-Innovation/global-components/main/infra/proxy/deploy/deploy.sh | bash
```

To deploy from a different branch:
```bash
export GITHUB_BRANCH=feature/my-branch
curl -sSL "https://raw.githubusercontent.com/CPS-Innovation/global-components/$GITHUB_BRANCH/infra/proxy/deploy/deploy.sh" | bash
```

This will:
1. Download the `proxy-artifact` from the latest successful GitHub Actions build
2. Backup current files from blob storage
3. Upload new config files to blob storage
4. Set app settings on the web app
5. Increment deployment version
6. Restart the web app
7. Poll status endpoint until new version is live

## Rollback

```bash
curl -sSL https://raw.githubusercontent.com/CPS-Innovation/global-components/main/infra/proxy/deploy/rollback.sh | bash
```

Lists available backups and lets you select one to restore.

## Folder structure after deploy

```
global-components-deploy/
  secrets.env                    # Your secrets (create manually)
  {AZURE_STORAGE_CONTAINER}/     # Content folder (created by deploy)
    global-components.vnext.conf.template
    global-components.vnext.js
  backups/                       # Timestamped backups (created by deploy)
```

## Files deployed

To blob storage (vnext-specific only):
- `global-components.vnext.conf.template` - vnext nginx location blocks
- `global-components.vnext.js` - njs module for vnext features (state, token validation)
- `global-components-deployment.json` - version tracking

As app settings:
- `GLOBAL_COMPONENTS_APPLICATION_ID`
- `GLOBAL_COMPONENTS_BLOB_STORAGE_URL`

**Note**: The following are deployed by the parent project:
- `nginx.js` - auth redirect handlers
- `global-components.conf.template` - nginx location blocks
- `global-components.js` - njs module for upstream proxying
- `WM_MDS_BASE_URL` and `WM_MDS_ACCESS_KEY` app settings
