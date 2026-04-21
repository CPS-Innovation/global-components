import { fetchState } from "../fetch-state";
import { StatePutResponseSchema } from "../StatePutResponse";
import { makeConsole } from "../../../logging/makeConsole";
import { Result } from "../../../utils/Result";
import { UserDataHint, UserDataHintPayload, UserDataHintSchema } from "./UserData";
import { TrackException } from "../../analytics/TrackException";

const { _warn } = makeConsole("initialiseUserDataHint");

type Register = (arg: { userDataHint: Result<UserDataHint> }) => void;

export const initialiseUserDataHint = async ({
  rootUrl,
  register,
}: {
  rootUrl: string;
  register: Register;
}): Promise<{ userDataHint: Result<UserDataHint>; setUserDataHint: (userData: UserDataHintPayload, trackException: TrackException) => void }> => {
  const userDataHint = await fetchState({ rootUrl, url: "../state/user-data-hint", schema: UserDataHintSchema });
  register({ userDataHint });

  const setUserDataHint = (userData: UserDataHintPayload, trackException: TrackException) => {
    const data: UserDataHint = { userData, timestamp: Date.now() };
    fetchState({ rootUrl, url: "../state/user-data-hint", schema: StatePutResponseSchema, data }).then(r => {
      if (!r.found) {
        trackException(r.error instanceof Error ? r.error : new Error(String(r.error)), { type: "state", code: "state-user-data-hint-set" });
        _warn("Unexpected error setting user data hint", String(r.error));
      }
    });
  };

  return { userDataHint, setUserDataHint };
};
