# cps-global-presence

Watchdog presence — "who else is working on this case" — for the three UIs:

| consumer | gets | engine |
|---|---|---|
| CMS Classic frameset shell | `dist/cms-augmentation/client-classic-unstable.js` | document mode **5** |
| CMS Modern (`/viewer/`), DCF (`/dcf/`) | `dist/cms-augmentation/client-modern-unstable.js` | document mode 11 |
| the web components | `dist/esm/index.js` (+ `esm.d.ts`) | modern bundler |

The two legacy clients register over JSONP and draw their own banner. The web
components hold a SignalR connection per section and share everything else from
`core/`: section ids (`CCPSections`), the roster (`CCPRoster`, one per connection),
the kinds config may name (`CCPKinds`) and what the banner says (`CCPView`).

Everything under `dist/` and
`types/` is generated: edit the sources and run `./build.sh`.

## Layout

```
core/          all three UIs · document mode 5 floor · built into the ESM
  util.js        CCPUtil         what mode 5 lacks: indexOf, find, hasSuffix, pad, stamp
  kinds.js       CCPKinds        CASE, CASE_REVIEW, VICTIM_WITNESS, DEFENDANT
  environment.js CCPEnvironment  which CMS instance (CIN suffix on the wire)
  sections.js    CCPSections     section id / key (they must agree)
  roster.js      CCPRoster       snapshots in, who is present out, version-guarded
  people.js      CCPPeople       one row per person
  view.js        CCPView         what a banner shows: who, the summary, a line per person
  apps.js  section-names.js  joined.js  content.js   the words
  section-rules.js               which sections interrupt (web components only)
  wire.d.ts                      the API's wire shapes (hand-written)
legacy/        Classic + Modern only · document mode 5 floor
  jsonp.js       CCPJsonp        the transport, with pooled callback names
  sessions.js    CCPSessions     one session per section: create, heartbeat, poll, remove
  locator.js     CCPLocator      detectors in, active sections out
  viewer.js      CCPViewer       whoami: identity, CMS instance, token age
  preview.js     CCPPreview      the preview flags
  origin.js      CCPOrigin       which host serves our endpoints
  log.js         CCPLog          the ring buffer behind __ccPresence.dump()
  client.js      CCPClient       the loop both apps are built on: one pass, the roster, __ccPresence
apps/classic/  document mode 5 · kill-switch, dom, sections, stripe, main, auth
apps/modern/   document mode 11 · sections (URL detectors), bar, main
placeholders/  the permanent hello-world stubs (see Deploy)
bundles.json   which files go into which output, in order
```

Tests sit beside the file they test (`roster.test.js` next to `roster.js`).

## How a client fits together

```
find sections   per app      Classic reads frames and hidden fields; Modern reads the URL
loop            legacy/      CCPClient: read the sections once a pass, register, redraw
sessions        legacy/      hold one session per section, poll the roster
roster          core/        who is present, per section, version-guarded
view            core/        CCPView: who to show and the words, the same in all three UIs
draw            per app      a stripe in Classic, a bar in Modern, a notification on the web
```

To support a new section, add a detector: a URL pattern in `apps/modern/sections.js`,
or a frame fragment plus a reader in `apps/classic/sections.js`. Nothing else changes.

## Building

`build.sh` runs `build.js`, which reads `bundles.json`, checks every source against
its floor, type-checks, and concatenates:

- **Modern**: one strict IIFE of `core` + `legacy` + `apps/modern`.
- **Classic**: the kill switch, then a presence IIFE (`core` + `legacy` +
  `apps/classic`), then the auth IIFE. Two IIFEs so a failure in one concern cannot
  reach the other. No `"use strict"`: it has always run sloppy in someone else's app.
- **ESM**: `core` plus an export list.

Concatenation, not modules: the injected script has no loader and mode 5 has no
module system. Each file declares one `CCP*` namespace with `var`, because tsc
infers properties within a file but not across files.

## The floor

