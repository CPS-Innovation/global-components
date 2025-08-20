import { Config } from "cps-global-configuration";
import { AuthResult } from "../../auth/initialise-auth";

export const setOutSystemsFeatureFlag = ({ window: { localStorage }, auth, config: { FEATURE_FLAG_ENABLE_MENU_GROUP } }: { window: Window; auth: AuthResult; config: Config }) => {
  if (!(auth.isAuthed && FEATURE_FLAG_ENABLE_MENU_GROUP)) {
    return;
  }
  const overrideFlag = auth.groups.includes(FEATURE_FLAG_ENABLE_MENU_GROUP);
  localStorage["$OS_Users$WorkManagementApp$ClientVars$SetGlobalNavOverride"] = localStorage["$OS_Users$CaseReview$ClientVars$SetGlobalNavOverride"] = overrideFlag;
};
