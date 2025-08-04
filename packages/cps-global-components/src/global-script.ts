//import { msal } from "./auth/msal";
import { initialiseConfig } from "./config/config-async";
import { detectOverrideMode } from "./override-mode/detect-override-mode";
import { setupOutSystemsShim } from "./override-mode/outsystems-shim/setup-outsystems-shim";
import { handleOverrideSetMode } from "./override-mode/handle-override-set-mode";
import { setupOverrideMode } from "./override-mode/setup-override-mode";
import { isOSAuthMisaligned, createOutboundUrl } from "cps-global-os-handover";
import { isOutSystemsApp } from "./helpers/is-outsystems-app";
export default async () => {
  handleOverrideSetMode();

  const isOverrideMode = detectOverrideMode(window);
  const configPromise = initialiseConfig(isOverrideMode);
  if (isOverrideMode) {
    setupOutSystemsShim(window);
    setupOverrideMode(window);

    const isAuthRealignmentRequired = isOutSystemsApp(window.location.href) && isOSAuthMisaligned();
    if (isAuthRealignmentRequired) {
      const { OS_HANDOVER_URL } = await configPromise;
      const redirectUrl = createOutboundUrl({ handoverUrl: OS_HANDOVER_URL, targetUrl: window.location.href });
      console.log(`OS auths not aligned: navigate to ${redirectUrl}`);
    }
  }
};
