import { Config } from "cps-global-configuration";
import { AuthResult } from "../services/auth/initialise-auth";
import { FoundContext } from "../services/context/find-context";
import { Tags } from "@microsoft/applicationinsights-web";
import { ApplicationFlags } from "../services/application-flags/ApplicationFlags";

export type KnownState = { fatalInitialisationError: Error; flags: ApplicationFlags; config: Config; context: FoundContext; auth: AuthResult; tags: Tags };

export type State = {
  [K in keyof KnownState]: KnownState[K] | undefined;
};

export const initialInternalState: State = {
  flags: undefined,
  config: undefined,
  auth: undefined,
  context: undefined,
  tags: undefined,
  fatalInitialisationError: undefined,
};
