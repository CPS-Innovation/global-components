import type { AccountInfo } from "@azure/msal-browser";
import {
  reconcileActiveAccountAndSid,
  ReconcileMsalLikeInstance,
} from "./reconcile-active-account-and-sid";

const makeAccount = (
  homeAccountId: string,
  sid: string | undefined,
): AccountInfo =>
  ({
    homeAccountId,
    localAccountId: `oid-${homeAccountId}`,
    environment: "login.microsoftonline.com",
    tenantId: "tenant",
    username: `user-${homeAccountId}@example.com`,
    idTokenClaims: sid ? { sid } : {},
  }) as AccountInfo;

const makeInstance = ({
  active,
  all,
}: {
  active: AccountInfo | null;
  all: AccountInfo[];
}): ReconcileMsalLikeInstance & {
  setActiveAccount: jest.Mock;
} => ({
  getActiveAccount: jest.fn(() => active),
  getAllAccounts: jest.fn(() => all),
  setActiveAccount: jest.fn(),
});

describe("reconcileActiveAccountAndSid", () => {
  describe("no incoming sid", () => {
    it("returns null when no active account exists (matrix: no accounts × no sid)", () => {
      const instance = makeInstance({ active: null, all: [] });
      expect(reconcileActiveAccountAndSid(instance, null)).toBeNull();
      expect(instance.setActiveAccount).not.toHaveBeenCalled();
    });

    it("returns the active account's snapshotted sid when active is set (matrix: account active × no sid)", () => {
      const a = makeAccount("a", "sid-a");
      const instance = makeInstance({ active: a, all: [a] });
      expect(reconcileActiveAccountAndSid(instance, null)).toBe("sid-a");
      expect(instance.setActiveAccount).not.toHaveBeenCalled();
    });

    it("returns null when active account has no snapshotted sid", () => {
      const a = makeAccount("a", undefined);
      const instance = makeInstance({ active: a, all: [a] });
      expect(reconcileActiveAccountAndSid(instance, null)).toBeNull();
      expect(instance.setActiveAccount).not.toHaveBeenCalled();
    });

    it("does NOT mutate active account when no incoming sid (preserves existing state)", () => {
      const a = makeAccount("a", "sid-a");
      const instance = makeInstance({ active: a, all: [a] });
      reconcileActiveAccountAndSid(instance, null);
      expect(instance.setActiveAccount).not.toHaveBeenCalled();
    });
  });

  describe("with incoming sid", () => {
    it("sets active to the account whose snapshot matches and returns the incoming sid (matrix: known sid × account active)", () => {
      const a = makeAccount("a", "sid-a");
      const b = makeAccount("b", "sid-b");
      const instance = makeInstance({ active: null, all: [a, b] });

      const result = reconcileActiveAccountAndSid(instance, "sid-b");

      expect(result).toBe("sid-b");
      expect(instance.setActiveAccount).toHaveBeenCalledWith(b);
    });

    it("clears active (setActiveAccount(null)) when no cached account snapshot matches the sid (matrix: unknown sid × accounts)", () => {
      const a = makeAccount("a", "sid-a");
      const instance = makeInstance({ active: a, all: [a] });

      const result = reconcileActiveAccountAndSid(instance, "sid-unknown");

      expect(result).toBe("sid-unknown");
      expect(instance.setActiveAccount).toHaveBeenCalledWith(null);
    });

    it("clears active when there are no cached accounts at all (matrix: known/unknown sid × no accounts)", () => {
      const instance = makeInstance({ active: null, all: [] });

      const result = reconcileActiveAccountAndSid(instance, "sid-foo");

      expect(result).toBe("sid-foo");
      expect(instance.setActiveAccount).toHaveBeenCalledWith(null);
    });

    it("ignores cached accounts whose idTokenClaims has no sid", () => {
      const a = makeAccount("a", undefined);
      const b = makeAccount("b", "sid-b");
      const instance = makeInstance({ active: null, all: [a, b] });

      reconcileActiveAccountAndSid(instance, "sid-b");

      expect(instance.setActiveAccount).toHaveBeenCalledWith(b);
    });

    it("returns the first match when multiple accounts share the same snapshotted sid (defensive — shouldn't happen)", () => {
      const a = makeAccount("a", "sid-shared");
      const b = makeAccount("b", "sid-shared");
      const instance = makeInstance({ active: null, all: [a, b] });

      reconcileActiveAccountAndSid(instance, "sid-shared");

      expect(instance.setActiveAccount).toHaveBeenCalledWith(a);
    });

    it("re-promotes a non-active account whose snapshot matches the incoming sid", () => {
      const a = makeAccount("a", "sid-a");
      const b = makeAccount("b", "sid-b");
      const instance = makeInstance({ active: a, all: [a, b] });

      reconcileActiveAccountAndSid(instance, "sid-b");

      expect(instance.setActiveAccount).toHaveBeenCalledWith(b);
    });
  });
});
