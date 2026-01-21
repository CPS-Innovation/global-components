import { ApplicationFlags } from "./ApplicationFlags";
import { isE2eTestMode } from "./is-e2e-test-mode";
import { isOutSystemsApp } from "./is-outsystems-app";
import { isLocalDevelopment } from "./is-local-development";
import { getEnvironment } from "./get-environment";

export const getApplicationFlags = ({ window, rootUrl }: { window: Window; rootUrl: string }): ApplicationFlags => ({
  isOutSystems: isOutSystemsApp(window),
  e2eTestMode: isE2eTestMode(window),
  isLocalDevelopment: isLocalDevelopment(window),
  environment: getEnvironment(rootUrl),
});
