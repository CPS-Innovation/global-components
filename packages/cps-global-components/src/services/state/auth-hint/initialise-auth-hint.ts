import { z } from "zod";
import { fetchState } from "../fetch-state";
import { StatePutResponseSchema } from "../StatePutResponse";
import { makeConsole } from "../../../logging/makeConsole";
import { Result } from "../../../utils/Result";
import { Auth, AuthSchema } from "../../auth/AuthResult";

const AuthHintSchema = z.object({
  authResult: AuthSchema,
  timestamp: z.number(),
});

export type AuthHint = z.infer<typeof AuthHintSchema>;

const { _warn } = makeConsole("initialiseAuthHint");

type Register = (arg: { authHint: Result<AuthHint> }) => void;

export const initialiseAuthHint = async ({ rootUrl, register }: { rootUrl: string; register: Register }): Promise<{ authHint: Result<AuthHint>; setAuthHint: (auth: Auth) => void }> => {
  const authHint = await fetchState({ rootUrl, url: "../state/auth-hint", schema: AuthHintSchema });
  register({ authHint });

  const setAuthHint = (auth: Auth) => {
    const data: AuthHint = { authResult: auth, timestamp: Date.now() };
    fetchState({ rootUrl, url: "../state/auth-hint", schema: StatePutResponseSchema, data }).catch(error =>
      _warn("Unexpected error setting auth hint", String(error)),
    );
  };

  return { authHint, setAuthHint };
};
