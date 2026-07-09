# Startup

Request URL: https://polaris-qa-notprod.cps.gov.uk/CMS.24.0.01/uaglCMS.aspx

# Login

https://polaris-qa-notprod.cps.gov.uk/CMS.24.0.01/User/uaulLogin.aspx

Request:
Cookie:
CMSUSER103096=me0yxcvneiwa5jiyebs4m0de; CMSUSER104007=me0yxcvneiwa5jiyebs4m0de; \_\_CMSENV=default; ASP.NET_SessionId=me0yxcvneiwa5jiyebs4m0de; WindowID=1; UID=104007; BIGipServer~ent-s221~CPSACP-LTM-CM-WAN-CIN3-cin3.cps.gov.uk_POOL=rd1o00000000000000000000ffff0a02a00do80; dtCookie=v_4_srv_4_sn_9A34A44E4B4860EF9A8B801001469198_perc_100000_ol_0_mul_1_app-3A1d479dbf707b0c2a_1_app-3Ad8e90143db417329_1_app-3A5ffc92a6c17c7ee4_1_app-3A55abcc445f8c3aa6_1_rcs-3Acss_0; rxVisitor=1769506991519HI0080QC0Q1PBE0RABP1IB31LA8P07KV; dtPC=4$394066734_821h1vJWBEKPEHVEMOQUCFSWJQPLJBKRFQQSKW-0e0; rxvt=1769795873591|1769792346444; dtLatC=42; dtSa=true%7CU%7C-1%7CClick%20here%20to%20login%7C-%7C1769794101660%7C394072223_996%7Chttps%3A%2F%2Fpolaris-qa-notprod.cps.gov.uk%2FCMS.24.0.01%2FUser%2FuaulLogin.aspx%7C%7C%7C%7C

Response:
set-cookie:
.CMSAUTH=01A42EB0A0CF686107B17D2409D941D47F76A1013CDBDA57A40040433A39127D2E3669867769A9F57D0B76DB7F201A74B865B1C707BD5CD8D8279CBF3977C2349031F6F72DE0334D51A5BF84104FE0CC6F49976D90297F4E0A6BAE4BAEB7EEA597FCA3A36FE68BB6D33267B3311DF8C6A497E90702606E24DB76AAEA055BCC69D4A3E615; path=/; HttpOnly; SameSite=Lax
CMSUSER104007=me0yxcvneiwa5jiyebs4m0de; expires=Fri, 06-Feb-2026 17:28:21 GMT; path=/
UID=104007; path=/
WindowID=MASTER; path=/

---

# HAR Analysis: Session Refresh & Post-Login Flow

## Why the session is never resumed (cms.har)

Three components work together to force a fresh login every time CMS is opened. There is no "resume session" path.

### 1. `uaglPersistentData.aspx` (primary cause)

Loaded into a hidden frame (`frameData`) by the outer frameset `uaglCMS.aspx`. Its `initialise()` function runs on load and **unconditionally redirects to the login page** with no check for an existing session:

```javascript
if (!objMasterWindow) {
  objMasterWindow = window;
  bIsMaster = true;
  top.name = "MASTER";
  setWindowIDCookie();
  arrDataStoreName = new Array(); // wipes in-memory data store
  arrDataStoreValue = new Array();
  top.frameMain.location.href = "../../User/uaulLogin.aspx"; // always
}
```

### 2. `uaulLogin.aspx` (cookie invalidation)

When the login page loads (as a GET), its HTTP response **destroys the existing auth cookie**:

```
Set-Cookie: .CMSAUTH=; expires=Mon, 11-Oct-1999 23:00:00 GMT; path=/; HttpOnly; SameSite=Lax
```

Even if the user had a valid `.CMSAUTH` from a prior session, loading this page wipes it.

### 3. `uaglCMS.aspx` (localStorage cleanup)

The outer frameset clears navigation state on load:

```javascript
function initialiseLocalStorage() {
  localStorage.setItem("modAction", "");
  localStorage.setItem("modScreen", "");
  localStorage.setItem("modCaseId", "");
  localStorage.setItem("modWindowId", "");
}
initialiseLocalStorage();
```

These are inter-window navigation values, not session credentials. Clearing them means the user lands at the task list rather than mid-way through a case, which is acceptable.

---

## Post-login flow (cms-login-response.har)

All navigation is driven by JavaScript `location.href` assignments — there are no HTTP 302 redirects.

### Sequence

1. **Login POST** to `uaulLogin.aspx`
   - Sets `.CMSAUTH` cookie (256-char hex, session-scoped, HttpOnly, SameSite=Lax)
   - Sets `CMSUSER{uid}`, `UID`, `WindowID` cookies
   - Response body contains inline script: `location.href = '...uaulLogin.aspx?bolPasswordExpired=0'`
   - `checkIs3GUser()` appends `&hidUserIs3G=Y`

2. **Login page with params** (`?bolPasswordExpired=0&hidUserIs3G=Y`)
   - Returns a tiny script that navigates `top.frameServerJS` to `uainGeneratedScript.aspx`

3. **`uainGeneratedScript.aspx`** — the session bootstrap page
   - Sets all session globals as JS variables:
     - `GLOB_CMS_TIMEOUT = 14400000` (4 hours)
     - `APPLICATION_MODE = 'CMS'`
     - `MODERN_CMS_URL = 'https://polaris-qa-notprod.cps.gov.uk/viewer/landing#'`
     - `SESSION_MODERN_USER = true`
     - `SESS_MODERN_USER_SESSION_ID = '9f35cc85-...'` (fresh GUID per login)
   - Populates `top.frameData.*` variables (website URL, user root path, permissions)
   - `window.onload` navigates `top.frameMain` to `uatlTaskList.aspx`

