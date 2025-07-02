import { initialiseConfig } from "./config/config-async";
import { detectOverrideMode } from "./override-mode/detect-override-mode";
import { trySetupOutSystemsShim } from "./override-mode/outsystems-shim/try-setup-outsystems-shim";
import { tryHandleOverrideSetMode } from "./override-mode/try-handle-override-set-mode";
import { trySetupOverrideMode } from "./override-mode/try-setup-override-mode";

export default async () => {
  tryHandleOverrideSetMode();

  const isOverrideMode = detectOverrideMode(window);
  initialiseConfig(isOverrideMode);
  if (isOverrideMode) {
    trySetupOutSystemsShim(window);
    trySetupOverrideMode(window);
  }
};
