# Encapsulated CMS Auth Spike (FCT2-14290)

Server-side spike exploring an Azure AD / Entra OIDC flow encapsulated in the nginx + njs proxy layer, with state stored in Azure Table Storage and (later) AD directory extensions.

This branch was recovered from a backup repo after `main` was rewritten. The recovery dropped the original commit history, so the work lives here as a pure addition over current `main` rather than as a rebase-able lineage.

## Status

**v2 (`global-components.cms-auth-v2.{conf,ts}`) is the active line.** It's validated
by the `cms-auth-v2` integration-test layer (`pnpm test:integration`) and deployed
**out-of-band** (by hand), not via the main proxy build.

The earlier v1 variants and their manual HTTPS harness are **archived under `previous/`**.
The `docker-compose.spike.yml` stack that used to serve them on `:8443` has been **removed** —
the sections below describing `https://localhost:8443/spike/` etc. are retained for historical
reference only and no longer run as-is. To exercise the archived flows you'd need to restore an
equivalent compose override.

## What the archived stack did (historical)

- `https://localhost:8443/spike/` — the **spike SPA-ish test page** (`previous/spike.html`). Walked through the increments: login → validate → store → read → table store/read → AD directory-extension compress. Exercises the `/spike/*` endpoint family in `previous/global-components.spike.{conf,ts}`.
- `https://localhost:8443/global-components/cms-auth/login?r=…&cc=…` — the **cms-auth v1 redirect flow** in `previous/global-components.cms-auth.{conf,ts}`. Pure server-side: 302 to Azure AD, callback returns a diagnostic HTML page with the id_token, OID, claims, and validation result. The cleanest pedagogical example of the flow.

Both ran against your own Azure tenant via the env vars in `.env` (gitignored).

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

The v2 flow's required variables are documented in [`.env.example`](.env.example). Copy it to
`.env` (gitignored) and fill in — or set the same variables in the deployment environment for the
out-of-band deploy:

```
CPS_GLOBAL_COMPONENTS_CMS_AUTH_TENANT_ID=<your tenant guid>
CPS_GLOBAL_COMPONENTS_CMS_AUTH_CLIENT_ID=<app registration client id>
CPS_GLOBAL_COMPONENTS_CMS_AUTH_CLIENT_SECRET=<app registration secret>
CPS_GLOBAL_COMPONENTS_CMS_AUTH_REDIRECT_URI=https://<your-host>/init-v2/callback
CPS_GLOBAL_COMPONENTS_CMS_AUTH_STORAGE_ACCOUNT=<storage account name>
CPS_GLOBAL_COMPONENTS_CMS_AUTH_STORAGE_KEY=<storage account access key>
```

The `REDIRECT_URI` must also be registered against the Azure App Registration. `WEBSITE_DNS_SERVER`
is provided by the platform (see `.env.example`). The archived v1 `SPIKE_*` variables are gone.

### 4. Build and run

> The `docker-compose.spike.yml` override that stood up the `:8443` HTTPS stack has been
> removed. The archived `previous/nginx.spike.conf` still describes that two-server config if
> you want to recreate an override; otherwise use the `cms-auth-v2` integration layer to exercise
> v2, and deploy v2 out-of-band to a real proxy for the full flow.

```bash
cd infra/proxy
pnpm test:integration   # builds, then runs all layers incl. cms-auth-v2
```

## Where things live

### Active code (in this folder)

This folder now contains **only v2** plus its docs/tests. Everything else is archived under `previous/`.

- `global-components.cms-auth-v2.{conf,ts}` — **v2** redesign, the current line. Four-hop flow (`/polaris-v2` → `/init-v2/` → AD → `/init-v2/callback`) plus `/init-v2/error`, `/global-components/cms-modern-token-v2`. The `uaulLogin.aspx` interception block is commented out for local testing because it needs production-only plumbing (`cmsenv.js`, `cms_log` format, `cmsproxy` rate-limit zone).
- `tests/global-components.cms-auth-v2.integration.test.js` — light smoke test for `/init-v2/error` and `/polaris-v2`.

### Archived — reference only (in `previous/`)

**Not built, not packaged, not deployed.** `tsconfig` excludes `config/**/previous/**` and `build.sh`
copies none of it, so nothing here reaches `dist/`. Kept purely as reference for the v2 design.
Superseded per `docs/CLAUDE.md`. To exercise any of it you'd restore a compose override + build wiring.

- `global-components.spike.{conf,ts}` — the `/spike/*` endpoint family (login, callback, validate, store/read, table/store|read, ext-compress/store|read).
- `global-components.cms-auth.{conf,ts}` — **v1** of the CMS auth flow. Two endpoints (login, callback). Cleanest example of a server-side AD redirect flow with HTML diagnostic.
- `global-components.cms-ping.{conf,ts}` — diagnostic ping endpoint, superseded by v2.
- `global-components.cms-proxy-no-logout.{conf,ts}` — CMS proxy without logout. Depends on production-only plumbing.
- `cookie-utils.ts` — shared cookie helpers (inlined into `global-components.spike.ts`).
- `nginx.spike.conf` — self-contained nginx config the removed `docker-compose.spike.yml` used. Listened on 8080 (HTTP) and 8443 (HTTPS).
- `nginx.conf` — a stale full copy of the production Polaris proxy config the spike carried as its base. Superseded by `config/main/nginx.conf`.
- `nginx.js` — stale copy of the main proxy njs (gitignored build artifact).
- `spike.html` — static page served at `/spike/` that drove the spike increments.

### Docs

| File                                                                   | Purpose                                                                                                                                                                            |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [docs/spike.md](docs/spike.md)                                         | The canonical 7-step setup + run playbook. Start here for setup.                                                                                                                   |
| [docs/CLAUDE.md](docs/CLAUDE.md)                                       | Design notes for cms-auth-v2; flags v1 + cms-ping + spike.cms-auth.md as superseded.                                                                                               |
| [docs/\_auth.md](docs/_auth.md)                                        | Auth-flow specifics — request/response shapes, state cookie format.                                                                                                                |
| [docs/cms-analysis.md](docs/cms-analysis.md)                           | CMS traffic analysis from the original spike investigation.                                                                                                                        |
| [docs/spike.cms-auth.md](docs/spike.cms-auth.md)                       | **Superseded** original v1 design doc — kept for breadcrumbs.                                                                                                                      |
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
