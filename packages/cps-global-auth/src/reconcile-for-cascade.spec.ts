import type { AccountInfo } from "@azure/msal-browser";
import type { AuthHint, Result } from "cps-global-configuration";
import { reconcileForCascade } from "./reconcile-for-cascade";

const makeAccount = (sid: string | undefined): AccountInfo =>
  ({
    homeAccountId: "h",
    localAccountId: "l",
    environment: "e",
    tenantId: "t",
    username: "user@example.com",
    idTokenClaims: sid ? { sid } : {},
  }) as AccountInfo;

const authHintWithSid = (sid: string): Result<AuthHint> => ({
  found: true,
  result: {
    authResult: {
      isAuthed: true,
      username: "user@example.com",
      objectId: "oid-1",
      groups: [],
    },
    timestamp: 1,
    lastKnownSid: sid,
  },
});

const authHintWithoutSid: Result<AuthHint> = {
  found: true,
  result: {
    authResult: {
      isAuthed: true,
      username: "user@example.com",
      objectId: "oid-1",
      groups: [],
    },
    timestamp: 1,
  },
};

const authHintNotFound: Result<AuthHint> = {
  found: false,
  error: new Error("not found"),
};

describe("reconcileForCascade", () => {
  it("constructs an instance with the supplied msalConfig + redirectUri and runs reconcile against it", async () => {
    const setActiveAccount = jest.fn();
    const account = makeAccount("sid-a");
    const createInstance = jest.fn().mockResolvedValue({
      getActiveAccount: () => null,
      getAllAccounts: () => [account],
      setActiveAccount,
    });

    const result = await reconcileForCascade({
      msalConfig: { clientId: "c", authority: "a" },
      redirectUri: "https://example.com/redirect",
      authHint: authHintWithSid("sid-a"),
      createInstance,
    });

    expect(createInstance).toHaveBeenCalledWith({
      clientId: "c",
      authority: "a",
      redirectUri: "https://example.com/redirect",
    });
    expect(setActiveAccount).toHaveBeenCalledWith(account);
    expect(result).toBe("sid-a");
  });

  it("treats not-found authHint as no incoming sid (returns null when no active account exists)", async () => {
    const createInstance = jest.fn().mockResolvedValue({
      getActiveAccount: () => null,
      getAllAccounts: () => [],
      setActiveAccount: jest.fn(),
    });

    const result = await reconcileForCascade({
      msalConfig: { clientId: "c", authority: "a" },
      redirectUri: "https://example.com/redirect",
      authHint: authHintNotFound,
      createInstance,
    });

    expect(result).toBeNull();
  });

  it("treats authHint without lastKnownSid as no incoming sid (falls back to active's snapshotted sid)", async () => {
    const account = makeAccount("sid-active");
    const createInstance = jest.fn().mockResolvedValue({
      getActiveAccount: () => account,
      getAllAccounts: () => [account],
      setActiveAccount: jest.fn(),
    });

    const result = await reconcileForCascade({
      msalConfig: { clientId: "c", authority: "a" },
      redirectUri: "https://example.com/redirect",
      authHint: authHintWithoutSid,
      createInstance,
    });

    expect(result).toBe("sid-active");
  });

  it("clears active when authHint sid doesn't match any cached account", async () => {
    const setActiveAccount = jest.fn();
    const account = makeAccount("sid-a");
    const createInstance = jest.fn().mockResolvedValue({
      getActiveAccount: () => account,
      getAllAccounts: () => [account],
      setActiveAccount,
    });

    const result = await reconcileForCascade({
      msalConfig: { clientId: "c", authority: "a" },
      redirectUri: "https://example.com/redirect",
      authHint: authHintWithSid("sid-different"),
      createInstance,
    });

    expect(setActiveAccount).toHaveBeenCalledWith(null);
    expect(result).toBe("sid-different");
  });
});
