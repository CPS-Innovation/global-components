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
  applyRegionToString,
  AuthHint,
  AuthHintSchema,
  Config,
  FEATURE_FLAGS,
  fetchConfig,
  fetchState,
  getPreviewRegion,
  HANDOVER_PARAM_KEYS,
  HANDOVER_STAGES,
  Me,
  Preview,
  PreviewSchema,
  Result,
  StatePutResponseSchema,
} from "cps-global-configuration";
import {
  handleMsalEnsureAd,
  handleMsalLogin,
  handleMsalTermination,
  resolveReturnTo,
} from "cps-global-auth";
import {
  handleOsCookieReturn,
  handleOsTokenReturn,
} from "cps-global-os-handover";

// Kill switch for the preemptive AD check on the OS handover branches.
// When false, OS_COOKIE_RETURN and OS_TOKEN_RETURN navigate straight to their
// target without fetching authHint or running the silent-or-redirect cascade —
// keeping the OS handover decoupled from AD entirely. The ENSURE_AD branch is
// unaffected (that's the explicit AD entry point). Preview is fetched by the
// dispatcher regardless of this switch, since the region check needs it on
// every branch.
const ENSURE_AD_ON_OS_HANDOVER = false;

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

// Best-effort fetch of the authHint. Same-origin relative to the bundle URL
// (resolves the same way as the host's `../state/auth-hint` lookup) — works
// for the Polaris variant; on the OS variant it's a cross-origin request to
// polaris-api and will typically fail unless CORS is configured. Either way
// the Result discriminator lets callers proceed when not-found.
//
// Used for two things downstream: feature-flag bucketing (we need the user's
// identity to decide whether to do the preemptive AD cascade) and the
// failure-beacon objectId.
const tryFetchAuthHint = (scriptUrl: URL): Promise<Result<AuthHint>> =>
  fetchState({
    rootUrl: scriptUrl.href,
    url: "../state/auth-hint",
    schema: AuthHintSchema,
  });

// Best-effort fetch of the preview override. Same shape and same caveats as
// the authHint fetch — the preview file lets us flip the flag for ad-hoc
// testing without a config push.
const tryFetchPreview = (scriptUrl: URL): Promise<Result<Preview>> =>
  fetchState({
    rootUrl: scriptUrl.href,
    url: "../state/preview",
    schema: PreviewSchema,
  });

// Best-effort write-back to ../state/auth-hint after a successful termination.
// Same fetchState PUT path the host's setAuthHint uses (single mechanism for
// state writes across both bundles). Failure is swallowed: the host's normal
// setAuthHint on the next page load will re-write a fresh hint regardless.
const tryPutAuthHint = async (
  scriptUrl: URL,
  authHint: AuthHint,
): Promise<void> => {
  const result = await fetchState({
    rootUrl: scriptUrl.href,
    url: "../state/auth-hint",
    schema: StatePutResponseSchema,
    data: authHint,
  });
  if (!result.found) {
    console.warn(
      "[CPS-GLOBAL-HANDOVER] auth-hint write-back failed",
      result.error,
    );
  }
};

// Build an AuthHint from a fresh termination's account + sid. Mirrors the
// shape that the host's setAuthHint writes — same fields populated from the
// same idTokenClaims paths — so a subsequent fetchState on the host reads a
// valid hint regardless of which side wrote it. Returns undefined when the
// account is missing the fields AuthHintSchema requires (username/objectId);
// the caller then skips the write-back rather than poisoning the stored hint.
const buildAuthHintFromAccount = (
  account: { username?: string; name?: string; localAccountId?: string; idTokenClaims?: unknown },
  sid: string | undefined,
  me: Me | undefined,
): AuthHint | undefined => {
  if (!account.username || !account.localAccountId) {
    return undefined;
  }
  return {
    authResult: {
      isAuthed: true,
      username: account.username.toLowerCase(),
      name: account.name,
      objectId: account.localAccountId,
      groups: ((account.idTokenClaims as { groups?: string[] } | undefined)?.groups) ?? [],
      // Carry the freshly-fetched /me slice so the host reads department from
      // the hint without re-hitting Graph. Omitted when getMe soft-failed —
      // rather than persisting a stale value, we leave it out and the host
      // re-fetches via its own !knownMe branch.
      ...(me ? { me } : {}),
    },
    timestamp: Date.now(),
    ...(sid ? { lastKnownSid: sid } : {}),
  };
};

