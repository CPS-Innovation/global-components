import { z } from "zod";
import { fetchState } from "../fetch-state";
import { StatePutResponseSchema } from "../StatePutResponse";
import { makeConsole } from "../../../logging/makeConsole";
import { Result } from "../../../utils/Result";

const AuthHintSchema = z.string();

const { _warn } = makeConsole("initialiseAuthHint");

export const initialiseAuthHint = async ({ rootUrl }: { rootUrl: string }): Promise<{ authHint: Result<string>; setAuthHint: (sid: string) => void }> => {
  const authHint = await fetchState({ rootUrl, url: "../state/auth-hint", schema: AuthHintSchema });

  const setAuthHint = (sid: string) => {
    fetchState({ rootUrl, url: "../state/auth-hint", schema: StatePutResponseSchema, data: sid }).catch(error =>
      _warn("Unexpected error setting auth hint", String(error)),
    );
  };

  return { authHint, setAuthHint };
};
