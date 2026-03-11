import { Config } from "cps-global-configuration";
import { FoundContext } from "../context/FoundContext";
import { AuthResult } from "./AuthResult";
import { GetToken } from "./GetToken";
import { ApplicationFlags } from "../application-flags/ApplicationFlags";
import { initialiseMockAuth } from "./initialise-mock-auth";
import { initialiseAdAuth } from "./initialise-ad-auth";
import { Result } from "../../utils/Result";

type Props = {
  config: Config;
  context: FoundContext;
  flags: ApplicationFlags;
  onError?: (error: Error) => void;
  authHint?: Result<string>;
  setAuthHint?: (sid: string) => void;
};

export const initialiseAuth = async ({ config, context, flags, onError, authHint, setAuthHint }: Props): Promise<{ auth: AuthResult; getToken: GetToken }> =>
  flags.e2eTestMode.isE2eTestMode ? initialiseMockAuth({ flags }) : initialiseAdAuth({ config, context, onError, authHint, setAuthHint });