// Entra objectId → OS ClientVar (FCT2-21199, tactical). OutSystems reads this
// localStorage key on its own origin; the ad-redirect termination for OS
// full-page-redirect auth lands on the OS origin, so writing here puts the
// objectId exactly where OS can pick it up. The key name comes from config —
// blank/absent turns the feature off. Same objectId the AuthHint write-back
// below carries (account.localAccountId). Harmless no-op on the polaris-served
// variant (nothing reads it there); no host gate needed.
const writeEntraIdClientVar = (
  win: Window,
  config: Config,
  objectId: string | undefined,
): void => {
  const key = config.OS_ENTRA_ID_STORAGE_KEY;
  if (!key || !objectId) {
    return;
  }
  // Best-effort, exactly like the AuthHint write-back. This sits on the
  // AD-redirect return path immediately before the navigation to returnTo, so a
  // throwing localStorage (disabled, full, or partitioned) must not escape: the
  // dispatch entry point only logs what it catches, which would leave the user
  // stranded on the handover page mid-auth. The ClientVar is a convenience for
  // OutSystems, never something the handover itself depends on.
  try {
    win.localStorage.setItem(key, objectId);
  } catch (err) {
    console.warn(
      "[CPS-GLOBAL-HANDOVER] could not write Entra objectId ClientVar",
      err,
    );
  }
};

// Shared AD-validation routine. Called from three places:
//   1. The ENSURE_AD dispatch case (public entry point for external entities).
//   2. The OS_COOKIE_RETURN case once cookies have been validated.
//   3. The OS_TOKEN_RETURN case once the fresh token has been stored.
// All three want the same thing: silent-acquire-or-redirect, then if silent
// worked navigate the user to returnTo (same-origin validated). Calling this
// in-process avoids a wasted ?stage=ensure-ad page-load from the OS branches.
//
// Gated on FEATURE_FLAGS.shouldUseFullPageMsalRedirect — without this gate,
// every user passing through the OS handover would get the preemptive AD
// cascade (and a redirect on silent-fail). Bucketing uses authHint (the
// persisted identity from a prior session) since auth itself hasn't run yet.
const runEnsureAd = async (
  win: Window,
  config: Config,
  scriptUrl: URL,
  returnTo: string | null,
  preview: Result<Preview>,
): Promise<void> => {
  const authHint = await tryFetchAuthHint(scriptUrl);
  const inFlag = FEATURE_FLAGS.shouldUseFullPageMsalRedirect({
    config,
    preview,
    auth: undefined,
    authHint,
  });
  if (!inFlag) {
    // Non-FF user — skip the AD cascade and deliver them straight to target.
    const validatedReturnTo = resolveReturnTo(returnTo, win.location.origin);
    win.location.replace(validatedReturnTo);
    return;
  }

  const msalConfig = {
    clientId: config.AD_CLIENT_ID ?? "",
    authority: config.AD_TENANT_AUTHORITY ?? "",
  };
  // redirectUri is the same shape as the ad-redirect initiation builds —
  // keeps ?src= (so the OS HTML can re-inject the bundle on the bounce-back)
  // and swaps stage to ad-redirect (so the bounce-back routes through the
  // termination branch, not back into ensure-ad). OS-handover params
  // (r/cc/cms-modern-token) and our own returnTo are stripped — they have
  // no meaning to AAD and the redirectUri must match what's registered.
  const url = new URL(win.location.href);
  url.searchParams.set(HANDOVER_PARAM_KEYS.STAGE, HANDOVER_STAGES.AD_REDIRECT);
  url.searchParams.delete(HANDOVER_PARAM_KEYS.RETURN_TO);
  url.searchParams.delete(HANDOVER_PARAM_KEYS.R);
  url.searchParams.delete(HANDOVER_PARAM_KEYS.COOKIES);
  url.searchParams.delete(HANDOVER_PARAM_KEYS.TOKEN);
  url.hash = "";
  const redirectUri = url.href;

  const outcome = await handleMsalEnsureAd(
    win,
    msalConfig,
    returnTo,
    redirectUri,
    config.AD_GATEWAY_SCOPES,
  );
  if (outcome === "silent-success") {
    // Silent path. Mediator owns this navigation; same-origin validated.
    const validatedReturnTo = resolveReturnTo(returnTo, win.location.origin);
    win.location.replace(validatedReturnTo);
  }
  // Other outcomes (redirect-initiated, redirect-initiation-failed,
  // iframe-noop) — either MSAL has taken over or there's nothing further
  // for us to do. No navigation here.
};

