// Stages and param keys used by the auth-handover endpoint. Owned here in
// cps-global-configuration so all of the host bundle (cps-global-components,
// cps-global-auth) and the handover bundle (cps-global-handover) can import
// them without creating a workspace dependency cycle.
//
// `os-cookie-return` / `os-token-return` come from the OS auth handover
// (CMS → OS session translation) and are still emitted by the nginx proxy
// layer; the `os-` prefix is retained so the proxy / OutSystems URL shapes
// don't need re-issuing.
//
// `ad-redirect` carries the host-page-initiated MSAL full-page redirect and
// its AAD bounce-back. Renamed from the earlier `os-ad-redirect` because the
// redirect endpoint is now shared between Polaris and OS variants — the stage
// name should not imply OS ownership.

export const HANDOVER_PARAM_KEYS = {
  STAGE: "stage",
  COOKIES: "cc",
  R: "r",
  TOKEN: "cms-modern-token",
  SRC: "src",
  RETURN_TO: "returnTo",
} as const;

export const HANDOVER_STAGES = {
  OS_COOKIE_RETURN: "os-cookie-return",
  OS_TOKEN_RETURN: "os-token-return",
  AD_REDIRECT: "ad-redirect",
  // Preemptive AD validation. Bolts onto the OS cookie/token return paths so
  // the AD check happens on the handover endpoint instead of after the host
  // app has booted. Also the public entry point for external entities that
  // want to land the user on a host page with valid AD auth already in place.
  // See packages/cps-global-handover/EXTERNAL-ENTRY.md.
  ENSURE_AD: "ensure-ad",
} as const;

export type HandoverStage = (typeof HANDOVER_STAGES)[keyof typeof HANDOVER_STAGES];
