import { Config } from "cps-global-configuration";
import { FoundContext } from "../context/FoundContext";
import { Auth, AuthResult, FailedAuth } from "./AuthResult";
import { GetToken } from "./GetToken";
import { ApplicationFlags } from "../application-flags/ApplicationFlags";
import { initialiseMockAuth } from "./initialise-mock-auth";
import { initialiseAdAuth } from "./initialise-ad-auth";
import type { AdDiagnosticsCollector } from "./ad-diagnostics-collector";

type Register = (arg: { auth: AuthResult }) => void;
type RegisterAuthWithAnalytics = (auth: AuthResult) => void;
type SetAuthHint = (auth: Auth) => void;

type Props = {
  config: Config;
  context: FoundContext;
  flags: ApplicationFlags;
  onError?: (error: Error) => void;
  diagnosticsCollector?: AdDiagnosticsCollector;
  register: Register;
  registerAuthWithAnalytics: RegisterAuthWithAnalytics;
  setAuthHint: SetAuthHint;
};

const noAuthResult: { auth: FailedAuth; getToken: GetToken } = {
  auth: { isAuthed: false, knownErrorType: "ADPreventedByContext", reason: "AD auth prevented by context configuration" },
  getToken: () => Promise.resolve(null),
};

export const initialiseAuth = async ({ config, context, flags, onError, diagnosticsCollector, register, registerAuthWithAnalytics, setAuthHint }: Props): Promise<{ auth: AuthResult; getToken: GetToken }> => {
  const result = context.preventADAndDataCalls
    ? noAuthResult
    : await (flags.e2eTestMode.isE2eTestMode ? initialiseMockAuth({ flags }) : initialiseAdAuth({ config, context, onError, diagnosticsCollector }));
  register({ auth: result.auth });
  registerAuthWithAnalytics(result.auth);
  if (result.auth.isAuthed) {
    setAuthHint(result.auth);
  }
  return result;
};
