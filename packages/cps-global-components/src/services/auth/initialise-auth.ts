import { Config } from "cps-global-configuration";
import { FoundContext } from "../context/FoundContext";
import { Auth, AuthResult, FailedAuth } from "./AuthResult";
import { GetToken } from "./GetToken";
import { ApplicationFlags } from "../application-flags/ApplicationFlags";
import { initialiseMockAuth } from "./initialise-mock-auth";
import { initialiseAdAuth } from "./initialise-ad-auth";
import { createMsalInstance } from "./create-msal-instance";
import type { PublicClientApplication } from "@azure/msal-browser";
import type { SilentFlowDiagnostic, SilentFlowDiagnostics } from "../diagnostics/silent-flow-diagnostics";
import { TrackException } from "../analytics/TrackException";

type Register = (arg: { auth: AuthResult }) => void;
type RegisterAuthWithAnalytics = (auth: AuthResult) => void;
type SetAuthHint = (auth: Auth, trackException?: TrackException) => void;
type AddSilentFlowDiagnostics = (entry: SilentFlowDiagnostic) => void;
type GetOperationId = () => string | undefined;

type Props = {
  config: Config;
  flags: ApplicationFlags;
  trackException: TrackException;
  silentFlowDiagnostics?: SilentFlowDiagnostics;
  addSilentFlowDiagnostics?: AddSilentFlowDiagnostics;
  getOperationId?: GetOperationId;
  register: Register;
  registerAuthWithAnalytics: RegisterAuthWithAnalytics;
  setAuthHint: SetAuthHint;
};

const noAuthResult: { auth: FailedAuth; getToken: GetToken } = {
  auth: { isAuthed: false, knownErrorType: "ADPreventedByContext", reason: "AD auth prevented by context configuration" },
  getToken: () => Promise.resolve(null),
};

// The MSAL instance is created lazily on the first call to initialiseAuthForContext,
// then reused for all subsequent calls. Assumption: SPA navigation does not change
// the host app origin, so the redirect URI from the first context remains valid for
// all contexts within the same page session.
export const initialiseAuth = ({
  config,
  flags,
  trackException,
  silentFlowDiagnostics,
  addSilentFlowDiagnostics,
  getOperationId,
  register,
  registerAuthWithAnalytics,
  setAuthHint,
}: Props): { initialiseAuthForContext: (context: FoundContext) => Promise<{ auth: AuthResult; getToken: GetToken }> } => {
  const isE2e = flags.e2eTestMode.isE2eTestMode;
  const { AD_TENANT_AUTHORITY: authority, AD_CLIENT_ID: clientId } = config;

  const onError = (error: Error) =>
    trackException(error, {
      type: "auth",
      properties: {
        ...(silentFlowDiagnostics && { silentFlowDiagnostics }),
      },
    });

  let instance: PublicClientApplication | undefined;
  let authInFlight: Promise<{ auth: AuthResult; getToken: GetToken }> | null = null;

  const initialiseAuthForContext = async (ctx: FoundContext): Promise<{ auth: AuthResult; getToken: GetToken }> => {
    // Guard against concurrent calls (e.g. rapid SPA navigation while auth is in-flight)
    if (authInFlight) {
      return authInFlight;
    }

    const doAuth = async (): Promise<{ auth: AuthResult; getToken: GetToken }> => {
      if (ctx.preventADAndDataCalls) {
        return noAuthResult;
      }

      if (isE2e) {
        return initialiseMockAuth({ flags });
      }

      // Create the MSAL instance lazily on first real auth attempt
      if (!instance && authority && clientId && ctx.msalRedirectUrl) {
        instance = await createMsalInstance({ authority, clientId, redirectUri: ctx.msalRedirectUrl });
      }

      return initialiseAdAuth({ config, context: ctx, onError, addSilentFlowDiagnostics, getOperationId, instance });
    };

    authInFlight = doAuth()
      .then(result => {
        register({ auth: result.auth });
        registerAuthWithAnalytics(result.auth);
        if (result.auth.isAuthed) {
          setAuthHint(result.auth, trackException);
        }
        return result;
      })
      .finally(() => {
        authInFlight = null;
      });

    return authInFlight;
  };

  return { initialiseAuthForContext };
};
