import { Config } from "cps-global-configuration";
import { FoundContext } from "../context/FoundContext";
import { AuthResult } from "./AuthResult";
import { GetToken } from "./GetToken";
import { ApplicationFlags } from "../application-flags/ApplicationFlags";
import { initialiseMockAuth } from "./initialise-mock-auth";
import { initialiseAdAuth } from "./initialise-ad-auth";

type Props = {
  config: Config;
  context: FoundContext;
  flags: ApplicationFlags;
};

export const initialiseAuth = async ({ config, context, flags }: Props): Promise<{ auth: AuthResult; getToken: GetToken }> =>
  flags.e2eTestMode.isE2eTestMode ? initialiseMockAuth({ flags }) : initialiseAdAuth({ config, context });
