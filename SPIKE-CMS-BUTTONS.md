# SPIKE — controlling the CMS Classic P / C / M buttons

Research only. Nothing is implemented. Written 2026-11-13.

**Question.** Can the Classic watchdog client (`client-classic-unstable.js`) take over the row of
app-launch buttons in CMS Classic's yellow menu bar? That means three things:

- hiding the existing buttons;
- inserting our own, with control over how they look and where they launch;
- choosing which buttons a user sees, and where they point, from that user's Entra group
  membership.

**Short answer: yes, entirely client-side, with no proxy change.** The menu bar is plain,
same-origin DOM in a frame our top-frame script can already reach. The old `banner.js` used to put
a cell into this exact row. The reader's groups already reach the Classic client through whoami.

Two things are not ready yet:

- **Plumbing.** Whoami has to move to its `/whoami` sub-path, or groups always come back `[]`.
  Group-name → GUID config (`LEGACY_UI`) doesn't exist yet.
- **Flicker.** The native buttons show until our next pass, which is up to 2 seconds as things
  stand. It can be cut a lot. Removing it entirely needs the button owners to stop rendering their
  buttons, and both owners can do that with small changes (see §5, option D).

---

## 1. What is there today

Sources: `not-tracked/hars/3-vic-wit.har` (QA, 2026-07-15), cross-checked against
`classic-failed-intra-post-refactor.har` (2026-10-01, the same `uainMenuBar.js` version hash
`e23bf907…`), and Polaris `origin/development` @ `7ab1cc468`, file
`polaris-terraform/main-terraform/proxy/config/features/cms-proxy/` (abbreviated `cms-proxy/` below).

### The three buttons

Your recollection was nearly right. **No button is purely native, and only M is purely inserted.**
P and C are native CMS code that Polaris's proxy modifies on the way through. M is added outright by
Polaris. Polaris uses two techniques: an njs `js_body_filter` and an nginx `sub_filter`.

|       | Alt text (tooltip)         | Rendered by                                                                                                                                                                          | How Polaris touches it                                                                                                                                                                                                                                  | Opens                                                                                                                               |
| ----- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **P** | `Launch Casework App`      | Native `buildMenus()` in `uainMenuBar.js`, shown only if `MENU_BAR_POLARIS_LOGO` and `POLARIS_URL` are non-empty                                                                     | **njs body filter** `cmsMenuBarFilters` (`cms-proxy.js:16-39`). Swaps `frameServerJS.POLARIS_URL` for the literal `"/polaris"`, and `MENU_BAR_POLARIS_LOGO` for a data-URI "P" icon.                                                                    | Native `openPolaris()`: `window.open("/polaris?q=" + encodeURIComponent('{"caseId":N}'))`, or plain `/polaris` when there's no case |
| **C** | `Launch Casework Homepage` | Native `buildMenus()`, shown only if `MENU_BAR_CASEWORK_TOOLS_LOGO` (`../Noexpiry/Images/uaimCWTools.png`) and `CASEWORK_TOOLS_URL` are non-empty                                    | **sub_filter** on `uainGeneratedScript.aspx` (`cms-proxy.conf:25-60`). Rewrites `var CASEWORK_TOOLS_URL = '…/launch/cinN'` to `…/launch/cinN-proxy`, one hard-coded line per environment. QA's cpt/cmo lines cross over to the UAT host, a known smell. | Native `openCaseworkTools()`: `window.open(CASEWORK_TOOLS_URL + "?q={caseId}")`                                                     |
| **M** | `Launch Materials`         | **Polaris only.** The same njs filter splices a `<td class="menu"><a onclick="openMaterials();return false;"><img …></a></td>` in before `var sMenuBarRight` (`cms-proxy.js:34-37`). | A **sub_filter** on `uainMenuBar.js` (`cms-proxy.conf:84-107`) prepends a whole `openMaterials()` function before `function openPolaris() {`                                                                                                            | `window.open("/materials?caseId=N")`, or plain `/materials`                                                                         |

Images: P and M are 24×24 data-URI PNGs in `cms-proxy.js`. C is the CMS-hosted `uaimCWTools.png`.

There are two more launch points nearby that aren't part of the row of three but are worth knowing
about:

