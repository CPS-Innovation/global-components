import { ApplicationFlags } from "./ApplicationFlags";
import { isOverrideMode } from "./is-override-mode";
import { isE2eTestMode } from "./is-e2e-test-mode";
import { isOutSystemsApp } from "./is-outsystems-app";

export const getApplicationFlags = ({ window }: { window: Window }): ApplicationFlags => ({
  isOverrideMode: isOverrideMode(window),
  isOutSystems: isOutSystemsApp(window),
  isE2eTestMode: isE2eTestMode(window),
});
