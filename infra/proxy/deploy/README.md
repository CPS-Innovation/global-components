# Deployment

Deployment is done from a remote machine with network access to Azure blob storage.

## One-time setup

1. Create a deployment directory and `secrets.env`:
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
   GLOBAL_COMPONENTS_MDS_URL=https://your-function-app.azurewebsites.net/api/
   GLOBAL_COMPONENTS_MDS_FUNCTION_KEY=your-function-key
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
1. Fetch latest config files from GitHub into `./{AZURE_STORAGE_CONTAINER}/`
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
    nginx.js
    global-components.conf.template
    global-components.js
  backups/                       # Timestamped backups (created by deploy)
```

## Files deployed

To blob storage:
- `nginx.js` - auth redirect handlers
- `global-components.conf.template` - nginx location blocks
- `global-components.js` - njs module for upstream proxying
- `global-components-deployment.json` - version tracking

As app settings:
- `GLOBAL_COMPONENTS_MDS_URL`
- `GLOBAL_COMPONENTS_MDS_FUNCTION_KEY`