- **Cell 0 of the row** is the native CPS logo (`MENU_BAR_LOGO`). It opens Modern CMS for
  `SESSION_MODERN_USER`s and the intranet for everyone else. Leave it alone.
- **"Open in Manage Materials"** is a white text link in `#trTitleBar` on the case tabs page. It's
  added by `/polaris-script.js`, which Polaris injects into `uacdCDTabs.aspx` via
  `sub_filter '</html>'` (`cms-proxy.conf:120-136`). It's a third Polaris technique, and the same
  mechanism could take it over if wanted.

History, for context: M arrived in Polaris `cd42d1cf2` (Feb 2026, alongside a since-removed "Task
List" button). It was env-gated (non-prod only) in `ed7349c38`, then went to `?caseId` only
("redirect to case details") in `f22da0e6b`. The July HAR has an older `openMaterials` that also
scraped a URN. Current Polaris sends caseId only. **Capture a fresh HAR before building**, because
the HARs we have predate the current Polaris generation.

### Where the menu bar lives

`buildMenus()` returns an HTML string, and `displayMenuBar()` writes it into
`<span id="spnMenuBar">` with `innerHTML`. **Each content page does this itself, at every page
load.** It isn't a persistent toolbar frame. Pages seen including it:

| Page                           | Frame                                                                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Tasks/uatlTaskList.aspx`      | `frameMain`                                                                                                                                   |
| `Support/uacfSearchCases.aspx` | `frameMain`                                                                                                                                   |
| `Case/uacdCDTabs.aspx`         | `frameTabs`, inside `frameMain` = `uacdCaseDetails.aspx` (frameset `fmsReview`: `frameTabs` / `framePage` / `framePullUp` / `frameActionBar`) |

The DOM is `span#spnMenuBar > table > tr.menuBar > td.menu…`. Cell 0 is the logo, followed by P, C
and M, then the menu words (`MenuCMS`, `MenuLegalLinks`, …). Everything is on the proxy origin, so
it's same-origin with our top-frame script.

**The case ID is a page global in the menu bar's own frame.** The native handlers read
`iScreenCaseID`, then `iCaseId`, then `m_iScreenCaseID`, in that order. On `uacdCDTabs.aspx` that's
`var iScreenCaseID = 2194728` and `var iCaseId = 2194728`, and `sURN` is there too. On the task list
and search pages there's no case, so native buttons open their bare URL. Ours would read the same
globals from the same frame window, so they'd behave exactly like the native ones.

---

## 2. What we already have

- **A loop in the right place.** `legacy/shared/client.js` runs `reconcile()` every
  `CCPClient.PASS_MS = 2000` and calls the app's `afterPass` at the end of each pass. The stripe
  uses it to repair itself after CMS replaces a frame (`presenceRefreshStripe`), and the buttons
  need exactly that repair.
- **Prior art for writing into this row.** `legacy-apps/classic/banner.js` (deleted in `40ec70b2`;
  read it with `git show 40ec70b2^:packages/cps-global-presence/legacy-apps/classic/banner.js`)
  found `tr.menuBar` by walking frames, did `row.insertCell(…)` with `className = "menu"`, and made
  the insert idempotent with an element id. That shipped in IE mode, so the mechanics are proven.
- **Frame helpers.** `legacy/classic/dom.js` has `presenceFindFrameByName`, `classHas`,
  `findElByClassInDoc`, `getEl`, `MAXDEPTH`. They're all safe at document mode 5.
- **Groups.** `CCPViewer` (`legacy/shared/viewer.js`) exposes `groups()` and `inGroup(id)`. They're
  lower-cased, shape-checked, `[]` until whoami answers, and fail closed.
- **The proxy side of groups is done.** `= /global-components/presence-jsonp/whoami`
  (`global-components.watchdog.conf:112`) verifies `cps-handover-claims` and answers
  `groups` + `groupsFrom`. It's live on QA, with the Polaris callback half hand-patched (see
  `infra/proxy/polaris-pending/README.md`, which also says any Polaris deploy to QA erases the patch).

### Gaps to close before groups do anything

1. **The client still calls whoami on the base path.** `legacy/shared/jsonp.js:107` builds
   `base + "?op=whoami"`. The claims cookie is `Path=…/whoami`, so it isn't sent there, and
   `groups` comes back `[]` with `groupsFrom: "no-cookie"`. This is the "legacy clients" step left
   over from RPLT-246.
