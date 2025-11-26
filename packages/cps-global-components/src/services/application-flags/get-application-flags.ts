import { ApplicationFlags } from "./ApplicationFlags";
import { isOverrideMode } from "./is-override-mode";
import { isE2eTestMode } from "./is-e2e-test-mode";
import { isOutSystemsApp } from "./is-outsystems-app";
import { isLocalDevelopment } from "./is-local-development";

export const getApplicationFlags = ({ window }: { window: Window }): ApplicationFlags => ({
  isOverrideMode: isOverrideMode(window),
  isOutSystems: isOutSystemsApp(window),
  e2eTestMode: isE2eTestMode(window),
  isLocalDevelopment: isLocalDevelopment(window),
});
