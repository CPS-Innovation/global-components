# Encapsulated CMS Auth Spike (FCT2-14290)

Server-side spike exploring an Azure AD / Entra OIDC flow encapsulated in the nginx + njs proxy layer, with state stored in Azure Table Storage and (later) AD directory extensions.

This branch was recovered from a backup repo after `main` was rewritten. The recovery dropped the original commit history, so the work lives here as a pure addition over current `main` rather than as a rebase-able lineage.

## What's running today

- `https://localhost:8443/spike/` — the **spike SPA-ish test page** (`spike.html`). Walks through the increments: login → validate → store → read → table store/read → AD directory-extension compress. Exercises the `/spike/*` endpoint family in `global-components.spike.{conf,ts}`.
- `https://localhost:8443/global-components/cms-auth/login?r=…&cc=…` — the **cms-auth v1 redirect flow** in `global-components.cms-auth.{conf,ts}`. Pure server-side: 302 to Azure AD, callback returns a diagnostic HTML page with the id_token, OID, claims, and validation result. The cleanest pedagogical example of the flow.

Both run against your own Azure tenant via the env vars in `.env` (gitignored).

## Running it up from a fresh clone

### 1. Azure setup (one-time)

Follow the spike setup playbook for Azure App Registrations, an extension property, a Storage Account, and the spike's directory-extension permission grants:

→ [docs/spike.md](docs/spike.md) Steps 1–3 and 5

The `cms-auth` flow only needs the App Registration A from Step 1 (no extension property, no storage). The `/spike/*` flow needs all of it.

### 2. Local cert (one-time)

Generate self-signed cert into `infra/proxy/docker/certs/`:

```bash
cd infra/proxy/docker
mkdir -p certs
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout certs/localhost.key \
  -out certs/localhost.crt \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
```

`docker/certs/` is gitignored.

### 3. Real env values

Create `infra/proxy/config/global-components.spike/.env` (gitignored). For the `/spike/*` flow:

```
SPIKE_TENANT_ID=<your tenant guid>
SPIKE_CLIENT_ID=<App Registration A client id>
SPIKE_CLIENT_SECRET=<App Registration A secret>
SPIKE_REDIRECT_URI=https://localhost:8443/spike/callback
SPIKE_STORAGE_ACCOUNT=<your storage account name>
SPIKE_STORAGE_KEY=<storage account access key>
```

For the `/global-components/cms-auth/*` flow add:

```
CPS_GLOBAL_COMPONENTS_CMS_AUTH_TENANT_ID=<your tenant guid>
CPS_GLOBAL_COMPONENTS_CMS_AUTH_CLIENT_ID=<App Registration A client id>
CPS_GLOBAL_COMPONENTS_CMS_AUTH_CLIENT_SECRET=<App Registration A secret>
CPS_GLOBAL_COMPONENTS_CMS_AUTH_REDIRECT_URI=https://localhost:8443/global-components/cms-auth/callback
```

Each redirect URI must also be registered against the Azure App Registration.

### 4. Build and run

```bash
cd infra/proxy
pnpm build
cd docker
docker compose -f docker-compose.yml -f docker-compose.spike.yml up --build
```

Then visit `https://localhost:8443/spike/` (accept the self-signed cert prompt).

## Where things live

### Code (in this folder)

- `global-components.spike.{conf,ts}` — the `/spike/*` endpoint family (login, callback, validate, store/read, table/store|read, ext-compress/store|read). Reads config via `js_var $spike_*` and `r.variables.spike_*`.
- `global-components.cms-auth.{conf,ts}` — **v1** of the CMS auth flow. Two endpoints (login, callback). Reads config via `process.env`. Cleanest example of a server-side AD redirect flow with HTML diagnostic.
- `global-components.cms-auth-v2.{conf,ts}` — **v2** redesign. Four-hop flow (`/polaris-v2` → `/init-v2/` → AD → `/init-v2/callback`) plus `/init-v2/error`, `/global-components/cms-modern-token-v2`. The `uaulLogin.aspx` interception block is commented out for local testing because it needs production-only plumbing (`cmsenv.js`, `cms_log` format, `cmsproxy` rate-limit zone).
- `global-components.cms-ping.{conf,ts}` — diagnostic ping endpoint, marked for retirement per `docs/CLAUDE.md`.
- `global-components.cms-proxy-no-logout.{conf,ts}` — CMS proxy without logout. Not loaded by `nginx.spike.conf` because it depends on production-only plumbing.
- `cookie-utils.ts` — shared cookie helpers.
- `nginx.spike.conf` — self-contained nginx config used by `docker-compose.spike.yml`. Listens on 8080 (HTTP) and 8443 (HTTPS). Includes `global-components.spike.conf` and `global-components.cms-auth.conf` on the SSL server.
- `nginx.conf`, `nginx.js` — earlier-stage nginx + njs files; the `nginx.spike.conf` supersedes for the test stack.
- `spike.html` — static page served at `/spike/` that drives the spike increments.
- `tests/global-components.cms-auth-v2.integration.test.js` — light smoke test for `/init-v2/error`.

### Docs

| File | Purpose |
|---|---|
| [docs/spike.md](docs/spike.md) | The canonical 7-step setup + run playbook. Start here for setup. |
| [docs/CLAUDE.md](docs/CLAUDE.md) | Design notes for cms-auth-v2; flags v1 + cms-ping + spike.cms-auth.md as superseded. |
| [docs/_auth.md](docs/_auth.md) | Auth-flow specifics — request/response shapes, state cookie format. |
| [docs/cms-analysis.md](docs/cms-analysis.md) | CMS traffic analysis from the original spike investigation. |
| [docs/spike.cms-auth.md](docs/spike.cms-auth.md) | **Superseded** original v1 design doc — kept for breadcrumbs. |
| [docs/vnext-observability-notes.md](docs/vnext-observability-notes.md) | Soft-mode token validation + structured logging ideas rescued from the recovered patch's vnext rejects. Independent of the spike — port to whichever module owns protected routes. |

## Recovery breadcrumbs

What was on the original branch but isn't here:

- **vnext-side spike modifications** — the spike branch tried to add soft-mode validation and `logRequest` js_header_filter to `vnext.ts`. That structural premise has moved (state and cases are now in `main/`), so the changes were dropped. Their substantive intent is captured in `docs/vnext-observability-notes.md`.
- **vnever cleanup** — the spike branch removed `global-components.vnever/*`. `main` already deleted those, so the change was a no-op.
- **`/launch/{cms,cin2-5,*-proxy}` route additions** — the spike tried to add these to `vnext.conf`; they're already in `main/nginx-full.conf:535+`.
- **`cmsenv.js`** — referenced by `global-components.cms-auth-v2.conf` (and others) but never in the repo. Lives in the production proxy deploy. The local docker test layer can't load anything that depends on it.

## What's next

This is exploratory; the next decisions are about what (if anything) to graduate:

- **Soft-mode validation + structured logging** — most portable winner. Could land in `main/global-components.{conf,ts}` independently of the rest of the spike (see `docs/vnext-observability-notes.md`).
- **Encapsulated AD flow on the proxy** — the architectural question the spike was asked to answer. The v1 flow demonstrates feasibility; v2 shows the more elaborate cookie-capture choreography. Production graduation would need to unify with `cmsenv.js` plumbing and the `uaulLogin.aspx` interception.
- **Directory-extension storage** — the `/spike/ext-compress/*` increments explore avoiding Table Storage entirely by stuffing CMS auth state into Azure AD directory extensions. Promising for compliance simplicity (no storage account to manage), constrained by extension-value size limits.
