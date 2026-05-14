import { HANDOVER_PARAM_KEYS, HANDOVER_STAGES } from "cps-global-configuration";

// Re-key the current handover URL as `stage=ensure-ad&returnTo=<target>` and
// navigate. Used by both OS handover stages (cookie-return and token-return)
// to bounce through the AD preemptive-check endpoint before the user reaches
// the target host app. See packages/cps-global-handover/EXTERNAL-ENTRY.md.
//
// Any leftover OS-handover params (r / cc / cms-modern-token) are dropped on
// the way — they've already been consumed and have no meaning past this point.
// `?src=` is preserved so the OS HTML can re-inject the bundle if the
// ensure-ad branch falls through to a full-page AAD redirect.
export const navigateViaEnsureAd = (win: Window, target: string): void => {
  const url = new URL(win.location.href);
  url.searchParams.delete(HANDOVER_PARAM_KEYS.R);
  url.searchParams.delete(HANDOVER_PARAM_KEYS.COOKIES);
  url.searchParams.delete(HANDOVER_PARAM_KEYS.TOKEN);
  url.searchParams.set(HANDOVER_PARAM_KEYS.STAGE, HANDOVER_STAGES.ENSURE_AD);
  url.searchParams.set(HANDOVER_PARAM_KEYS.RETURN_TO, target);
  win.location.replace(url.toString());
};