2. **No `CCP_CONFIG` or `LEGACY_UI`.** Nothing in `build.js`, the CI workflows or
   `cps-global-configuration` has been built yet. For the spike, hard-code the rules in the
   spike file (QA GUIDs). For real, bake them as RPLT-246 planned (§4).
3. **The kill switch.** Everything in `main.js` sits behind `CMS_WATCHDOG_ENABLED`, and the viewer
   lives inside `CCPClient`. Buttons that piggyback on the client would switch off with presence.
   That's fine for a spike. Longer term it's a product decision whether button control is "the
   watchdog" or its own switch.
4. **`CCPClient` doesn't hand the viewer to the app.** `afterPass()` takes no arguments, and only
   `__ccPresence` diagnostics expose `groups`. This needs a one-line change: pass `viewer` (or
   `viewer.groups()`) to `afterPass`, or add an `onPass(viewer)` option.

---

## 3. The mechanism

A new `legacy/classic/buttons.js`, added to the `classic` group in `bundles.json` (es3 floor) and
called from `main.js`'s `afterPass`.

**Licence note.** `dom.js` describes itself as _pure observation_: it never patches CMS functions or
variables. The stripe already writes DOM, but only its own elements. Hiding CMS's cells is the first
time we would alter **CMS's own** DOM. Keep that in `buttons.js`, never in `dom.js`, and keep it
non-destructive: `style.display = "none"`, never removal, and never wrap
`displayMenuBar`/`buildMenus`/`open*`.

Each pass:

1. **Find every menu bar.** Walk same-origin frames from `window.top` and look for
   `getElementById("spnMenuBar")`. It has an id, so this is cheap. Avoid the `banner.js` approach of
   scanning every element for `class=menuBar` with `doc.all` in every frame on every pass. In
   practice there's one bar, but handle more.
2. **Skip bars already handled.** If our marker cell id (e.g. `ccButtonsMarker`) is in that
   document, the page hasn't re-rendered, so stop. Because `displayMenuBar()` replaces the whole
   span on each page load, a missing marker reliably means "new page, apply again".
3. **Hide the natives.** Find the `tr.menuBar` inside the span. Hide any `td` whose `innerHTML`
   matches `/open(Polaris|CaseworkTools|Materials)\(/`. Match on the handler name, not alt text or
   position: alt text is user-facing and could change, and the position moves when a button is
   conditionally absent. M's handler is on an `<a>` in current Polaris but was on the `<img>` in
   July; this match covers both.
4. **Insert ours.** For each button the rules give this reader, `row.insertCell(n)` after the logo
   cell, with `className = "menu"`. Inside it, put an `<a href="#">` holding either an `<img>`
   (data URI, or a URL resolved via `CCPOrigin`) or `innerText`, never `innerHTML` for
   config-supplied text.
5. **Launch.** Assign `onclick` as a property (mode 5 has no `addEventListener`). The handler reads
   the case ID from **the bar's own frame window** (`iScreenCaseID || iCaseId || m_iScreenCaseID`),
   builds the URL, then calls **that frame's** `open(url[, target])` and `focus()`, and returns
   `false`. Calling the frame's `open` means relative URLs resolve against the proxy origin exactly
   as the native ones do, and it happens inside the user's click, so the popup blocker allows it.
   Copy the native buttons' keyboard support (`tabindex`, Enter/Space), which an `<a href>` gives
   us for free.

The order of the steps matters for failure behaviour, which this spike doesn't need to settle:
"hide natives" can be made conditional on "we have rules and groups to put in their place".

### Console probe (step 0 of the spike)

This proves hide-and-insert in the real IE-mode estate before any code is written. Paste it into
IEChooser's console in the **top Classic frameset shell**, on a case page. It hides P, C and M, then
inserts a red "Spike" link that opens `/materials` with the current case ID, using the native
lookup. It's mode-5 safe. Navigating CMS re-renders the bar, so expect the natives to come back;
that re-render is what the loop handles.

**Keep the `prettier-ignore` markers on every probe block.** Prettier adds trailing commas to
function-call arguments, and those are a **syntax error at document mode 5**, so the pasted probe
would fail.

