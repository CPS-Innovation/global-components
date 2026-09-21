/**
 * Types and the hand-maintained residue for CSP requirements.
 *
 * Everything that CAN be derived from a Config is derived (see derive-csp.ts).
 * What lives here is only what genuinely cannot be: hosts hardcoded in source,
 * and keyword sources that aren't hosts at all.
 *
 * Why the `reason` field is load-bearing and not decoration: the previous
 * hand-maintained list (outsystems-support/csp.json) drifted for six months
 * because nobody looking at a bare hostname could tell whether it was still
 * needed. Entries got struck through on guesswork while live requirements went
 * unlisted. Every requirement here names the code path that needs it, so the
 * next person can check the claim rather than re-derive it from scratch.
 */

// `child-src` is deliberately absent. It is the pre-CSP3 alias for `frame-src`
// and every browser in the estate honours `frame-src`, so stating both as
// requirements would ask host apps for something they don't need. The CHECKER
// still has to understand it — a host app whose policy sets only `child-src`
// does satisfy a `frame-src` requirement via the fallback chain — but that is
// matching logic, not a requirement.
export type CspDirective =
  | "script-src"
  | "connect-src"
  | "frame-src"
  | "form-action";

export type CspRequirement = {
  directive: CspDirective;
  // A CSP source expression: an origin, or a keyword like 'self'.
  value: string;
  reason: string;
};

/**
 * The two profiles are not the same shape of thing, and conflating them would
 * over-grant on the tightest policy we own.
 *
 * `hostApp` is a REQUEST: the sources an OutSystems host page must add to its
 * own policy for us to function. It says nothing about 'self', 'unsafe-inline'
 * or anything else the host needs for its own sake — that is their business.
 *
 * `handoverPage` is a COMPLETE POLICY: auth-handover.html is a file we own, so
 * the profile describes everything that page's meta CSP should contain,
 * keyword sources included.
 */
export type CspProfileName = "hostApp" | "handoverPage";

export type CspProfile = Record<CspProfileName, CspRequirement[]>;

// Hardcoded in cps-global-auth, so no config field implies it.
export const GRAPH_REQUIREMENT: CspRequirement = {
  directive: "connect-src",
  value: "https://graph.microsoft.com",
  reason:
    "getMe() fetches /v1.0/me?$select=department,jobTitle (cps-global-auth/src/get-me.ts). " +
    "Soft-fails silently when blocked — the caller in handle-msal-termination passes no " +
    "logError — so a missing entry costs the department/jobTitle slice with no error anywhere.",
};

// Internal to the App Insights SDK; not visible in any config value.
//
// Stated as an origin rather than the exact .../ai.config.1.cfg.json path the
// SDK fetches today. The path form is tighter, but it pins a config-schema
// version number that Microsoft bumps on their own schedule — and a policy that
// breaks on someone else's release is worse than one origin of extra surface.
// The checker reports a deployed path-scoped entry as "narrower than required"
// rather than a pass, which is the signal we want.
export const APP_INSIGHTS_CFG_SYNC_REQUIREMENT: CspRequirement = {
  directive: "connect-src",
  value: "https://js.monitor.azure.com",
  reason:
    "@microsoft/applicationinsights-web's CfgSyncPlugin fetches " +
    "/scripts/b/ai.config.1.cfg.json at runtime. Enabled by default; disabling it via " +
    "featureOptIn in initialise-ai-analytics.ts would remove this requirement entirely.",
};

// Keyword sources for the handover page's own policy. Hosts are derived; these
// are not hosts.
export const HANDOVER_SELF_CONNECT_REQUIREMENT: CspRequirement = {
  directive: "connect-src",
  value: "'self'",
  reason:
    "auth-handover.html is served from both the Polaris CDN and the OutSystems domains; " +
    "'self' covers same-origin fetches on whichever origin it was loaded from.",
};

export const HANDOVER_INLINE_SCRIPT_REQUIREMENT: CspRequirement = {
  directive: "script-src",
  value: "'unsafe-inline'",
  reason:
    "The bootstrap <script> in auth-handover.html is inline. It does no eval / new Function / " +
    "dynamic code construction — it only injects a remote <script> whose src is gated by both " +
    "this policy and the runtime allowlist.",
};

// polaris-dev-notprod.cps.gov.uk was listed in auth-handover.html's meta CSP
// and runtime allowlist but referenced by no configuration/*.json. It was
// removed on 2026-09-21 by decision, not by derivation.
//
// Left here as a note so it is not reinstated on the assumption it was an
// oversight. If a Polaris dev host is needed again, the fix is a committed
// config that references it — at which point the derivation picks it up and no
// hand-editing of the handover page is required.
/**
 * Hosts we used to require and no longer do.
 *
 * A checker that only verifies the required list catches under-permission and
 * is blind to the opposite drift — a policy still granting access to something
 * we stopped using. That is not merely untidy: the App Insights CDN entries
 * below pin an SDK version, so they read as deliberate and would be preserved
 * by anyone tidying the policy, while granting script execution from an origin
 * our bundle never touches.
 *
 * Every entry here was observed in a deployed policy on 2026-09-21.
 */
export const FORMERLY_REQUIRED_HOSTS: { host: string; reason: string }[] = [
  {
    host: "uksouth-1.in.applicationinsights.azure.com",
    reason:
      "Direct App Insights ingestion. Every environment now routes telemetry through " +
      "<polaris-host>/global-components/analytics/ instead, so this is no longer reached.",
  },
  {
    host: "fa-app-insights-proxy-dev.azurewebsites.net",
    reason:
      "An App Insights proxy referenced nowhere in this repository. Predates the current " +
      "analytics routing.",
  },
  {
    host: "js.monitor.azure.com",
    reason:
      "Only the cfgSync config JSON is still fetched from here. Entries naming a versioned " +
      "SDK bundle (ai.<version>.gbl.min.js, or its .map) are stale: the SDK is bundled from " +
      "npm, not loaded from a CDN, and the pinned version misleads on top of being unused.",
  },
  {
    host: "js.cdn.applicationinsights.io",
    reason:
      "App Insights CDN. The SDK is an npm dependency bundled into global-components.js and " +
      "is never fetched from a CDN.",
  },
  {
    host: "sacpsglobalcomponents.blob.core.windows.net",
    reason:
      "The original blob-storage home of the bundle and its config, before both moved behind " +
      "the Polaris host.",
  },
];
