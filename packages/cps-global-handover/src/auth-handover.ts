/**
 * Single-file entry point for the shared auth-handover endpoint.
 *
 * The HTML at this endpoint (served from both the Polaris CDN and the
 * OS-deployed Casework_Patterns/auth-handover.html) loads this bundle via a
 * script tag pointed at by `?src=`. The module-level boot block at the foot
 * of this file fetches sibling `config.json` and hands off to dispatchHandover.
 *
 * Tests import the named exports (`dispatchHandover`, `getConfig`) directly.
 * The boot block is gated on the presence of `document.currentScript` so it
 * stays inert under jest/jsdom.
 */

import {
  AuthHintSchema,
  Config,
  fetchConfig,
  fetchState,
  HANDOVER_PARAM_KEYS,
  HANDOVER_STAGES,
} from "cps-global-configuration";
import {
  handleMsalEnsureAd,
  handleMsalLogin,
  handleMsalTermination,
} from "cps-global-auth";
import {
  handleOsCookieReturn,
  handleOsTokenReturn,
} from "cps-global-os-handover";
import { beaconAdRedirect } from "./beacon-ad-redirect";

// AAD response hashes always carry one of these. Cheap pattern beats parsing
// the whole hash, and avoids pulling MSAL just to ask "is this a response?".
const hasAuthResponseHash = (hash: string): boolean =>
  /[#&](code|error|id_token)=/.test(hash);

// Fetches and casts sibling config.json. The shape is the canonical Config
// from cps-global-configuration — same schema the host bundle validates against.
//
// Sibling-relative resolution: scriptUrl/auth-handover.js → scriptUrl/config.json
// (NOT bare-root /config.json — that path 404s on the Polaris CDN and surfaces
// as a CORS error when the bundle is loaded cross-origin from an OS host page).
export const getConfig = async (scriptUrl: URL): Promise<Config> => {
  const configUrl = new URL("./config.json", scriptUrl).href;
  const response = await fetchConfig(configUrl);
  if (!response.ok) {
    throw new Error(
      `config.json fetch returned ${response.status} ${response.statusText}`,
    );
  }
  return (await response.json()) as Config;
};

// Best-effort fetch of the authHint to extract the user's object id for the
// failure beacon. Same-origin relative to the bundle URL (resolves the same
// way as the host's `../state/auth-hint` lookup) — works for the Polaris
// variant; on the OS variant it's a cross-origin request to polaris-api and
// will typically fail unless CORS is configured. Either way, swallow and
// return "unknown" so the beacon still fires.
const tryFetchAuthHintObjectId = async (scriptUrl: URL): Promise<string> => {
  const result = await fetchState({
    rootUrl: scriptUrl.href,
    url: "../state/auth-hint",
    schema: AuthHintSchema,
  });
  return result.found ? result.result.authResult.objectId : "unknown";
};

// Single dispatcher for the shared auth-handover endpoint. Branches by
// `?stage=`; within `ad-redirect` it further branches on whether the URL
// fragment carries an AAD response.
//
// scriptUrl carries two pieces of runtime info that aren't in the JSON config:
// where the bundle was loaded from (for the beacon endpoint and for resolving
// the `../state/auth-hint` lookup), and — by origin — where the token-handover
// endpoint lives.
export const dispatchHandover = async (
  win: Window,
  config: Config,
  scriptUrl: URL,
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
        tokenHandoverUrl: `${scriptUrl.origin}/auth-refresh-cms-modern-token`,
        cmsAuthStorageKeys: config.CMS_AUTH_STORAGE_KEYS!,
      });

    case HANDOVER_STAGES.OS_TOKEN_RETURN:
      return handleOsTokenReturn(win, {
        cmsAuthStorageKeys: config.CMS_AUTH_STORAGE_KEYS!,
      });

    case HANDOVER_STAGES.ENSURE_AD: {
      // Preemptive AD validation. External entities and the OS handover
      // paths bounce here before letting the user reach the target page.
      // Silent path: navigate to returnTo directly. Failure path: fall
      // through to a full loginRedirect (handleMsalEnsureAd handles both).
      const msalConfig = {
        clientId: config.AD_CLIENT_ID ?? "",
        authority: config.AD_TENANT_AUTHORITY ?? "",
      };
      // redirectUri is the same shape as the ad-redirect initiation builds —
      // keeps ?src= (so the OS HTML can re-inject the bundle on the bounce-back)
      // and swaps stage to ad-redirect (so the bounce-back routes through the
      // termination branch above, not back into ensure-ad).
      const url = new URL(win.location.href);
      url.searchParams.set(
        HANDOVER_PARAM_KEYS.STAGE,
        HANDOVER_STAGES.AD_REDIRECT,
      );
      url.searchParams.delete(HANDOVER_PARAM_KEYS.RETURN_TO);
      url.hash = "";
      const redirectUri = url.href;
      await handleMsalEnsureAd(
        win,
        msalConfig,
        params.get(HANDOVER_PARAM_KEYS.RETURN_TO),
        redirectUri,
      );
      return;
    }

    case HANDOVER_STAGES.AD_REDIRECT: {
      const msalConfig = {
        clientId: config.AD_CLIENT_ID ?? "",
        authority: config.AD_TENANT_AUTHORITY ?? "",
      };
      if (hasAuthResponseHash(hash)) {
        // AAD bounce-back. handleMsalTermination no longer navigates itself —
        // we own the sequence so the beacon can fire between termination and
        // navigation, with keepalive carrying delivery across the unload.
        const result = await handleMsalTermination(win, msalConfig);

        if (
          result.outcome === "handled" &&
          config.BEACON_AD_REDIRECT_SUCCESSES_ENABLED
        ) {
          const oid =
            (result.account?.idTokenClaims as { oid?: string } | undefined)
              ?.oid ?? "unknown";
          await beaconAdRedirect(scriptUrl, "success", {
            "auth-hint-object-id": oid,
          });
        } else if (
          result.outcome === "handled-with-error" &&
          config.BEACON_AD_REDIRECT_FAILURES_ENABLED
        ) {
          const oid = await tryFetchAuthHintObjectId(scriptUrl);
          await beaconAdRedirect(scriptUrl, "failure", {
            "auth-hint-object-id": oid,
          });
        }

        // Caller-driven navigation (lifted out of handleMsalTermination so the
        // beacon above can complete first). Uses replace so the handover entry
        // is not preserved in history.
        if (result.returnTo) {
          win.location.replace(result.returnTo);
        }
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
      await dispatchHandover(window, config, scriptUrl);
    } catch (err) {
      console.error(
        "[CPS-GLOBAL-HANDOVER] auth-handover failed before dispatch",
        err,
      );
    }
  })();
}