<!-- prettier-ignore -->
```js
(function () {
  var hits = [],
    out = [];
  function walk(w, d) {
    if (d > 16) {
      return;
    }
    var doc;
    try {
      doc = w.document;
    } catch (e) {
      return;
    }
    var s = null;
    try {
      s = doc.getElementById("spnMenuBar");
    } catch (e1) {}
    if (s) {
      hits.push({ w: w, s: s });
    }
    var f;
    try {
      f = w.frames;
    } catch (e2) {
      return;
    }
    for (var i = 0; i < f.length; i++) {
      walk(f[i], d + 1);
    }
  }
  walk(window, 0);
  if (!hits.length) {
    return "no spnMenuBar in any same-origin frame";
  }
  for (var h = 0; h < hits.length; h++) {
    var w = hits[h].w,
      doc = w.document,
      trs = hits[h].s.getElementsByTagName("tr"),
      row = null;
    for (var t = 0; t < trs.length; t++) {
      if (trs[t].className === "menuBar") {
        row = trs[t];
        break;
      }
    }
    if (!row) {
      out.push((w.name || "(top)") + ": no tr.menuBar");
      continue;
    }
    var hid = [];
    for (var c = 0; c < row.cells.length; c++) {
      var m = row.cells[c].innerHTML.match(
        /open(Polaris|CaseworkTools|Materials)\(/
      );
      if (m) {
        row.cells[c].style.display = "none";
        hid.push(m[1]);
      }
    }
    if (!doc.getElementById("ccSpikeBtn")) {
      var td = row.insertCell(1);
      td.className = "menu";
      var a = doc.createElement("a");
      a.id = "ccSpikeBtn";
      a.href = "#";
      a.innerText = "Spike";
      a.style.color = "#b10e1e";
      a.style.fontWeight = "bold";
      a.onclick = (function (fw) {
        return function () {
          var cid = 0;
          try {
            cid = fw.iScreenCaseID || fw.iCaseId || fw.m_iScreenCaseID || 0;
          } catch (e3) {}
          var x = fw.open(cid > 0 ? "/materials?caseId=" + cid : "/materials");
          if (x) {
            x.focus();
          }
          return false;
        };
      })(w);
      td.appendChild(a);
    }
    out.push(
      (w.name || "(top)") +
        ": hid " +
        (hid.join(",") || "nothing") +
        "; spike cell in"
    );
  }
  return out.join(" | ");
})();
```

Expected on a case page: `frameTabs: hid Polaris,CaseworkTools,Materials; spike cell in`. Things to
check by eye:

- the gap the hidden cells leave;
- the red link's alignment against the yellow bar;
- the link opening `/materials?caseId=…` in a new window.

---

## 4. Rules: who sees what, pointing where

You said the app only needs to supply the case ID, and everything else comes from our logic. Here's
a shape that keeps that true. Buttons are an ordered list; each has one or more variants, and the
**first variant whose `when` matches the reader wins**. No matching variant means no button. Group
references use names from `LEGACY_UI.groups`, so GUIDs stay in one place, as RPLT-246 planned.

```jsonc
"LEGACY_UI": {
  "groups": {
    "CASE_PRESENCE_CONNECT_TO_BACKEND": "<guid>",
    "CASE_PRESENCE_SHOW_UI": "<guid>",
    "BUTTONS_PILOT_A": "<guid>",
    "BUTTONS_PILOT_B": "<guid>"
  },
  "buttons": {
    "hideNative": ["Polaris", "CaseworkTools", "Materials"],   // handler-name match, see §3
    "items": [
      {
        "id": "materials",
        "title": "Launch Materials",                 // alt + tooltip
        "icon": "data:image/png;base64,…",           // or "text": "M"
        "variants": [
          { "when": { "anyOf": ["BUTTONS_PILOT_B"] }, "href": "/materials-next", "hrefWithCase": "/materials-next?caseId={caseId}" },
          { "when": { "anyOf": ["BUTTONS_PILOT_A"] }, "href": "/materials",      "hrefWithCase": "/materials?caseId={caseId}" }
        ]
      },
      {
        "id": "polaris",
        "title": "Launch Casework App",
        "icon": "data:image/png;base64,…",
        "variants": [
          { "when": "always", "href": "/polaris", "hrefWithCase": "/polaris?q=%7B%22caseId%22%3A{caseId}%7D" }
        ]
      }
    ]
  }
}
```

How this covers your two examples:

- **"User A doesn't see button 1, but user B does":** the button's only variant has
  `anyOf: [B's group]`.
- **"Same button, different URL":** two variants, most specific first.

Rule details:

- `{caseId}` is the only substitution. It's encoded with `encodeURIComponent`, and the
  `hrefWithCase` form is chosen only when the case ID is > 0, matching the native behaviour.
- A `target` per variant is optional. The default is `window.open(url)`, as native P and M do; C
  passes no name, and the Modern logo uses `"MODERN_CMS"`.
- `when` can grow `allOf`/`noneOf` later. The spike only needs `anyOf` and `"always"`.

**The bake.** Do it as RPLT-246 planned: `jq '.LEGACY_UI // {}'` from `config.<env>.json` into a
`var CCP_CONFIG = /*@@CCP_CONFIG@@*/ {};` placeholder that `build.js` emits outside the IIFEs, next
to `CMS_WATCHDOG_ENABLED`. The config schema isn't `.strict()`, so deployed web-component bundles
ignore the new key. **For the spike, skip all this** and hard-code an equivalent object at the top
of `buttons.js` with QA GUIDs.

**Icons as data URIs** (as Polaris does) keep everything in one blob with no extra route. At
24×24 PNG they're only a few hundred bytes each. URLs would need resolving against `CCPOrigin` so
they work cross-domain too.

---

## 5. Timing and flicker

When the bar renders versus when we act:

1. The CMS page loads and `displayMenuBar()` paints the natives immediately.
2. Our next `reconcile()` pass, **0–2 s later**, hides them and inserts ours.

And at session start, before groups arrive:

3. `classic/auth.js` runs the `/init` hand-off, then whoami answers. Until then `groups()` is `[]`,
   so group-gated buttons can't be chosen yet. This happens **once per session**, not per
   navigation, because the viewer caches the answer for the life of the shell.

Options for the first gap, cheapest first:

- **A. Accept 0–2 s.** That's fine for proving the mechanism. It's the current pass rate.
- **B. A separate fast loop just for the bar.** Every ~150–250 ms, run only steps 1–2 of §3
  (`getElementById` per frame plus a marker check), and stop at the first frame that has our
  marker. This is cheap because there's no element scan. It brings the visible gap down to around
  one frame of paint in most cases, but can't reach zero, because CMS paints first.
- **C. Hide at the source, ourselves.** Our own proxy module would add a regex location for
  `uainMenuBar.js` ordered before Polaris's (the vnext technique). It would blank the three cells
  before the browser sees them, giving zero flicker. But we'd be duplicating Polaris's body filter
  for that route, which is exactly the "parallel copies of someone else's code" we've been
  removing, and it's no longer a removable additive client change. **Not recommended**, except as
  the advance copy of a Polaris PR.
- **D. The end state you described:** the owners stop rendering them. Both can do this cheaply,
  because the native code already makes each button conditional:

  | Button | Owner   | Cheapest switch-off                                                                                                                                                                                                                                                                                             |
  | ------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | **C**  | CMS     | Set the `CASEWORK_TOOLS_URL` (emitted by `uainGeneratedScript.aspx`) or `MENU_BAR_CASEWORK_TOOLS_LOGO` setting to `""`. That's a **configuration** change, not a code change: `buildMenus()` already skips the cell when either is empty. Polaris's per-env sub_filters then match nothing, which is harmless.  |
  | **P**  | Polaris | Polaris forces it on by rewriting `POLARIS_URL` and `MENU_BAR_POLARIS_LOGO` to literals. Removing those two `replace`s in `__addAppLaunchButtonsToMenuBar` hands control back to CMS's `POLARIS_URL`, which CMS can then blank the same way as C. Or Polaris rewrites `MENU_BAR_POLARIS_LOGO` to `""` directly. |
  | **M**  | Polaris | Delete the `var sMenuBarRight` splice and the `openMaterials` sub_filter.                                                                                                                                                                                                                                       |

  Under D, the per-pass hiding in §3 turns into a safety net that matches nothing, and only the
  insertion remains. Our code needs no change when they do it.

Recommendation: A for the spike, then the event-driven options in §6 (in place of B if they
work), then D.

---

## 6. Event-driven and pre-paint options

The 2-second loop finds the bar after CMS has painted it. These options try to act **before**
paint, or to keep the bar out of sight until we've acted. One distinction decides which ones can
work: **the `<frame>` elements survive navigations; the documents inside them don't.**

