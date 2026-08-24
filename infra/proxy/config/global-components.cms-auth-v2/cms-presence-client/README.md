# cms-presence-client — presence POC for CMS Modern and DCF

A single injected script that joins the case-locking SignalR hub from **CMS Modern**
(`/viewer/`) and **DCF** (`/dcf/`), reports "I am on this case", and logs everyone
else the hub reports. Observe-only: no UI, no writes to the host page.

## Why it is built this way

Both apps run in **Edge IE mode at document mode 11** (confirmed: `document.documentMode === 11`
in both). `/viewer/landing` sends `X-UA-Compatible: IE=edge` and `/dcf/` sends
`IE=EmulateIE11`; under IE mode both resolve to Trident 11, not Chromium.

That rules out the library global-components uses: `@microsoft/signalr` v8 is ES2015+
and needs native `Promise`. **3.1.x is the last line that supports IE11**, and it ships a
prebuilt ES5 browser bundle. So:

| # | Part | Why |
|---|---|---|
| 1 | `es6-promise` 4.2.8 | IE11 has no `Promise`; SignalR requires one |
| 2 | `@microsoft/signalr` 3.1.31 | last IE11-capable client, prebuilt ES5 |
| 3 | `cms-presence-client.src.js` | our glue |

The app maintainers want **one script**, so `build.sh` concatenates the three into
`../cms-presence-client.js`. Plain `cat` — every input is already ES5, so there is
nothing to transpile and no bundler to misconfigure. Both vendor files are UMD and
self-register on `window`.

The whole bundle is verified to parse as ES5:

```bash
node -e "require('acorn').parse(require('fs').readFileSync('../cms-presence-client.js','utf8'),{ecmaVersion:5})"
```

## Build

```bash
./build.sh
```

Writes `../cms-presence-client.js`. The dev bearer token is lifted at build time from
`packages/cps-global-components/src/services/case-locking/case-locking-presence.ts`,
so there is one source of truth for it.

## Deploy

The existing asset deploy script takes the source and blob name as env vars — no edit
needed:

```bash
JS_SRC="$PWD/infra/proxy/config/global-components.cms-auth-v2/cms-presence-client.js" \
BLOB_NAME=cms-presence-client.js \
DRY_RUN=0 ./infra/proxy/scripts/deploy-cms-auth-v2-client.local.sh deploy
```

It lands at `/global-components/test/cms-presence-client.js` via the existing blob
route, which is the `src` the nginx conf injects.

The two injection locations (`= /viewer/landing`, `~ ^/dcf/review/`) live in
`../global-components.cms-auth-v2.conf` and ship with that conf.

## What it does

1. Reads the case from the URL:
   - DCF `/dcf/review/<caseId>/<userGuid>` → path
   - Modern `/viewer/landing#/case-summary/<caseId>` or `#/disclosure/<caseId>` → **hash**
     (never sent to the server, so this can only be read client-side)
2. Builds `sectionKey = "<caseId>:CASE"` — `CASE` is the top-level doll: on this case at all.
3. Connects to `/global-components/case-locking/api/hubs/notifications` (same origin —
   no CORS, no JSONP) with the dev bearer via `accessTokenFactory`, then
   `invoke("Connect", sectionKey, appName)`.
4. Logs every `Notify` payload.
5. Re-reconciles every 2s and on `hashchange` — Modern changes case without a page load.

## Poking at it

Everything is mirrored on `window.__ccPresence`, so state is inspectable even if the
host app has stubbed `console`:

```js
__ccPresence.status()     // { connectedKey, busy, context }
__ccPresence.messages     // last 200 log entries, newest last
__ccPresence.context()    // { app, screen, caseId } for the current URL
__ccPresence.reconcile()  // force a re-check
__ccPresence.stop()       // drop the connection
```

## Known unknowns

- **SignalR 3.1 client against a .NET 8 server.** The JSON hub protocol is stable and
  this should be fine, but it is the first thing to suspect if `start()` succeeds and
  `Connect` does not.
- **Token transport.** With WebSockets the token goes as an `access_token` query
  param (browsers cannot set headers on a WS handshake); with long-polling it is an
  `Authorization` header. If the Bearer-Test scheme only reads the header, force
  long-polling via the `transport` option in `buildConnection()`.
- **`CASE` vs the header's code.** global-components' witness region joins
  `<caseId>:WITNESS`. To watch the two estates see each other, both sides must use the
  same kind.
