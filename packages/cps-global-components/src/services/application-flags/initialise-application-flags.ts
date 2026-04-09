import { ApplicationFlags } from "./ApplicationFlags";
import { isE2eTestMode } from "./is-e2e-test-mode";
import { isOutSystemsApp } from "./is-outsystems-app";
import { isLocalDevelopment } from "./is-local-development";
import { getEnvironment } from "./get-environment";

type Register = (arg: { flags: ApplicationFlags }) => void;

export const initialiseApplicationFlags = ({ window, rootUrl, register }: { window: Window; rootUrl: string; register: Register }): ApplicationFlags => {
  const flags: ApplicationFlags = {
    isOutSystems: isOutSystemsApp(window),
    e2eTestMode: isE2eTestMode(window),
    isLocalDevelopment: isLocalDevelopment(window),
    ...getEnvironment(rootUrl),
  };
  register({ flags });
  return flags;
};
