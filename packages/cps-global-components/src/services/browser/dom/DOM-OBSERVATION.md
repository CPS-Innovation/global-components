# DOM Observation

All DOM observation in the component is consolidated through `initialiseDomObservation`
(`src/services/browser/dom/initialise-dom-observation.ts`), wired up in
`src/global-script.ts`. Each feature is a `DomMutationObserver` "subscriber" passed into
`initialiseDomObservation(...)`. Every subscriber runs through the [`arrive`](https://github.com/uzairfarooq/arrive)
library with `{ fireOnAttributesModification: true, existing: true }`.

> **Note:** This covers the subscribers registered with `initialiseDomObservation`. Other
> MutationObserver-style watching exists elsewhere (e.g. `initialiseRequestObservationShim`,
> tab-title, `initialiseDarkReaderDetection`) and does **not** go through this layer. Dark-reader
> detection in particular uses a raw `MutationObserver` by design — see the efficiency note below.

## Subscribers

| # | Subscriber | Selector(s) | Enabled when (`isActiveForContext`) | Effect | Disposes (handler → `true`) |
|---|-----------|-------------|--------------------------------------|--------|------------------------------|
| 1 | **domTagMutationSubscriber** | per-context `cssSelector`(s) | `!!context.domTagDefinitions?.length` | Extracts regex-named tags → `mergeTags` into store | Yes — when all tags found |
| 2 | **footerSubscriber** | `footer` | `!!preview.result?.footer` | Injects `<cps-global-footer>`, hides host footer | No (stays bound) |
| 3 | **hostAppEventSubscriber** | per-context `target.selector`(s) | `!!context.hostAppEventTargets?.length` | `appear` → fire analytics now; else one-shot click → fire | Yes — per target after first match |
| 4 | **accessibilitySubscriber** | `html` + `*:not(input)…:not(html):not(body)` | `!!preview.result?.accessibility && !!theme && !forcedColors` | Grey/warm mode: `#grey-mode-styles` + `data-grey-mode`, recolours surfaces/text | `html` sub: yes; per-element sub: no |
| 5 | **witnessAreaSubscriber** | `div[data-block="MainFlow.Witnesses"]` | `enabled && currentHref.includes("/workmanagementapp/caseoverview")` | Injects `<cps-region code="witness">` | No (no-ops if region present) |
| 6 | **skipLinkSubscriber** | per-context `main`/`search`/`list` selectors | `watched.length > 0` (any skip-link selector set) | Records which skip-link targets exist → store | No (kept for SPA re-add) |

## The two-layer gating model

Every subscriber is gated at two independent levels:

- **Layer 1 — `isActiveForContext`** (the factory body, re-run on *every* navigation by
  `initialiseDomForContext`). `true` → its subscriptions bind; `false` → they're unbound for
  that context. This is the "feature on/off" switch.
- **Layer 2 — handler returns `true`** → that single subscription disposes immediately
  (`unBindHandler` → `observer.disconnect()`). This is the "done, stop listening" switch.

## Where each enabling value comes from

| Gating value | Source | How it's set |
|---|---|---|
| `context.domTagDefinitions`, `.hostAppEventTargets`, `.skipLinks`, `.currentHref` | **`FoundContext`** — matched per-URL from `Config.CONTEXTS` (with parent→child inheritance, see `transform-config`) | Authored in the config JSON per context node; present only on contexts that opt in |
| `preview.result?.footer`, `.accessibility` | **`Preview`** — fetched once at startup from the `../state/preview` endpoint (`initialisePreview`) | Preview/feature-toggle state (Zod `PreviewSchema`); booleans, optional → default off |
| `settings.result?.accessibilityBackground` → `theme` | **`Settings`** — user setting (`SettingsSchema`), persisted in a 365-day cookie | `"soft-grey"` \| `"warm"` (legacy `"light-grey"` coerced to `"soft-grey"`); `undefined` = feature off |
| `forcedColors` | **Runtime** — `window.matchMedia("(forced-colors: active)")` | Windows High Contrast Mode; when active it *disables* #4 (we step aside) |
| `enabled` (witness) | **`Config.CASE_LOCKING_API_URL`** | `initialiseCaseLocking` returns `createWitnessAreaSubscriber(true)` only if the URL is configured; otherwise `(false)` makes it permanently inert |

## Notable interactions

- **#4 has a compound gate**: needs *both* a preview flag (`accessibility`) *and* a user setting
  (`accessibilityBackground`), *and* must not be in forced-colors mode. Three independent sources
  must agree.
- **#5 is double-gated**: a config/env switch (`CASE_LOCKING_API_URL`) baked in at init, *plus* a
  per-navigation URL check (`currentHref`).
- **#1, #3, #6 are config-driven** purely by whether the matched context declares the relevant
  array/object — no flags, no preview, no settings.
- **#2 has the simplest gate**: a single preview boolean.
- `accessibility` also has a *separate* feature-flag path — `feature-flags.ts` treats
  `preview.accessibility || isLocalDevelopment` as the enabler elsewhere. The subscriber itself
  only reads `preview.result?.accessibility` directly, so on local dev the subscriber won't
  activate via that flag unless the preview flag is actually set.

## Efficiency note

`arrive` hardcodes its observer config to `{ attributes: true, childList: true, subtree: true }`
rooted at `<html>` (it retargets `document`/`window` to `document.documentElement`). That means
**every** subscriber's underlying `MutationObserver` wakes on every node insertion/removal and
every attribute change anywhere in the document while it is bound — the per-handler selector only
gates the *effect*, not the wake-ups. Subscribers that never dispose (#2, #6, and #4's per-element
subscription) keep a document-wide observer alive for the whole page lifetime.

This is acceptable here because every subscriber above genuinely needs descendant-arrival
detection (waiting for an element matching a selector to *appear* in the tree), which is exactly
what `arrive` is for — and each is gated to a narrow, opt-in population. **Dark-reader detection
deliberately does not use this layer**: it only needs `<html>`'s own attribute changes on a
single, always-present element, yet it would be enabled for *every* user. Routing it through
`arrive` would give every user a document-wide observer for no benefit, so it uses a raw
`MutationObserver` with `{ attributes: true }` (no `childList`/`subtree`) instead — see
`services/dark-reader-detection/initialise-dark-reader-detection.ts`.
