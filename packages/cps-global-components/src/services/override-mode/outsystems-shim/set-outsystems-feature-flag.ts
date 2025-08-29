import { Config } from "cps-global-configuration";
import { AuthResult } from "../../auth/initialise-auth";
import { ApplicationFlags } from "../../application-flags/ApplicationFlags";
import { setupOutSystemsShim } from "./setup-outsystems-shim";

export const setOutSystemsFeatureFlag = ({
  window,
  flags: { isOutSystems },
  auth,
  config: { FEATURE_FLAG_ENABLE_MENU_GROUP },
}: {
  window: Window;
  flags: ApplicationFlags;
  auth: AuthResult;
  config: Config;
}) => {
  if (!(auth.isAuthed && FEATURE_FLAG_ENABLE_MENU_GROUP && isOutSystems)) {
    return;
  }
  const overrideFlag = auth.groups.includes(FEATURE_FLAG_ENABLE_MENU_GROUP);
  window.localStorage["$OS_Users$WorkManagementApp$ClientVars$SetGlobalNavOverride"] = window.localStorage["$OS_Users$CaseReview$ClientVars$SetGlobalNavOverride"] = overrideFlag;

  if (overrideFlag) {
    setupOutSystemsShim(window);
  }
};
