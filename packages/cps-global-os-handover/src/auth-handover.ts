/**  Browser entry point that automatically executes handleRedirect.
 * The OS auth-handover.html endpoint should reference this file via
 * a `script` tag reference.
 *
 * config.json is fetched eagerly on every load so CMS_AUTH_STORAGE_KEYS
 * is available for all dispatch branches (cookie-return, token-return, and
 * os-ad-redirect). The MSAL fields (AD_CLIENT_ID, AD_TENANT_AUTHORITY) are
 * still only consumed on the os-ad-redirect path via fetchMsalConfig.
 */

import { CmsAuthStorageKeys } from "cps-global-configuration";
import { handleOsRedirect } from ".";

const scriptUrl = new URL((document.currentScript as HTMLScriptElement).src);
const scriptOrigin = scriptUrl.origin;
// Sibling-relative resolution: /global-components/<env>/auth-handover.js → /global-components/<env>/config.json
// (NOT bare-root /config.json — that path 404s on the Polaris CDN and surfaces
// as a CORS error from the OS host page.)
const configUrl = new URL("./config.json", scriptUrl).href;

console.log("[CPS-GLOBAL-AUTH] auth-handover boot", {
  href: window.location.href,
  hash: window.location.hash,
  configUrl,
});

const configPromise = fetch(configUrl).then(
  (res) =>
    res.json() as Promise<{
      AD_CLIENT_ID?: string;
      AD_TENANT_AUTHORITY?: string;
      CMS_AUTH_STORAGE_KEYS: CmsAuthStorageKeys;
    }>,
);

const fetchMsalConfig = async () => {
  const config = await configPromise;
  return {
    clientId: config.AD_CLIENT_ID ?? "",
    authority: config.AD_TENANT_AUTHORITY ?? "",
  };
};

configPromise.then(
  (config) => {
    console.log("[CPS-GLOBAL-AUTH] auth-handover config loaded", {
      hasClientId: !!config.AD_CLIENT_ID,
      hasAuthority: !!config.AD_TENANT_AUTHORITY,
    });
    return handleOsRedirect(
      window,
      `${scriptOrigin}/auth-refresh-cms-modern-token`,
      fetchMsalConfig,
      config.CMS_AUTH_STORAGE_KEYS,
    );
  },
  (err) =>
    console.error("[CPS-GLOBAL-AUTH] auth-handover config fetch failed", err),
);
