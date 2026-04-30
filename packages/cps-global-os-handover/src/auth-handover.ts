/**  Browser entry point that automatically executes handleRedirect.
 * The OS auth-handover.html endpoint should reference this file via
 * a `script` tag reference.
 *
 * MSAL config (clientId, authority) is fetched lazily from
 * `${scriptOrigin}/config.json` only when the os-ad-redirect dispatch fires —
 * cookie-return / token-return paths pay no extra HTTP. We assume the only
 * properties consumed here are `AD_CLIENT_ID` and `AD_TENANT_AUTHORITY`; if
 * either is missing the termination logs and bails.
 */

import { handleOsRedirect } from ".";

const scriptUrl = new URL((document.currentScript as HTMLScriptElement).src);
const scriptOrigin = scriptUrl.origin;
// Sibling-relative resolution: /global-components/<env>/auth-handover.js → /global-components/<env>/config.json
// (NOT bare-root /config.json — that path 404s on the Polaris CDN and surfaces
// as a CORS error from the OS host page.)
const configUrl = new URL("./config.json", scriptUrl).href;

const fetchMsalConfig = async () => {
  const res = await fetch(configUrl);
  const config = (await res.json()) as {
    AD_CLIENT_ID?: string;
    AD_TENANT_AUTHORITY?: string;
  };
  return {
    clientId: config.AD_CLIENT_ID ?? "",
    authority: config.AD_TENANT_AUTHORITY ?? "",
  };
};

handleOsRedirect(
  window,
  `${scriptOrigin}/auth-refresh-cms-modern-token`,
  fetchMsalConfig,
);