4. **Task List** (`uatlTaskList.aspx`) loads in `frameMain`, SOAP calls fetch lookup data

5. **Modern viewer** — for modern users, navigates to `/viewer/landing#/dashboard/{sessionId}?wid=MASTER`, Angular SPA makes GraphQL calls to `/graphql/`

### What "logged in" requires

| Requirement                               | Source                                     |
| ----------------------------------------- | ------------------------------------------ |
| `.CMSAUTH` cookie                         | Set by login POST response                 |
| `ASP.NET_SessionId` cookie                | Pre-existing from initial page load        |
| `UID`, `WindowID`, `CMSUSER{uid}` cookies | Set by login POST response                 |
| Server-side session alive                 | 4-hour timeout (`GLOB_CMS_TIMEOUT`)        |
| `uainGeneratedScript.aspx` loaded         | Populates frame data and session constants |

### The `.CMSAUTH` cookie

- 256-char hex string (128 bytes) — ASP.NET Forms Authentication encrypted ticket
- Contains username, issue time, expiry (opaque, server-encrypted)
- Session-scoped (no explicit `expires`/`max-age`) — lives until browser closes
- `HttpOnly`, `SameSite=Lax`, no `Secure` flag

---

## Proxy bypass strategy

### The problem

Every navigation to `uaglCMS.aspx` triggers:

1. `uaglPersistentData.aspx` → `initialise()` → unconditional redirect to `uaulLogin.aspx`
2. `uaulLogin.aspx` GET → destroys `.CMSAUTH` cookie → user must re-enter credentials

### The approach

The nginx proxy can intercept the GET request to `uaulLogin.aspx` and, if the user already has a valid `.CMSAUTH` cookie, **rewrite the response** to skip the cookie invalidation and instead redirect straight to the session bootstrap page:

```
/CMS.24.0.01/Includes/uainGeneratedScript.aspx?strURL=...TaskList.aspx
```

This would:

- Preserve the existing `.CMSAUTH` cookie (skip the `expires=1999` destruction)
- Let `uainGeneratedScript.aspx` re-bootstrap the session state into the frames
- Land the user at the task list / modern viewer without re-entering credentials
- Rely on the 4-hour server-side session timeout as the natural session boundary

The localStorage values (`modAction`, `modScreen`, etc.) being cleared is fine — the user lands at the task list, not mid-case.

---

# IE Mode Dependencies

The CMS application requires IE mode (Edge IE compatibility mode) to function. The following IE-only features were identified in the HAR captures.

## Definitive IE-only features

### `webservice.htc` (HTML Components)

Three instances loaded. HTC files are a Microsoft invention (IE 5.0 era) that attach custom "behaviors" to HTML elements. `webservice.htc` is Microsoft's built-in HTC that adds SOAP web service call capabilities — the Task List page uses it to call `.asmx` endpoints (`uwldLookupData.asmx`) for lookup data like court lists. HTC files were never standardised, never implemented by any other browser, and dropped by Microsoft in Edge.

### `function window.onload()` syntax

IE-specific JScript syntax for assigning event handlers as named functions on expando properties. Standard JavaScript requires `window.onload = function()` or `addEventListener`. Only IE's JScript engine supports this form.

### `onpropertychange` event

Used on login form input elements (`<input ... onpropertychange="toggleButton()">`). This is an IE-only DOM event that fires when any property of an element changes. Never implemented by other browsers. The modern equivalent is `oninput`.

### `UA-CPU: AMD64` request header

Only IE sends this header.

### ActiveX / COM automation

`uaogPopulateWordDoc.js` indicates ActiveX automation of Microsoft Word via `new ActiveXObject("Word.Application")`. This uses COM to control a locally installed instance of Word on the user's Windows desktop. ActiveX controls are native Windows binaries (`.ocx`/`.dll`), not web standards. In this case, Word is pre-installed via Office — there is no download step, IE just instantiates it.

## Other IE-era patterns (not strictly IE-only)

- `<script language="javascript">` — deprecated `language` attribute instead of `type`
- Frameset architecture with deep cross-frame property access (`top.frameData.objMasterWindow.top.frameServerJS.GLOB_CMS_TIMEOUT`)
- `User-Agent: Mozilla/4.0 (compatible; MSIE 7.0; ...)` with `Trident/7.0` — IE11 in IE7 document mode

## Proxy-based modernisation feasibility

### Transformable at the proxy layer

| IE feature                       | Proxy transformation                                                                     | Difficulty                                    |
| -------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------- |
| `<script language="javascript">` | String replace to `<script>`                                                             | Trivial                                       |
| `onpropertychange`               | Attribute swap to `oninput`                                                              | Trivial                                       |
| `function window.onload()`       | Regex replace to `window.onload = function()`                                            | Trivial                                       |
| `webservice.htc` / SOAP calls    | Strip HTC references, inject JS polyfill using `fetch` to replicate `.callService()` API | Hard but bounded — WSDL defines the interface |
| Cross-frame scripting            | Works in modern browsers if all frames are same-origin                                   | No change needed (verify same-origin)         |

### Not transformable at the proxy layer

| IE feature                    | Why                                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| ActiveX / Word COM automation | The browser controls a native desktop application via COM. No modern browser allows this. No proxy can bridge this gap. |

### Assessment

The proxy could handle authentication/session management and some simpler IE-isms (attribute swaps, script syntax fixes, HTC polyfills). Fully modernising the CMS UI through a proxy would be a significant undertaking — essentially building a compatibility shim for an application we don't control.

The ActiveX/Word integration is a hard blocker that no proxy can solve. However, if the CMS is migrating toward the modern viewer (`/viewer/landing`), Word automation may only exist in the legacy UI path. The proxy auth work does not need to solve the ActiveX problem.
