//import { msal } from "./auth/msal";
import { initialiseConfig } from "./config/config-async";
import { detectOverrideMode } from "./override-mode/detect-override-mode";
import { trySetupOutSystemsShim } from "./override-mode/outsystems-shim/try-setup-outsystems-shim";
import { tryHandleOverrideSetMode } from "./override-mode/try-handle-override-set-mode";
import { trySetupOverrideMode } from "./override-mode/try-setup-override-mode";

export default async () => {
  tryHandleOverrideSetMode();

  const isOverrideMode = detectOverrideMode(window);
  /*const configPromise = */ initialiseConfig(isOverrideMode); // no need to await, we're just optimising by kicking this off asap
  if (isOverrideMode) {
    trySetupOutSystemsShim(window);
    trySetupOverrideMode(window);
    // const { AD_TENANT_ID, AD_CLIENT_ID } = await configPromise;
    // if (AD_TENANT_ID && AD_CLIENT_ID) {
    //   await msal(AD_TENANT_ID, AD_CLIENT_ID);
    // }
  }
};
