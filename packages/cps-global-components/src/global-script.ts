import { trySetupOutSystemsShim } from "./override-mode/outsystems-shim/try-setup-outsystems-shim";
import { trySetupOverrideMode } from "./override-mode/try-setup-override-mode";

export default () => {
  trySetupOutSystemsShim();
  trySetupOverrideMode();
};
