import { AccountInfo, PublicClientApplication } from "@azure/msal-browser";
import { Me } from "./AuthResult";
import { LogError } from "./LogError";

// Microsoft Graph delegated scope for reading the signed-in user's profile.
// Already consented on the app registration, so acquireTokenSilent resolves it
// from the MSAL cache (or a silent refresh) without interaction.
const GRAPH_USER_READ_SCOPES = ["https://graph.microsoft.com/User.Read"];
const GRAPH_ME_URL = "https://graph.microsoft.com/v1.0/me?$select=department";

// Upper bound on the whole token-acquire + fetch. Errors already soft-fail via
// the try/catch, but a *hung* (never-settling) network — acquireTokenSilent or
// fetch black-holed rather than rejected — would otherwise stall the caller,
// which awaits getMe on the genuine-refresh critical path (host auth
// establishment / handover return navigation). This deadline caps that: on
// timeout we abort the fetch and resolve undefined (same soft-fail as any other
// failure). Comfortably above a healthy /me (sub-second) so it never truncates a
// slow-but-working call.
const GRAPH_ME_TIMEOUT_MS = 5000;

// Only the slice of the MSAL instance getMe needs — lets both the host's full
// PublicClientApplication and the handover termination instance satisfy it.
type TokenAcquirer = Pick<PublicClientApplication, "acquireTokenSilent">;

// Establishes the user's /me profile slice (currently just department) from
// Microsoft Graph. Called on a genuine AD refresh (ssoSilent on the host, or the
// redirect termination on the handover) — never on a routine cached / access-
// token-refresh lookup, which reuses the value persisted in AuthHint. Fully
// non-fatal: any failure (silent-token interaction_required, non-2xx, network,
// parse, or a hang past GRAPH_ME_TIMEOUT_MS) resolves to undefined so it can
// never break — or stall — the auth cascade. The /me access token is a separate
// resource/audience from the gateway token; MSAL caches it independently.
// logError is optional — the handover bundle has no telemetry delegate and
// passes nothing.
export const getMe = async ({
  instance,
  account,
  logError = () => {},
}: {
  instance: TokenAcquirer;
  account: AccountInfo;
  logError?: LogError;
}): Promise<Me | undefined> => {
  // Aborts a hung/slow fetch when the deadline fires; harmless once the fetch
  // has already settled.
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>(resolve => {
    timeoutId = setTimeout(() => {
      controller.abort();
      logError("getMe: timed out", { timeoutMs: GRAPH_ME_TIMEOUT_MS });
      resolve(undefined);
    }, GRAPH_ME_TIMEOUT_MS);
  });

  const work = (async (): Promise<Me | undefined> => {
    try {
      const { accessToken } = await instance.acquireTokenSilent({ account, scopes: GRAPH_USER_READ_SCOPES });
      const response = await fetch(GRAPH_ME_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });
      if (!response.ok) {
        // Pass the error nested in an object so logError console-logs it without
        // routing a synthetic Error to trackException (mirrors initialiseAdAuth).
        logError("getMe: graph /me returned non-ok", { status: response.status });
        return undefined;
      }
      const body = (await response.json()) as { department?: unknown };
      return { department: typeof body.department === "string" ? body.department : undefined };
    } catch (error) {
      // Includes the AbortError from a timeout-triggered abort — same soft-fail.
      logError("getMe failed", { error });
      return undefined;
    }
  })();

  // Whichever settles first wins; the timer is always cleared so a completed
  // fetch never leaves a dangling handle. A timeout only bounds the *caller* —
  // if acquireTokenSilent itself is what's hung, `work` stays pending
  // (harmlessly, its result is caught and ignored) but the caller is freed.
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
};
