import { AccountInfo, PublicClientApplication } from "@azure/msal-browser";
import { Me } from "./AuthResult";
import { LogError } from "./LogError";

// Microsoft Graph delegated scope for reading the signed-in user's profile.
// Already consented on the app registration, so acquireTokenSilent resolves it
// from the MSAL cache (or a silent refresh) without interaction.
const GRAPH_USER_READ_SCOPES = ["https://graph.microsoft.com/User.Read"];
const GRAPH_ME_URL = "https://graph.microsoft.com/v1.0/me?$select=department";

// Only the slice of the MSAL instance getMe needs — lets both the host's full
// PublicClientApplication and the handover termination instance satisfy it.
type TokenAcquirer = Pick<PublicClientApplication, "acquireTokenSilent">;

// Establishes the user's /me profile slice (currently just department) from
// Microsoft Graph. Called on a genuine AD refresh (ssoSilent on the host, or the
// redirect termination on the handover) — never on a routine cached / access-
// token-refresh lookup, which reuses the value persisted in AuthHint. Fully
// non-fatal: any failure (silent-token interaction_required, non-2xx, network,
// parse) resolves to undefined so it can never break the auth cascade. The /me
// access token is a separate resource/audience from the gateway token; MSAL
// caches it independently. logError is optional — the handover bundle has no
// telemetry delegate and passes nothing.
export const getMe = async ({
  instance,
  account,
  logError = () => {},
}: {
  instance: TokenAcquirer;
  account: AccountInfo;
  logError?: LogError;
}): Promise<Me | undefined> => {
  try {
    const { accessToken } = await instance.acquireTokenSilent({ account, scopes: GRAPH_USER_READ_SCOPES });
    const response = await fetch(GRAPH_ME_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) {
      // Pass the error nested in an object so logError console-logs it without
      // routing a synthetic Error to trackException (mirrors initialiseAdAuth).
      logError("getMe: graph /me returned non-ok", { status: response.status });
      return undefined;
    }
    const body = (await response.json()) as { department?: unknown };
    return { department: typeof body.department === "string" ? body.department : undefined };
  } catch (error) {
    logError("getMe failed", { error });
    return undefined;
  }
};
