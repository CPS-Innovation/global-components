import { AccountInfo } from "@azure/msal-browser";

// Structural slice of PublicClientApplication — only the methods reconcile
// actually touches. Lets unit tests inject a minimal fake without dragging in
// the heavyweight MSAL class. Matches the test-fake pattern used by the other
// handle-msal-* primitives in this package.
export type ReconcileMsalLikeInstance = {
  getActiveAccount: () => AccountInfo | null;
  getAllAccounts: () => AccountInfo[];
  setActiveAccount: (account: AccountInfo | null) => void;
};

export const reconcileActiveAccountAndSid = (
  instance: ReconcileMsalLikeInstance,
  sid: string | null,
): string | null => {
  const getAccountSid = (account: AccountInfo | null) =>
    account?.idTokenClaims?.sid;

  // No sid → no signal to act on; preserve existing active account state.
  // Return active's snapshotted sid (if any) so the caller can use it as a
  // login hint — harmless if stale (AAD ignores stale sid in interactive flow).
  if (!sid) {
    return getAccountSid(instance.getActiveAccount()) ?? null;
  }

  // With an incoming sid, find the account whose snapshotted sid matches and
  // promote it to active. acquireTokenSilent with no explicit account will
  // then use that active account. If no cached account matches the sid we
  // setActiveAccount(null) — deliberate, so the silent step in the cascade is
  // skipped (gated on active being non-null) and we go straight to login,
  // letting AAD establish ground truth for whoever owns the sid.
  const accountForSid =
    instance
      .getAllAccounts()
      .find((account) => getAccountSid(account) === sid) ?? null;

  instance.setActiveAccount(accountForSid);

  return sid;
};
