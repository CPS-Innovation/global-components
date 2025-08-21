import { detectOverrideMode } from "./override-mode/detect-override-mode";
// import { setupOutSystemsShim } from "./override-mode/outsystems-shim/setup-outsystems-shim";
import { handleOverrideSetMode } from "./override-mode/handle-override-set-mode";
import { setupOverrideMode } from "./override-mode/setup-override-mode";
import { isOSAuthMisaligned, createOutboundUrl } from "cps-global-os-handover";
import { isOutSystemsApp } from "./utils/is-outsystems-app";
import { initialiseMsal, msal } from "./auth/msal";
import { CONFIG, initialiseConfig } from "./config/config-async";
export default async () => {
  handleOverrideSetMode();

  const isOverrideMode = detectOverrideMode(window);
  initialiseConfig(isOverrideMode);

  if (isOverrideMode) {
    //setupOutSystemsShim(window);
    setupOverrideMode(window);

    const config = await CONFIG();
    initialiseMsal(window, config);
    msal()
      .then(async ({ isAuthed, username, error, groups }) => {
        console.log({ isAuthed, username, error, groups });
        if (!isOutSystemsApp(window.location.href)) {
          return;
        }
        const overrideFlag = isOutSystemsApp(window.location.href) && groups.includes("12377eca-b463-4a6c-80ea-95f678f09591");
        localStorage["$OS_Users$WorkManagementApp$ClientVars$SetGlobalNavOverride"] = localStorage["$OS_Users$CaseReview$ClientVars$SetGlobalNavOverride"] = overrideFlag;
      })
      .catch(err => console.error(err));

    // Temporary code
    const isAuthRealignmentRequired = isOutSystemsApp(window.location.href) && isOSAuthMisaligned();
    if (isAuthRealignmentRequired) {
      const redirectUrl = createOutboundUrl({ handoverUrl: config.OS_HANDOVER_URL, targetUrl: window.location.href });
      console.log(`OS auths not aligned: navigate to ${redirectUrl}`);
    }
  }
};