// Allowlist for the region-redirect sink. Today the host we redirect to is
// derived from the origin we are already running on and never from the query
// string, so this cannot fail — but that reasoning lives in
// applyRegionToString, a module away, and it stops holding the moment a
// region's host comes from config, which is exactly what the front-door option
// will do. Asserting it at the sink keeps the constraint local and checkable.
const ALLOWED_REDIRECT_HOST = /^cpslon(-[a-z0-9]+)?\.outsystemsenterprise\.com$/;

// Region override (FCT2-20670). The handover sits in the navigation path of
// every OS entry point, which makes it the natural place to catch a user who is
// on the wrong OutSystems host and move them across before anything else runs.
//
// Loop-safety rests on the preview cookie living on the polaris origin: it
// reads identically from either OS host, so the decision is stable across the
// redirect. Every non-matching case — no override, already on London, or the
// polaris-served handover variant (not an OS host at all) — leaves the origin
// untouched and returns false.
//
// The redirect has to happen before the handover does its work, not after:
// handover transfers CMS auth into the OS origin's own storage, and that does
// not cross origins. Every param carrying an OS domain is transposed too —
// returnTo in particular, which resolveReturnTo requires to be same-origin.
const redirectToPreviewRegion = (
  win: Window,
  preview: Result<Preview>,
): boolean => {
  const region = getPreviewRegion(preview);
  const url = new URL(win.location.href);
  const targetOrigin = applyRegionToString(url.origin, region);
  if (targetOrigin === url.origin) {
    return false;
  }

  const target = new URL(url.href);
  target.host = new URL(targetOrigin).host;
  for (const [key, value] of [...target.searchParams]) {
    target.searchParams.set(key, applyRegionToString(value, region));
  }

  // Fails closed: a user who doesn't get moved to London is a broken test, not
  // a broken app, so we carry on dispatching on the current host.
  if (
    target.protocol !== "https:" ||
    !ALLOWED_REDIRECT_HOST.test(target.hostname)
  ) {
    console.warn(
      "[CPS-GLOBAL-HANDOVER] refusing region redirect to unexpected host",
      { host: target.hostname, protocol: target.protocol },
    );
    return false;
  }

  console.log("[CPS-GLOBAL-HANDOVER] region override redirect", {
    from: url.href,
    to: target.href,
  });
  win.location.replace(target.href);
  return true;
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

  // Preview rides alongside the config fetch rather than after it, so the
  // region check costs no extra serial latency on a path that is already
  // several redirects deep.
  const [config, preview] = await Promise.all([
    getConfig(scriptUrl),
    tryFetchPreview(scriptUrl),
  ]);
  console.log("[CPS-GLOBAL-HANDOVER] config loaded", {
    hasClientId: !!config.AD_CLIENT_ID,
    hasAuthority: !!config.AD_TENANT_AUTHORITY,
  });

  if (redirectToPreviewRegion(win, preview)) {
    return;
  }

  switch (stage) {
    case HANDOVER_STAGES.OS_COOKIE_RETURN: {
      const outcome = handleOsCookieReturn(win, {
        tokenHandoverUrl: `${scriptUrl.origin}/auth-refresh-cms-modern-token`,
        cmsAuthStorageKeys: config.CMS_AUTH_STORAGE_KEYS!,
      });
      if (outcome.kind === "ready") {
        if (ENSURE_AD_ON_OS_HANDOVER) {
          // Cookies fresh — preemptive AD check before delivering to target.
          // We're already on the handover endpoint; just call the same function
          // the ENSURE_AD stage uses, no page-load required.
          return runEnsureAd(win, config, scriptUrl, outcome.target, preview);
        }
        win.location.replace(outcome.target);
        return;
      }
      // outcome.kind === "needs-token" — bounce off to the token-handover
      // endpoint, which will return us at stage=os-token-return.
      win.location.replace(outcome.href);
      return;
    }

    case HANDOVER_STAGES.OS_TOKEN_RETURN: {
      const outcome = await handleOsTokenReturn(win, {
        cmsAuthStorageKeys: config.CMS_AUTH_STORAGE_KEYS!,
      });
      if (ENSURE_AD_ON_OS_HANDOVER) {
        // Token stored — preemptive AD check before the user reaches target.
        // In-process call, not a page navigation.
        return runEnsureAd(win, config, scriptUrl, outcome.target, preview);
      }
      win.location.replace(outcome.target);
      return;
    }

    case HANDOVER_STAGES.ENSURE_AD:
      // Public entry point. External entities navigate the user here to
      // guarantee they land at the target with valid AD auth. Same
      // implementation as the OS branches above use post-cleanup.
      return runEnsureAd(
        win,
        config,
        scriptUrl,
        params.get(HANDOVER_PARAM_KEYS.RETURN_TO),
        preview,
      );

    case HANDOVER_STAGES.AD_REDIRECT: {
      const msalConfig = {
        clientId: config.AD_CLIENT_ID ?? "",
        authority: config.AD_TENANT_AUTHORITY ?? "",
      };
      if (hasAuthResponseHash(hash)) {
        // AAD bounce-back. handleMsalTermination no longer navigates itself —
        // we own the post-termination sequence here (write back the fresh
        // AuthHint, then navigate).
        const result = await handleMsalTermination(win, msalConfig);

        if (result.outcome === "handled" && result.account) {
          // Publish the Entra objectId as an OS ClientVar (if enabled in
          // config). Independent of the AuthHint write-back below — both derive
          // from the same freshly-terminated account.
          writeEntraIdClientVar(win, config, result.account.localAccountId);

          // Write the fresh AuthHint (including the new sid) back BEFORE we
          // navigate. The host's first cascade after the redirect will then
          // read this hint and replay the new sid on ssoSilent — turning the
          // very first post-login navigation into an SSO-continuation. Without
          // this write-back, the host's first cascade uses whatever stale hint
          // was there before the redirect cycle.
          const freshHint = buildAuthHintFromAccount(
            result.account,
            result.sid,
            result.me,
          );
          if (freshHint) {
            await tryPutAuthHint(scriptUrl, freshHint);
          }
        }

        // Caller-driven navigation (owned here rather than in
        // handleMsalTermination). Uses replace so the handover entry is not
        // preserved in history.
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
        config.AD_GATEWAY_SCOPES,
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
      await dispatchHandover(window, scriptUrl);
    } catch (err) {
      console.error(
        "[CPS-GLOBAL-HANDOVER] auth-handover failed before dispatch",
        err,
      );
    }
  })();
}
