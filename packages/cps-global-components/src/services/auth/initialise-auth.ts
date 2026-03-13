import { Config } from "cps-global-configuration";
import { FoundContext } from "../context/FoundContext";
import { AuthResult, FailedAuth } from "./AuthResult";
import { GetToken } from "./GetToken";
import { ApplicationFlags } from "../application-flags/ApplicationFlags";
import { initialiseMockAuth } from "./initialise-mock-auth";
import { initialiseAdAuth } from "./initialise-ad-auth";

type Props = {
  config: Config;
  context: FoundContext;
  flags: ApplicationFlags;
  onError?: (error: Error) => void;
};

const noAuthResult: { auth: FailedAuth; getToken: GetToken } = {
  auth: { isAuthed: false, knownErrorType: "ADPreventedByContext", reason: "AD auth prevented by context configuration" },
  getToken: () => Promise.resolve(null),
};

export const initialiseAuth = async ({ config, context, flags, onError }: Props): Promise<{ auth: AuthResult; getToken: GetToken }> => {
  if (context.preventADAndDataCalls) return noAuthResult;
  return flags.e2eTestMode.isE2eTestMode ? initialiseMockAuth({ flags }) : initialiseAdAuth({ config, context, onError });
};
