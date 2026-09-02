# SignalR presence transport — ARCHIVED REFERENCE

Nothing here is built, deployed, or tested by CI. It is kept because it **works** and
was expensive to get working; if we ever want push instead of polling in CMS Modern or
DCF, this is the shortcut back.

**Why it is not live:** Classic runs at document mode 5 and can never run SignalR, so
JSONP is permanent for that app regardless. Shipping SignalR for Modern would mean two
transports against one API forever, plus ~127KB of vendor code on a page we are a guest
on. One mechanism for both legacy apps won on merit — not on feasibility, which
[SIGNALR-CROSS-DOMAIN.md](SIGNALR-CROSS-DOMAIN.md) settles: cross-origin SignalR is
*proven* to work in the IE-mode estate.

## What is here

| File | |
|---|---|
| `plugin.js` | the transport itself — connection lifecycle, keep-alive, `ReceiveNotification` → roster |
| `transport-signalr.js` | the loader that lived in the shipping bundle and fetched the vendor artefact on demand |
| `transport-signalr.test.js` | unit tests for the loader (14, passing when last run) |
| `cms-presence-client.signalr.src.js` | the original standalone client, before `common/` existed — kept for its comments |
| `SIGNALR-CROSS-DOMAIN.md` | the cross-origin experiment: method, result, and what it does and does not prove |

**The vendor files are deliberately gone.** Two minified libraries totalling ~127KB, of
no value in a diff and a nuisance in every grep. Rehydration re-downloads them.

## How the bundling worked

The shipping client is a **concatenation**, not a module graph: the injected script has
no loader, and document mode 5 has no module system. `build.sh` joins the source files
in dependency order inside one IIFE, and each file declares its own `CCP*` namespace.

SignalR could not go in that bundle, because the vendor code is four times the size of
the entire client and would be paid by every user on every page load for a transport
almost nobody would select. So it was a **second artefact**:

```
cms-presence-client.js      the shipping bundle          — always loaded
cms-presence-signalr.js     es6-promise + signalr + plugin.js  — loaded only on demand
```

Both were deployed to the same blob container. The client located the second by its own
`<script src>` directory (`CCPOrigin.sibling`), because the deploy prefix
(`/global-components/uat/…`) is per-environment and must not be hard-coded.

The two files could not see each other's scope — the shipping bundle is an IIFE — so
they met at one agreed global: `plugin.js` published `window.CCPSignalRFactory`, and the
loader called it with everything it needed (hub URL, app name, callbacks). That seam is
the only coupling, and it is what makes rehydration cheap.

## Rehydrating

1. **Vendor files** into `cms-presence-client/vendor/`, exact versions — these are the
   last that work at document mode 11:
   - `es6-promise-4.2.8.auto.min.js` (MIT) — mode 11 has no `Promise`; the `.auto` build
     installs it globally, which the SignalR client requires.
   - `signalr-3.1.31.min.js` (Apache-2.0) — `@microsoft/signalr` 3.1. Later majors drop
     IE support.

2. **Restore the two source files**: `plugin.js` → `cms-presence-client/signalr/`, and
   `transport-signalr.js` (+ its test) → `cms-presence-client/modern/`.

3. **Re-point the loader at the session interface.** This is the one thing that has
   moved on: when this was archived, transports implemented
   `{ name, start(sectionId), stop(), stats() }` — a single section. The client now
   locates **many** sections at once and drives `CCPSessions`, whose interface is
   `setDesired(sectionIds)`. Either give the SignalR transport a `setDesired` that
   opens one connection per section, or hold it to a single section deliberately and
   say so. Do not skip this step: the old loader will appear to work and will silently
   register only the first section.

4. **`build.sh`**: re-add `signalr/plugin.js` to the ES5 floor check, and re-add the
   second artefact — vendor, then vendor, then plugin, concatenated to
   `../cms-presence-signalr.js`.

5. **`deploy.local.sh`**: re-add the `upload_asset` line for `cms-presence-signalr.js`
   under `modern-client`. It must go to the **same container** as the client.

6. **`main.js`**: restore transport selection (`setTransport`, `setSkipNegotiation` on
   `__ccPresence`) and a `DEFAULT_TRANSPORT`.

## Two things that will cost you a day if you forget them

**Negotiate must stay ON.** `skipNegotiation: true` yields a connection that invokes hub
methods perfectly and never receives a single push, because Azure SignalR Service
dispatches server→client messages through the negotiate redirect. The symptom reads
exactly like "the API only notifies when a second user joins". It is not.

**The proxy is already set up for this** and is easy to mistake for something else:
`location ~ ^/global-components/case-locking/api/sr/` reverse-proxies the Service, and
`filterNegotiateBody` rewrites the negotiate response so the client is redirected to our
origin rather than `*.service.signalr.net`. If you rebuild this from scratch without
noticing, you will reinvent both.
