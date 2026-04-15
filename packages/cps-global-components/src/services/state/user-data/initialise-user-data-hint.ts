import { fetchState } from "../fetch-state";
import { StatePutResponseSchema } from "../StatePutResponse";
import { makeConsole } from "../../../logging/makeConsole";
import { Result } from "../../../utils/Result";
import { UserData, UserDataHint, UserDataHintSchema } from "./UserData";

const { _warn } = makeConsole("initialiseUserDataHint");

type Register = (arg: { userDataHint: Result<UserDataHint> }) => void;

export const initialiseUserDataHint = async ({
  rootUrl,
  register,
}: {
  rootUrl: string;
  register: Register;
}): Promise<{ userDataHint: Result<UserDataHint>; setUserDataHint: (userData: UserData) => void }> => {
  const userDataHint = await fetchState({ rootUrl, url: "../state/user-data", schema: UserDataHintSchema });
  register({ userDataHint });

  const setUserDataHint = (userData: UserData) => {
    const data: UserDataHint = { userData, timestamp: Date.now() };
    fetchState({ rootUrl, url: "../state/user-data", schema: StatePutResponseSchema, data }).catch(error =>
      _warn("Unexpected error setting user data hint", String(error)),
    );
  };

  return { userDataHint, setUserDataHint };
};
