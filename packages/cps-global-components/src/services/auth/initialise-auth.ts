import { Config, Preview } from "cps-global-configuration";
import { initialiseAdAuth } from "cps-global-auth";
import { Auth, AuthResult, FailedAuth } from "./AuthResult";
import { GetToken } from "./GetToken";
import { FoundContext } from "../context/FoundContext";
import { ApplicationFlags } from "../application-flags/ApplicationFlags";
import { initialiseMockAuth } from "./initialise-mock-auth";
import type { SilentFlowDiagnostic, SilentFlowDiagnostics } from "../diagnostics/silent-flow-diagnostics";
import { TrackException } from "../analytics/TrackException";
import { FEATURE_FLAGS } from "../../feature-flags/feature-flags";
import { Result } from "../../utils/Result";
import { AuthHint } from "../state/auth-hint/initialise-auth-hint";

type Register = (arg: { auth: AuthResult }) => void;
type RegisterAuthWithAnalytics = (auth: AuthResult) => void;
type SetAuthHint = (auth: Auth, trackException?: TrackException) => void;
type AddSilentFlowDiagnostics = (entry: SilentFlowDiagnostic) => void;
type GetOperationId = () => string | undefined;

type Props = {
  config: Config;
  // preview + authHint are read here only to evaluate
  // FEATURE_FLAGS.shouldUseFullPageMsalRedirect — keeping the policy decision
  // colocated with the auth wiring rather than scattering it through global-script.
  preview: Result<Preview>;
  authHint: Result<AuthHint>;
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

export const initialiseAuth = ({
  config,
  preview,
  authHint,
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

  // Resolve the redirect-vs-silent decision once at startup. auth itself is
  // not yet established here — the predicate falls back to authHint for
  // identity, sufficient for both the AD-group rollout check and the
  // preview-token override.
  const useFullPageRedirect = FEATURE_FLAGS.shouldUseFullPageMsalRedirect({ config, preview, auth: undefined, authHint });

  const onError = (error: Error) =>
    trackException(error, {
      type: "auth",
      properties: {
        ...(silentFlowDiagnostics && { silentFlowDiagnostics }),
      },
    });

  let authInFlight: Promise<{ auth: AuthResult; getToken: GetToken }> | null = null;

  const initialiseAuthForContext = async (ctx: FoundContext): Promise<{ auth: AuthResult; getToken: GetToken }> => {
    // Guard against concurrent calls (e.g. rapid SPA navigation while auth is in-flight)
    if (authInFlight) {
      return authInFlight;
    }

    const doAuth = async (): Promise<{ auth: AuthResult; getToken: GetToken }> =>
      ctx.preventADAndDataCalls
        ? noAuthResult
        : isE2e
          ? initialiseMockAuth({ flags })
          : initialiseAdAuth({ config, context: ctx, onError, addSilentFlowDiagnostics, getOperationId, useFullPageRedirect });

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
