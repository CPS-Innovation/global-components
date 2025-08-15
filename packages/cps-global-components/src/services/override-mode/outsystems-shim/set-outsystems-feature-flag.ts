import { Auth } from "../../auth/initialise-auth";

export const setOutSystemsFeatureFlag = ({ groups }: Auth) => {
  const overrideFlag = groups.includes("12377eca-b463-4a6c-80ea-95f678f09591");
  localStorage["$OS_Users$WorkManagementApp$ClientVars$SetGlobalNavOverride"] = localStorage["$OS_Users$CaseReview$ClientVars$SetGlobalNavOverride"] = overrideFlag;
};