`core/` and `legacy/` run in Classic, so they are held to **document mode 5**. Nothing
transpiles that low (TypeScript dropped ES3; Babel cannot conjure `JSON` or
`Array.prototype.forEach`), so it is hand-written and proven:

```bash
node check-syntax.js es3 core/*.js legacy/*.js   # ES3 syntax + a denylist of the ES5 runtime
node check-syntax.js es5 apps/modern/*.js        # syntax only
```

## Types

tsc type-checks `core/` and `legacy/` from their JSDoc and generates
`types/common.d.ts`. That references the wire shapes without defining them, so
`types/index.d.ts` is `core/wire.d.ts` followed by the generated file. Nothing is
emitted into the shipping path. `esm.d.ts` is the hand-written module surface the
web components import; keep it in step with `bundles.esm.exports`.

## Tests

```bash
./test.sh                 # every *.test.js
node core/roster.test.js  # one file
```

`test-harness.js` loads the same files the build does (`h.bundle("classic")`), with
small `window`/`document` fakes. A test that needs more fakes is a sign the code
reaches too far into the host page.

A known, unfixed bug is pinned with `h.knownBug(name, fn)`: `fn` asserts the correct
behaviour, the test passes while it fails, and it fails once the bug is fixed, so the
fix has to make it a normal `test()`.

## Relative URLs resolve against the page

A relative path in an injected script resolves against the host page, not the
script's own host. `CCPOrigin.resolve(path)` prefixes `CCPOrigin.IMPL_ORIGIN`, which
ships as `""` (same origin, right for every CI deploy) and is rewritten by
`deploy.local.sh` only for cross-domain deploys. That script matches the exact line
`CCPOrigin.IMPL_ORIGIN = "";` — keep it byte-identical.

## Why JSONP

Cross-origin XHR in this estate is gated by IE zone setting 1406; `<script src>` is
not. The njs adapter (`/global-components/presence-jsonp`) turns each GET into the
Watchdog's REST call and adds the bearer from the presence cookie and
`X-Watchdog-App-Name`, so the clients carry no credential. The app name **must** be
sent (`"CMS Classic"`, `"CMS Modern"` — DCF included): the adapter defaults a missing
one to `"CMS Classic"`.

## Deploy

CI and `infra/proxy/scripts/deploy.local.sh` publish the same four blobs under
`cms-augmentation/`, named as in `dist/`:

| blob | contents | linked by |
|---|---|---|
| `client-classic.js`, `client-modern.js` | hello-world stub, every environment, prod included | the CMS maintainers |
| `client-classic-unstable.js`, `client-modern-unstable.js` | the built clients | our proxy's `sub_filter` injections |

The stubs let the maintainers link the URLs before we are ready. The reveal is
dropping `-unstable` from the injected `src` in
`infra/proxy/config/global-components.cms-augmentation/` — no rebuild. `-unstable` is
unlinked, not secret: the container is publicly listable.

**Rollback** is reverting that conf: the historic `cms-auth-v2-client.js` /
`cms-presence-client.js` blobs are written by no deploy and still hold the
pre-switch clients. **Order**, if both move: clients first, conf second.

## Diagnostics

Both legacy clients expose `window.__ccPresence`. `__ccPresence.dump()` returns the
last 300 log lines (addresses masked) as one string — the console in this estate is
IEChooser's, which cannot attach before boot.

The same shape in both (built by `legacy/client.js`):

```
status() sections() sessions()      what is registered, and how each session is doing
roster() rosterBySection()          what the banner says (unmasked: console only), and the raw rosters
whoami() refreshWhoami()            identity, CMS instance, token age
preview() refreshPreview()          the preview flags; setCountSelf(true|false|null) overrides one
dump() messages()                   the log
setConsole(on) setVerbose(on)       echo the log; log every heartbeat
reconcile() start() stop()          run a pass now; stop leaves every section
stripe()  (Classic)  location()  (Modern)
```

The `verboseLogging` preview flag turns the console echo on.
