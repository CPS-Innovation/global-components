# Nginx Proxy Config

Nginx reverse proxy with njs (JavaScript) for header/cookie manipulation. Used to proxy requests to Azure Functions backend.

## Structure

```
config/
  main/                          # Main nginx config and auth redirects
  global-components/             # Base proxy functionality for Azure Functions
  global-components.vnext/       # State endpoint, status, token validation, swagger filtering
  global-components.vnever/      # Upstream health check proxy
docker/                          # Docker setup for local testing
deploy/                          # Deployment scripts
```

## Local Testing

```bash
cd docker
docker-compose up --build
```

Test routes at `http://localhost:8080/global-components/`.

## Running Tests

```bash
# Unit tests
pnpm test

# Integration tests (rebuilds Docker)
pnpm test:integration
```

## Deployment

See `deploy/` folder for deployment scripts. Requires a remote machine with network access to Azure blob storage.

For detailed documentation, see `CLAUDE.md`.
