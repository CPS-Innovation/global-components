// Browser entry point loaded by global-components-msal-redirect.html as a
// classic <script>. Fetches sibling config.json (per env) to read clientId
// and authority, then dispatches to one of three roles based on URL shape:
//
//   1. Auth-response hash on the URL → termination (handleRedirectPromise).
//      AAD has bounced us back after a successful (or failed) interactive
//      flow; consume the response and let MSAL navigate to the originating page.
//
//   2. ?action=login query → initiation (handleMsalLogin). The host page
//      assigned us here to start a clean loginRedirect off of host code.
//      The ?returnTo= param tells us where MSAL should navigate after the
//      round-trip completes.
//
//   3. Neither — direct access / odd state; no-op.
//
// The HTML file's inline guard already short-circuits when running in an
// iframe (silent SSO flows); the in-bundle iframe checks inside the two
// handlers are belt-and-braces.

import { handleMsalTermination } from "./handle-msal-termination";
import { handleMsalLogin } from "./handle-msal-login";

const script = document.currentScript as HTMLScriptElement | null;
// Sibling-relative resolution: <whatever-path>/msal-redirect.js → <same-path>/config.json
// (NOT bare-root /config.json — that path 404s on the Polaris CDN and surfaces
// as a CORS error when fetched cross-origin.)
const configUrl = script
  ? new URL("./config.json", script.src).href
  : new URL("./config.json", window.location.href).href;

// AAD response hashes always carry one of these. Cheap pattern beats parsing
// the whole hash, and avoids pulling MSAL just to ask "is this a response?".
const hasAuthResponseHash = (hash: string): boolean =>
  /[#&](code|error|id_token)=/.test(hash);

void (async () => {
  try {
    const res = await fetch(configUrl);
    const config = (await res.json()) as {
      AD_CLIENT_ID?: string;
      AD_TENANT_AUTHORITY?: string;
    };
    const clientId = config.AD_CLIENT_ID;
    const authority = config.AD_TENANT_AUTHORITY;
    if (!(clientId && authority)) {
      console.error(
        "[CPS-GLOBAL-AUTH] msal-redirect entry: config.json missing AD_CLIENT_ID or AD_TENANT_AUTHORITY",
      );
      return;
    }
    const msalConfig = { clientId, authority };
    const params = new URL(window.location.href).searchParams;

    if (hasAuthResponseHash(window.location.hash)) {
      await handleMsalTermination(window, msalConfig);
    } else if (params.get("action") === "login") {
      await handleMsalLogin(window, msalConfig, params.get("returnTo"));
    }
    // Else: direct access / unexpected state — no-op.
  } catch (err) {
    console.error(
      "[CPS-GLOBAL-AUTH] msal-redirect entry: failed to load config.json",
      err,
    );
  }
})();
