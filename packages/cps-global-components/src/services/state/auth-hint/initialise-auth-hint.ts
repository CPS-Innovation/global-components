import { Auth, AuthHint, AuthHintSchema, fetchState } from "cps-global-configuration";
import { StatePutResponseSchema } from "../StatePutResponse";
import { makeConsole } from "../../../logging/makeConsole";
import { Result } from "../../../utils/Result";
import { TrackException } from "../../analytics/TrackException";

const { _warn } = makeConsole("initialiseAuthHint");

type Register = (arg: { authHint: Result<AuthHint> }) => void;

export type SetAuthHint = (auth: Auth, trackException: TrackException) => void;

export const initialiseAuthHint = async ({
  rootUrl,
  register,
}: {
  rootUrl: string;
  register: Register;
}): Promise<{ authHint: Result<AuthHint>; setAuthHint: SetAuthHint }> => {
  const authHint = await fetchState({ rootUrl, url: "../state/auth-hint", schema: AuthHintSchema });
  register({ authHint });

  const setAuthHint: SetAuthHint = (auth, trackException) => {
    const data: AuthHint = { authResult: auth, timestamp: Date.now() };
    fetchState({ rootUrl, url: "../state/auth-hint", schema: StatePutResponseSchema, data }).then(r => {
      if (!r.found) {
        trackException(r.error instanceof Error ? r.error : new Error(String(r.error)), { type: "state", code: "state-auth-hint-set" });
        _warn("Unexpected error setting auth hint", String(r.error));
      }
    });
  };

  return { authHint, setAuthHint };
};
