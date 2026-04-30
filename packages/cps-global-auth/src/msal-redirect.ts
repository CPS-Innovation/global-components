// Browser entry point loaded by global-components-msal-redirect.html as a
// classic <script>. Fetches sibling config.json (per env) to read clientId
// and authority, then runs handleMsalTermination. AD_CLIENT_ID and
// AD_TENANT_AUTHORITY are assumed to be the only consumed properties.
//
// The HTML file's inline guard already short-circuits when running in an
// iframe (silent SSO flows); the in-bundle iframe check inside
// handleMsalTermination is belt-and-braces.

import { handleMsalTermination } from "./handle-msal-termination";

const script = document.currentScript as HTMLScriptElement | null;
// Sibling-relative resolution: <whatever-path>/msal-redirect.js → <same-path>/config.json
// (NOT bare-root /config.json — that path 404s on the Polaris CDN and surfaces
// as a CORS error when fetched cross-origin.)
const configUrl = script
  ? new URL("./config.json", script.src).href
  : new URL("./config.json", window.location.href).href;

void (async () => {
  try {
    const res = await fetch(configUrl);
    const config = (await res.json()) as {
      AD_CLIENT_ID?: string;
      AD_TENANT_AUTHORITY?: string;
    };
    const clientId = config.AD_CLIENT_ID;
    const authority = config.AD_TENANT_AUTHORITY;
    if (clientId && authority) {
      await handleMsalTermination(window, { clientId, authority });
    } else {
      console.error(
        "[CPS-GLOBAL-AUTH] msal-redirect entry: config.json missing AD_CLIENT_ID or AD_TENANT_AUTHORITY",
      );
    }
  } catch (err) {
    console.error(
      "[CPS-GLOBAL-AUTH] msal-redirect entry: failed to load config.json",
      err,
    );
  }
})();
