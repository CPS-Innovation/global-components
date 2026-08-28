# cms-presence-client — presence for the legacy CMS apps

Source for **both** injected clients. One build, two artefacts, one shared core:

| artefact | injected into | engine | sections |
|---|---|---|---|
| `cms-presence-client.js` | CMS Modern (`/viewer/`), DCF (`/dcf/`) | document mode 11 | `<caseId>:CASE`, `<caseId>:CASE_REVIEW` |
| `cms-auth-v2-client.js` | the CMS Classic frameset shell | document mode **5** | `:VICTIM_WITNESS:<id>`, `:CASE_REVIEW`, `:DEFENDANT:<id>` |

Both register against the case-locking API over JSONP and show who else is on the
case. The Classic artefact also carries the contact-edit event sink and the auth
iframe hand-off, which have nothing to do with Modern.

App names — `"CMS Modern"` (covering DCF too: one app in users' minds) and
`"CMS Classic"` — **must** be sent, because the njs adapter defaults a missing
`appName` to `"CMS Classic"` and would mislabel Modern.

> `cms-auth-v2-client.js` one level up is **generated**. It was a hand-edited
> single file until 2026-08-28; edit the sources here and run `./build.sh`.

## Layout

```
common/   shared with the Classic client — DOCUMENT MODE 5 floor
  presence-sections.js   CCPSections: section id + key (they must agree)
  presence-origin.js     CCPOrigin: which host serves our endpoints
  presence-roster.js     CCPRoster: reconciliation by version, per-user dedupe
  presence-jsonp.js      CCPJsonp: the JSONP call, with pooled callback names
  presence-locator.js    CCPLocator: detectors in, active sections out
  presence-sessions.js   CCPSessions: a session per active section, and the
                         failure semantics (410, timeout, create retry)
  *.test.js              unit tests, beside the file they test
  types.d.ts             the API's wire shapes (hand-written: they describe the
                         SERVER's contract, so there is nothing to infer them from)
types/    GENERATED — do not edit
  common.d.ts            tsc's output: our functions, inferred from the JSDoc
  index.d.ts             THE PUBLISHED FILE: wire shapes + our functions, merged
classic/  CMS Classic only — document mode 5, so the SAME floor as common/
  dom.js                 reading CMS's own state: hidden fields, frame walking
  sections.js            the frame readers, and the section registry
  banner.js              the menu-bar icon, its popup, and the tooltip
  event-sink.js          contact-edit events, and the parked HTTP helpers
  main.js                the observation loop and wiring
  auth.js                concern 2: the login -> auth iframe hand-off
  *.test.js              unit tests, beside the file they test
modern/   Modern/DCF only — document mode 11, ES5 floor
  sections.js            the URL detectors, and the JSONP base
  bar.js                 the GDS presence bar
  main.js                wiring, diagnostics, boot
  *.test.js              unit tests, beside the file they test
check-syntax.js          the floor gate (see below)
test-harness.js          load() + assertions for the tests
cms-presence-client.signalr.src.js   reference SignalR client, not shipped
```

## How a client is put together

Four layers, and the middle two are shared with Classic:

```
locator    "which sections am I in?"      app-specific detectors, shared runner
sessions   "hold one session per section"  common/  — create, heartbeat, poll, remove
roster     "who is present?"               common/  — reconciled by version, deduped
UI         "show it"                       app-specific (a GDS bar here, a menu-bar
                                           icon in Classic)
```

**Transport is JSONP**, the same as Classic — one mechanism for both legacy apps.
A working SignalR transport is archived, with rehydration instructions, under
[`infra/proxy/reference/signalr-presence-transport/`](../../../reference/signalr-presence-transport/).
It was retired on merit, not on feasibility: cross-origin SignalR is *proven* to
work in this estate.

**Sections are plural.** A user can be on a case review and have a defendant panel
open at the same time, and both are reported. Both clients used to return the first
match and stop.

**To support a new section, add a detector.** In `modern/sections.js` that is a URL
pattern and nothing else, because there the address is the whole context. In
`classic/sections.js` it is a URL fragment (which frame) plus a reader (is it
active, and for which subject), because Classic has no addressable state. Either
way nothing else changes — not the sessions, not the roster, not the UI.

**Detector order is priority.** Classic's banner is about one case and anchors its
popup to one frame, so it follows the first section found.

```js
__ccPresence.status()          // location, active sections, session stats
__ccPresence.describeRoster()  // who is present, across all sections
__ccPresence.rosterBySection() // the same, grouped
```

## Building

`build.sh` concatenates `common/` then `modern/` into one IIFE. Each common module
declares its own `CCP*` namespace — one per file, not one shared — because tsc
infers expando properties within a file but not across files, and that inference is
what generates the types below. Concatenation rather than modules because the
injected script has no loader and document mode 5 has no module system, so **order
matters**: `presence-sections` defines what the others use.

## Types without a compile step

`common/` is plain JavaScript, but tsc type-checks it from its JSDoc (`checkJs`)
and **generates** `types/common.d.ts` from it. Nothing is emitted into the shipping
path — the deployed file is still the file you wrote, which matters when the only
way to debug an IE-mode tab is to fetch the deployed bytes and read them.

```bash
../../../../../node_modules/.bin/tsc -p .    # check + regenerate (build.sh does this)
```

Two halves make up the published `types/index.d.ts`, and the split is not arbitrary:

| | `common/types.d.ts` | `types/common.d.ts` |
|---|---|---|
| describes | the **server's** wire contract | **our** functions |
| written by | hand | tsc, from the JSDoc |
| why | nothing in our code constructs these shapes — we only consume them, so there is nothing to infer from | inferring beats maintaining |

tsc's output *references* `CCPSection`, `CCPNotification` and `CCPPerson` without
defining them, so it is not usable alone. `build.sh` concatenates the two into
`types/index.d.ts` — one self-contained file for consumers.

Generated rather than hand-written so the published surface cannot drift:

```ts
declare namespace CCPSections {
    function sectionId(caseId: string|number|null|undefined, kind: string|null|undefined,
                       subjectId?: (string|number|null)|undefined): string | null;
    function sectionKey(section: CCPSection|null|undefined): string;
}
```

It earns its keep already: it caught an unsound `window[name] = fn` (the DOM lib
types a string index on `Window` as a named frame) and a real latent case where an
unversioned snapshot reached `parseInt(undefined)`. Both are now explicit and
commented rather than accidental.

TypeScript *sources* were considered and rejected for this folder: `--target ES5`
emit is mostly fine, but object spread pulls in `Object.assign` via `__assign` and
accessors emit `Object.defineProperty` — neither exists at document mode 5 — and
the emitted output is harder to read in the field. JSDoc gives the types without
either cost.

## The floor, and why it is enforced rather than compiled

`common/` runs in Classic too, so it is held to **document mode 5** — old JScript.
Nothing transpiles down that far: TypeScript **removed** its ES3 target (`TS5108`),
esbuild's floor is a partial `es5`, and Babel can lower syntax but cannot conjure a
missing `JSON`, `Array.prototype.forEach` or `Object.keys`. So the floor is written
by hand and proven mechanically:

```bash
node check-syntax.js es3 common/*.js     # ES3 syntax + a denylist of the ES5 runtime
node check-syntax.js es5 modern/*.js     # syntax only
```

`build.sh` runs both **before** assembling, so a violation fails the build naming
the file and line, rather than surfacing as a blank page in an IE-mode tab. It uses
acorn, already present for the existing ES5 gate — no new tooling, no config file.

Transpiling *up* is free: ES3 is valid ES2022, so `common/` can be consumed as-is
by a modern build. That is the route to sharing the reconciliation logic with
global-components' TypeScript service — the same "who is present" rules, written
once. Moving `common/` into `packages/` is then a lift-and-shift.

## Tests

```bash
./test.sh          # every *.test.js, colocated with the file it tests
node common/presence-roster.test.js   # or just one
```

Also run by `pnpm test` in `infra/proxy`, alongside the njs suites.

Colocated deliberately: these are unit tests of small modules, and what you want
when you open `presence-roster.js` is `presence-roster.test.js` beside it. The
proxy's njs suites live under `tests/` because they need a bundler; these need
nothing but node.

`test-harness.js` rebuilds the concatenated scope exactly as `build.sh` does —
same files, same order — so the tests exercise the real composition rather than a
stand-in, and supplies the small `window`/`document` fakes the transport needs. If
a test ever needs more of those fakes, treat it as a signal that the code is
reaching further into the host page than a guest script should.

`build.sh` does not run the tests: a build should not depend on a test pass, and
the floor checks it *does* run answer a different question — whether the code can
execute at all.

## Relative URLs resolve against the PAGE, not the script

Worth stating plainly, because it is the trap in this topology: a relative path in
an injected script resolves against the host document. `"/global-components/presence-jsonp"`
in a file fetched from `polaris-uat-notprod`, injected into a CMS page served by
`polaris-qa-notprod`, resolves to **QA** — the page's origin. Deploying the script
elsewhere changes nothing; the page decides.

`CCPOrigin.resolve(marker, path)` finds our own `<script>` tag and takes its origin
instead, falling back to the relative path when page and endpoints share a host.
Both legacy clients need this the moment the UI and the API are on different
domains — and the auth flow needs it most, because the callback sets the presence
cookie HOST-ONLY, so the auth iframe must land on the same host as the API or the
adapter never sees the cookie.

## Why JSONP and not SignalR

The SignalR client works proxied but cannot work unproxied: negotiate is an XHR,
Windows zone setting 1406 answers a cross-domain XHR with a security dialog, and
skipping negotiate removes the client from Azure SignalR Service's delivery path —
you can invoke but never receive. JSONP uses `<script src>`, which the zone does
not gate, so it works in both topologies. Classic already relies on it and must be
supported long-term, so both legacy apps now share one transport, the injected
script drops from ~154KB to ~24KB, and no end-of-life dependency ships to
production. The current apps stay pure SignalR.

## Build

```bash
./build.sh           # the JSONP client — what ships
./build.sh signalr   # the reference SignalR bundle
```

Both write `../cms-presence-client.js`, so nginx and the deploy script never change.
The client carries no credential: the njs adapter lifts the bearer from the presence
cookie and adds `X-Watchdog-App-Name`.

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