`displayMenuBar()` runs **inline during parsing**: it's called right after `<span id="spnMenuBar">`
near the top of the body. So the bar is visible long before the page's `load` event, and a plain
frame `onload` is too late to prevent flicker. It's better than the 2 s loop, but no more than that.

### 6.1 The synchronous hook: `top.frameData.document`. Try this first.

Straight after drawing the bar, `displayMenuBar()` writes onto a document that never navigates:

```js
document.all("spnMenuBar").innerHTML = buildMenus();
hideMenu();
getMultiWindows();
top.frameData.document.menuWindow = window; // new on every page
top.frameData.document.openPolaris = openPolaris;
// …
```

IE's `onpropertychange` fires **synchronously** when a property is set on a DOM object. If it fires
for this document, our handler runs:

- inside CMS's own script, before the browser can repaint. We'd swap the buttons before the natives
  are ever shown;
- with `menuWindow` set to exactly the frame that holds the bar, so there's nothing to search for.

It stays within the "observe, don't patch" licence: we only attach a listener, and never wrap or
assign a CMS function. The unknown is whether `onpropertychange` fires for a **document** (as
opposed to an element) at document mode 5.

**Probe 1.** Paste this into the top Classic shell, navigate to a case, then run
`top.__btnLog.join("\n")`. The hook works if the output includes
`menuWindow frameTabs:<non-zero length>`, which means the handler ran with the bar already built.

<!-- prettier-ignore -->
```js
(function(){var fd=top.frameData,d=fd.document;top.__btnLog=[];d.attachEvent("onpropertychange",function(){var p="?",bar="";try{p=fd.event.propertyName;}catch(e){}try{var mw=d.menuWindow;var s=mw?mw.document.getElementById("spnMenuBar"):null;bar=s?(mw.name||"?")+":"+s.innerHTML.length:"";}catch(e2){}top.__btnLog.push(new Date().getTime()+" "+p+" "+bar);});return "armed";})()
```

If it works, §3's per-pass work moves into this handler, and the 2 s pass stays as a safety net.

### 6.2 Hide only the bar: a stylesheet rule set at navigation start

The `<frame>` element's `onreadystatechange` reports `"loading"` when a navigation starts. If
`frame.contentWindow.document` is **already the document the parser will fill** at that moment, we
can add `#spnMenuBar { visibility: hidden }` to it with `doc.createStyleSheet().addRule(…)`. After
the swap, setting `visibility: visible` inline on the span shows it again, because an inline style
beats the sheet. `visibility` keeps the layout, so nothing jumps, and id selectors work in quirks
mode.

Two unknowns:

- whether the rule survives (IE may still be holding the old document at `"loading"`, or may
  replace the document when parsing starts);
- whether `"loading"` fires on a `<frame>` at all.

Case pages need a chain: `frameTabs` is created by `frameMain`'s new frameset document, so we can
only attach to it once that document exists. Prove the simple case first.

**Probe 2.** Paste it into the top shell, then navigate **within frameMain without a frameset**
(task list → Find Cases), then run `top.__ssLog.join("\n")`. Success looks like:

- `loading rule added`, followed by `complete sameDoc=true … bar=hidden`;
- the bar visibly missing on the new page.

`sameDoc=false`, or `bar=visible`, means the rule didn't survive. **Reload CMS afterwards**: the
probe hides the bar on every frameMain navigation until the shell reloads.

<!-- prettier-ignore -->
```js
(function(){var fs=top.document.getElementsByTagName("frame"),fe=null,i;for(i=0;i<fs.length;i++){if(fs[i].name==="frameMain"){fe=fs[i];}}if(!fe){return "no frameMain";}top.__ssLog=[];fe.attachEvent("onreadystatechange",function(){var rs=fe.readyState,note="";try{var d=fe.contentWindow.document;if(rs==="loading"){d.createStyleSheet().addRule("#spnMenuBar","visibility:hidden");d.__ccMark=1;note="rule added";}else{var s=d.getElementById("spnMenuBar");note="sameDoc="+(d.__ccMark===1)+" sheets="+d.styleSheets.length+" bar="+(s?s.currentStyle.visibility:"none");}}catch(e){note="err "+e.message;}top.__ssLog.push(new Date().getTime()+" "+rs+" "+note);});return "armed";})()
```

