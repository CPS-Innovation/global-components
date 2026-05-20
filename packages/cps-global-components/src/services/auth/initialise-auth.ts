import { ApplicationFlags, AuthHint, AuthResult, Config, FailedAuth, FEATURE_FLAGS, FoundContext, Preview } from "cps-global-configuration";
import { initialiseAdAuth } from "cps-global-auth";
import { GetToken } from "./GetToken";
import { initialiseMockAuth } from "./initialise-mock-auth";
import { TrackException } from "../analytics/TrackException";
import { Result } from "../../utils/Result";
import { SetAuthHint } from "../state/auth-hint/initialise-auth-hint";
import { makeConsole } from "../../logging/makeConsole";

type Register = (arg: { auth: AuthResult }) => void;
type RegisterAuthWithAnalytics = (auth: AuthResult) => void;

type Props = {
  config: Config;
  // preview + authHint are read here only to evaluate
  // FEATURE_FLAGS.shouldUseFullPageMsalRedirect — keeping the policy decision
  // colocated with the auth wiring rather than scattering it through global-script.
  preview: Result<Preview>;
  authHint: Result<AuthHint>;
  flags: ApplicationFlags;
  trackException: TrackException;
  register: Register;
  registerAuthWithAnalytics: RegisterAuthWithAnalytics;
  setAuthHint: SetAuthHint;
  window: Window;
};

type AuthOutcome = {
  auth: AuthResult;
  getToken: GetToken;
  // Populated by initialiseAdAuth on a successful cascade; absent for the
  // mock path and the "prevented by context" path.
  lastKnownSid?: string;
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
  register,
  registerAuthWithAnalytics,
  setAuthHint,
  window,
}: Props): { initialiseAuthForContext: (context: FoundContext) => Promise<AuthOutcome> } => {
  const isE2e = flags.e2eTestMode.isE2eTestMode;

  // Resolve the redirect-vs-silent decision once at startup. auth itself is
  // not yet established here — the predicate falls back to authHint for
  // identity, sufficient for both the AD-group rollout check and the
  // preview-token override.
  const useFullPageRedirect = FEATURE_FLAGS.shouldUseFullPageMsalRedirect({ config, preview, auth: undefined, authHint });

  // Single error delegate handed down to cps-global-auth: console-log under
  // our namespace AND telemetry-track to App Insights. The library hands every
  // error it surfaces through this hook — no separate onError concept.
  const { _error } = makeConsole("auth");
  const logError = (...data: unknown[]) => {
    _error(...data);
    const error = data.find(d => d instanceof Error) as Error | undefined;
    if (error) {
      trackException(error, { type: "auth" });
    }
  };

  let authInFlight: Promise<AuthOutcome> | null = null;

  const initialiseAuthForContext = async (context: FoundContext): Promise<AuthOutcome> => {
    // Guard against concurrent calls (e.g. rapid SPA navigation while auth is in-flight)
    if (authInFlight) {
      return authInFlight;
    }

    const doAuth = async (): Promise<AuthOutcome> =>
      context.preventADAndDataCalls
        ? noAuthResult
        : isE2e
          ? initialiseMockAuth({ flags })
          : initialiseAdAuth({ config, context, logError, useFullPageRedirect, window });

    authInFlight = doAuth()
      .then(result => {
        register({ auth: result.auth });
        registerAuthWithAnalytics(result.auth);
        if (result.auth.isAuthed) {
          // Forward the fresh sid (if any) so the persisted hint stays in
          // sync — without this, every successful cascade would overwrite the
          // hint and drop the sid the bundle just wrote back.
          setAuthHint(result.auth, trackException, result.lastKnownSid);
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
