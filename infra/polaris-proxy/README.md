# Polaris Proxy

Nginx reverse proxy for CMS-to-Polaris integration with dynamic environment routing based on cookies.

## Overview

This proxy handles:
- CMS Classic and Modern traffic routing
- Multi-environment support (CIN2, CIN3/default, CIN4, CIN5)
- Internet Explorer mode detection and redirection
- Authentication handover flows between CMS and Polaris
- Rate limiting for CMS requests

## Key Files

### Configuration (`config/`)

- `nginx.conf` - Main nginx configuration with all location blocks and routing rules
- `nginx.js` - njs module for auth redirect handlers (`appAuthRedirect`, `polarisAuthRedirect`, `taskListAuthRedirect`)
- `cmsenv.js` - njs module for CMS environment detection and dynamic upstream routing
- `polaris-script.js` - Client-side script injected into CMS pages to add "Open in Polaris" button

## Local Development

### Prerequisites

- Docker and Docker Compose
- Node.js 20+ and pnpm

### Running Locally

```bash
# Install dependencies
pnpm install

# Start the proxy with mock upstream
cd docker
docker compose up --build

# Proxy available at http://localhost:8080
```

### Running Tests

```bash
# Run integration tests (starts docker, runs tests, stops docker)
pnpm test:integration

# Or run just unit tests (when available)
pnpm test
```

## Docker Setup

### Files

- `docker/Dockerfile.base` - nginx with njs module
- `docker/Dockerfile.mock` - Mock upstream server for testing
- `docker/docker-compose.yml` - Compose configuration
- `docker/polaris-proxy.mock.env` - Mock environment variables
- `docker/mock-server.js` - Mock CMS/API server

### Environment Variables

The proxy requires many environment variables for routing to different CMS environments. See `docker/polaris-proxy.mock.env` for the full list.

Key categories:
- **Core**: `WEBSITE_DNS_SERVER`, `WEBSITE_HOSTNAME`, `WEBSITE_SCHEME`
- **Rate Limiting**: `CMS_RATE_LIMIT`, `CMS_RATE_LIMIT_QUEUE`
- **CMS Environments**: `DEFAULT_*`, `CIN2_*`, `CIN4_*`, `CIN5_*` prefixed variables for each environment's IPs and domain names
- **App Endpoints**: `APP_ENDPOINT_DOMAIN_NAME`, `API_ENDPOINT_DOMAIN_NAME`, etc.

## CMS Environment Detection

The proxy detects which CMS environment to route to based on cookies:

```javascript
// From cmsenv.js
if (cookie.includes("cin3")) return "default";
if (cookie.includes("cin2")) return "cin2";
if (cookie.includes("cin4")) return "cin4";
if (cookie.includes("cin5")) return "cin5";
return "default";
```

This enables seamless switching between environments via the `/cin2`, `/cin3`, `/cin4`, `/cin5` endpoints.

## IE Mode Handling

Many CMS routes require Internet Explorer mode. The proxy checks for the Trident user agent:

- Non-IE requests to protected routes return `402 Payment Required` with message "requires Internet Explorer mode"
- Requests with `X-InternetExplorerMode` header can trigger mode switches

## Testing

Integration tests use a mock upstream server that simulates CMS responses. Tests verify:

- Health endpoint
- Static file serving (polaris-script.js)
- Environment switching redirects
- Cookie setting behavior
- IE mode enforcement