### 6.3 Hide the whole frame element until the swap is done

Because the `<frame>` element survives, we can hide it as soon as a navigation starts (`"loading"`)
without racing the parser, and show it again after the swap.

- **Case pages** (bar in `frameTabs`): that 82px row is being repainted from scratch anyway, because
  `frameMain` reloads the whole `uacdCaseDetails` frameset. A little longer blank should go
  unnoticed. Hiding `frameMain` covers it.
- **Task list and search** (bar in `frameMain` itself): the whole page appears slightly later, but
  in one go with the right buttons. That may be acceptable, but it's the most visible of the three
  options.
- Collapsing the frameset row to 0 instead would reflow the neighbouring frames, which is worse
  flicker than the buttons. Don't.

The unknown is whether IE honours `style.visibility` on a `<frame>` inside a frameset; frames ignore
a lot of CSS.

**Probe 3.** Paste into the top shell. `frameMain` should vanish for 2 s and come back.

<!-- prettier-ignore -->
```js
(function(){var fs=top.document.getElementsByTagName("frame"),i;for(i=0;i<fs.length;i++){if(fs[i].name==="frameMain"){var f=fs[i];f.style.visibility="hidden";window.setTimeout(function(){f.style.visibility="";},2000);return "frameMain hidden for 2s: did it vanish?";}}return "no frameMain";})()
```

### 6.4 Rules that apply to every option

- **Anything that can hide early enough could also swap early enough.** Hiding only helps where we
  can get in **before the content exists but not after it's drawn**, and the surviving frame element
  (6.3) is the one place where that's true. If 6.1 works, hiding is unnecessary.
- **Blanking is the worst way this can fail.** We're a guest script, and a hidden bar or frame that
  never comes back makes CMS look broken. So:
  - every hide gets a **failsafe that always shows it again** after about 1 s, whatever happens;
  - only hide **once we have something to show**: rules loaded and groups known. A reader with no
    groups yet sees the native buttons, not a blank.
- **Keep the 2 s pass as the safety net** for frames opened in unusual ways or navigations we fail
  to hook.
- **IE leaks `attachEvent` closures across frames.** Detach on the frame's unload, as `main.js`
  already does for the client.

**Probe order:** 6.1, then 6.2, then 6.3 as the fallback.

---

## 7. Spike plan

1. **The console probes:** §3 on QA in IE mode, on the task list, search and a case page. It proves
   we can find, hide and insert, and that `open` launches from the frame. **This is the go/no-go.**
   In the same session, run probes 1–3 from §6 to choose the timing strategy.
2. **Move whoami to the sub-path.** Change `jsonp.js` (or the viewer's call) to hit
   `/global-components/presence-jsonp/whoami`. Confirm `__ccPresence` shows `groups.length > 0`,
   with `groupsFrom: "cookie"` in the whoami answer. Check first that the Polaris hand-patch is
   still on QA.
3. **`legacy/classic/buttons.js`** with hard-coded rules (§4 shape, QA GUIDs). Wire it through
   `afterPass`, passing the viewer (gap 4). Add unit tests alongside the existing `main.test.js`
   harness.
4. **Deploy the classic blob to QA** with `deploy.local.sh`. Try two accounts in different groups
   and check they see different buttons, and different URLs for the same button.
5. **Look at the flicker.** Wire in whichever §6 option the probes proved, or §5 option B if none
   did.
6. **Write up the asks** for CMS (blank C) and Polaris (drop P's force-on and M's injection), using
   §5 D.

---

## 8. Open questions, to settle after the spike

- **Failure modes (deferred by you):** before groups are known, if whoami fails, or if the claims
  cookie is missing, do we show the natives, nothing, or a default set? The answer decides whether
  "hide" waits for "we have something to show".
- **Kill switch:** should button control share `CMS_WATCHDOG_ENABLED`, or get its own switch?
- **"Open in Manage Materials"** in `#trTitleBar`: bring it under the same control, or leave it?
- **The "M" name clash:** the native logo cell already means "Modern CMS" to Modern users. If one
  of our buttons is ever labelled "M", consider what users will take it to mean.
- **`SPIKE*` isn't gitignored** (only `PLAN*` is), so this file will show up in `git status`.
