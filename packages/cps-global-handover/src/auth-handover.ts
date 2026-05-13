/**
 * Single-file entry point for the shared auth-handover endpoint.
 *
 * The HTML at this endpoint (served from both the Polaris CDN and the
 * OS-deployed Casework_Patterns/auth-handover.html) loads this bundle via a
 * script tag pointed at by `?src=`. The module-level boot block at the foot
 * of this file fetches sibling `config.json` and hands off to dispatchHandover.
 *
 * Tests import the named exports (`dispatchHandover`, `getConfig`,
 * `HandoverConfig`) directly. The boot block is gated on the presence of
 * `document.currentScript` so it stays inert under jest/jsdom.
 */

import {
  CmsAuthStorageKeys,
  fetchConfig,
  HANDOVER_PARAM_KEYS,
  HANDOVER_STAGES,
} from "cps-global-configuration";
import { handleMsalLogin, handleMsalTermination } from "cps-global-auth";
import {
  handleOsCookieReturn,
  handleOsTokenReturn,
} from "cps-global-os-handover";

// AAD response hashes always carry one of these. Cheap pattern beats parsing
// the whole hash, and avoids pulling MSAL just to ask "is this a response?".
const hasAuthResponseHash = (hash: string): boolean =>
  /[#&](code|error|id_token)=/.test(hash);

export type HandoverConfig = {
  AD_CLIENT_ID: string;
  AD_TENANT_AUTHORITY: string;
  CMS_AUTH_STORAGE_KEYS: CmsAuthStorageKeys;
  // Resolved per-environment URL of the cms-modern-token handover endpoint.
  // Currently derived bundle-side from script origin; passed in for testability.
  tokenHandoverUrl: string;
};

// Fetches and shapes the runtime config used by every dispatch branch.
//
// Sibling-relative resolution: scriptUrl/auth-handover.js → scriptUrl/config.json
// (NOT bare-root /config.json — that path 404s on the Polaris CDN and surfaces
// as a CORS error when the bundle is loaded cross-origin from an OS host page).
// tokenHandoverUrl is derived from the script's origin so the bundle and the
// token-handover endpoint stay co-located on the Polaris CDN.
export const getConfig = async (scriptUrl: URL): Promise<HandoverConfig> => {
  const configUrl = new URL("./config.json", scriptUrl).href;
  const response = await fetchConfig(configUrl);
  if (!response.ok) {
    throw new Error(
      `config.json fetch returned ${response.status} ${response.statusText}`,
    );
  }
  const parsed = (await response.json()) as {
    AD_CLIENT_ID?: string;
    AD_TENANT_AUTHORITY?: string;
    CMS_AUTH_STORAGE_KEYS: CmsAuthStorageKeys;
  };
  return {
    AD_CLIENT_ID: parsed.AD_CLIENT_ID ?? "",
    AD_TENANT_AUTHORITY: parsed.AD_TENANT_AUTHORITY ?? "",
    CMS_AUTH_STORAGE_KEYS: parsed.CMS_AUTH_STORAGE_KEYS,
    tokenHandoverUrl: `${scriptUrl.origin}/auth-refresh-cms-modern-token`,
  };
};

// Single dispatcher for the shared auth-handover endpoint. Branches by
// `?stage=`; within `ad-redirect` it further branches on whether the URL
// fragment carries an AAD response.
export const dispatchHandover = async (
  win: Window,
  config: HandoverConfig,
): Promise<void> => {
  const params = new URL(win.location.href).searchParams;
  const stage = params.get(HANDOVER_PARAM_KEYS.STAGE);
  const hash = win.location.hash;

  console.log("[CPS-GLOBAL-HANDOVER] dispatch", {
    stage,
    hash,
    hasResponseHash: hasAuthResponseHash(hash),
    href: win.location.href,
  });

  switch (stage) {
    case HANDOVER_STAGES.OS_COOKIE_RETURN:
      return handleOsCookieReturn(win, {
        tokenHandoverUrl: config.tokenHandoverUrl,
        cmsAuthStorageKeys: config.CMS_AUTH_STORAGE_KEYS,
      });

    case HANDOVER_STAGES.OS_TOKEN_RETURN:
      return handleOsTokenReturn(win, {
        cmsAuthStorageKeys: config.CMS_AUTH_STORAGE_KEYS,
      });

    case HANDOVER_STAGES.AD_REDIRECT: {
      const msalConfig = {
        clientId: config.AD_CLIENT_ID,
        authority: config.AD_TENANT_AUTHORITY,
      };
      if (hasAuthResponseHash(hash)) {
        // AAD bounce-back — consume the response, fire any stashed returnTo
        // navigation. handleMsalTermination computes its own redirectUri from
        // win.location.href (minus the hash) and validates it against the
        // MSAL request stashed at initiation.
        await handleMsalTermination(win, msalConfig);
        return;
      }
      // Host-initiated entry — start the loginRedirect. Compute the redirectUri
      // that MSAL will send to AAD: keep ?src= (so the OS-served HTML can
      // re-inject the bundle on the bounce-back) and ?stage=ad-redirect (so
      // our dispatcher routes the bounce-back back here). Strip our own
      // dispatch param (returnTo) and the fragment. Both forms — with and
      // without ?src= — must be registered as redirect URIs in the AAD app.
      const url = new URL(win.location.href);
      url.searchParams.delete(HANDOVER_PARAM_KEYS.RETURN_TO);
      url.hash = "";
      const redirectUri = url.href;
      await handleMsalLogin(
        win,
        msalConfig,
        params.get(HANDOVER_PARAM_KEYS.RETURN_TO),
        redirectUri,
      );
      return;
    }

    default:
      // Unknown / missing stage — direct access or stale URL. No-op.
      // Drop 8's beacon will turn this into a tracked failure.
      console.warn("[CPS-GLOBAL-HANDOVER] no-op for unknown stage", { stage });
      return;
  }
};

// --- Module-level boot block ------------------------------------------------
//
// Fires only when this file is loaded as a browser script (i.e.
// document.currentScript is set during synchronous module evaluation). Stays
// inert under jsdom/ts-jest, where currentScript is null and tests import
// only the named exports above.

const currentScript =
  typeof document !== "undefined"
    ? (document.currentScript as HTMLScriptElement | null)
    : null;

if (currentScript) {
  const scriptUrl = new URL(currentScript.src);

  console.log("[CPS-GLOBAL-HANDOVER] auth-handover boot", {
    href: window.location.href,
    hash: window.location.hash,
    configUrl: new URL("./config.json", scriptUrl).href,
  });

  void (async () => {
    try {
      const config = await getConfig(scriptUrl);
      console.log("[CPS-GLOBAL-HANDOVER] config loaded", {
        hasClientId: !!config.AD_CLIENT_ID,
        hasAuthority: !!config.AD_TENANT_AUTHORITY,
      });
      await dispatchHandover(window, config);
    } catch (err) {
      console.error(
        "[CPS-GLOBAL-HANDOVER] auth-handover failed before dispatch",
        err,
      );
    }
  })();
}
