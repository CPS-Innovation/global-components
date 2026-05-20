import { handleMsalEnsureAd } from "./handle-msal-ensure-ad";

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

const makeWindow = ({
  origin = "https://example.com",
  iframe = false,
  interactionStatus,
}: {
  origin?: string;
  iframe?: boolean;
  interactionStatus?: string;
} = {}) => {
  const top = {} as Window;
  const self = iframe ? ({} as Window) : top;
  const store: Record<string, string> = {};
  if (interactionStatus) {
    store["msal.interaction.status"] = interactionStatus;
  }
  return {
    self,
    top,
    location: {
      origin,
      pathname: "/global-components/test/auth-handover.html",
      search: "",
      hash: "",
      href: `${origin}/global-components/test/auth-handover.html`,
      replace: jest.fn(),
      assign: jest.fn(),
    },
    sessionStorage: {
      getItem: jest.fn((k: string) => store[k] ?? null),
      setItem: jest.fn((k: string, v: string) => {
        store[k] = v;
      }),
      removeItem: jest.fn((k: string) => {
        delete store[k];
      }),
    },
  } as unknown as Window;
};

const account = {
  homeAccountId: "h",
  localAccountId: "l",
  environment: "e",
  tenantId: "t",
  username: "user@example.com",
  idTokenClaims: { oid: "obj-123" },
} as never;

describe("handleMsalEnsureAd", () => {
  it("returns 'iframe-noop' inside an iframe and never touches MSAL", async () => {
    const createInstance = jest.fn();

    const result = await handleMsalEnsureAd(
      makeWindow({ iframe: true }),
      { clientId: "c", authority: "a" },
      "https://example.com/target",
      "https://example.com/global-components/test/auth-handover.html?src=x&stage=ad-redirect",
      ["User.Read"],
      createInstance,
    );

    expect(result).toBe("iframe-noop");
    expect(createInstance).not.toHaveBeenCalled();
  });

  it("navigates to validated returnTo on silent success and never calls loginRedirect", async () => {
    const acquireTokenSilent = jest.fn().mockResolvedValue({ account });
    const loginRedirect = jest.fn();
    const setActiveAccount = jest.fn();
    const createInstance = jest.fn().mockResolvedValue({
      getActiveAccount: () => account,
      getAllAccounts: () => [account],
      setActiveAccount,
      acquireTokenSilent,
      loginRedirect,
    });
    const win = makeWindow();

    const result = await handleMsalEnsureAd(
      win,
      { clientId: "c", authority: "a" },
      "https://example.com/target/page",
      "https://example.com/global-components/test/auth-handover.html?src=x&stage=ad-redirect",
      ["User.Read"],
      createInstance,
    );

    expect(result).toBe("silent-success");
    expect(acquireTokenSilent).toHaveBeenCalledWith(
      expect.objectContaining({ scopes: ["User.Read"], account }),
    );
    expect(loginRedirect).not.toHaveBeenCalled();
    // No direct navigation — the mediator (caller) routes the user onward.
    expect((win.location as any).replace).not.toHaveBeenCalled();
  });

  it("returns 'silent-success' even with a cross-origin returnTo (caller is responsible for same-origin validation)", async () => {
    const acquireTokenSilent = jest.fn().mockResolvedValue({ account });
    const createInstance = jest.fn().mockResolvedValue({
      getActiveAccount: () => account,
      getAllAccounts: () => [account],
      setActiveAccount: jest.fn(),
      acquireTokenSilent,
      loginRedirect: jest.fn(),
    });
    const win = makeWindow({ origin: "https://example.com" });

    const result = await handleMsalEnsureAd(
      win,
      { clientId: "c", authority: "a" },
      "https://evil.example.org/phish",
      "https://example.com/global-components/test/auth-handover.html?src=x&stage=ad-redirect",
      ["User.Read"],
      createInstance,
    );

    expect(result).toBe("silent-success");
    expect((win.location as any).replace).not.toHaveBeenCalled();
  });

  it("falls through to loginRedirect when there is no cached account", async () => {
    const acquireTokenSilent = jest.fn();
    const loginRedirect = jest.fn().mockResolvedValue(undefined);
    const createInstance = jest.fn().mockResolvedValue({
      getActiveAccount: () => null,
      getAllAccounts: () => [],
      acquireTokenSilent,
      loginRedirect,
    });

    const result = await handleMsalEnsureAd(
      makeWindow(),
      { clientId: "c", authority: "a" },
      "https://example.com/target",
      "https://example.com/global-components/test/auth-handover.html?src=x&stage=ad-redirect",
      ["User.Read"],
      createInstance,
    );

    expect(result).toBe("redirect-initiated");
    expect(acquireTokenSilent).not.toHaveBeenCalled();
    expect(loginRedirect).toHaveBeenCalled();
  });

  it("falls through to loginRedirect when acquireTokenSilent rejects", async () => {
    const acquireTokenSilent = jest.fn().mockRejectedValue(new Error("interaction_required"));
    const loginRedirect = jest.fn().mockResolvedValue(undefined);
    const createInstance = jest.fn().mockResolvedValue({
      getActiveAccount: () => account,
      getAllAccounts: () => [account],
      acquireTokenSilent,
      loginRedirect,
    });
    const win = makeWindow();

    const result = await handleMsalEnsureAd(
      win,
      { clientId: "c", authority: "a" },
      "https://example.com/target",
      "https://example.com/global-components/test/auth-handover.html?src=x&stage=ad-redirect",
      ["User.Read"],
      createInstance,
    );

    expect(result).toBe("redirect-initiated");
    expect(acquireTokenSilent).toHaveBeenCalledTimes(1);
    expect(loginRedirect).toHaveBeenCalled();
    // Did NOT navigate to returnTo (silent failed).
    expect((win.location as any).replace).not.toHaveBeenCalled();
  });

  it("returns 'redirect-initiation-failed' if loginRedirect itself rejects", async () => {
    const acquireTokenSilent = jest.fn().mockRejectedValue(new Error("bad"));
    const loginRedirect = jest.fn().mockRejectedValue(new Error("interaction_in_progress"));
    const createInstance = jest.fn().mockResolvedValue({
      getActiveAccount: () => account,
      getAllAccounts: () => [account],
      acquireTokenSilent,
      loginRedirect,
    });

    const result = await handleMsalEnsureAd(
      makeWindow(),
      { clientId: "c", authority: "a" },
      "https://example.com/target",
      "https://example.com/global-components/test/auth-handover.html?src=x&stage=ad-redirect",
      ["User.Read"],
      createInstance,
    );

    expect(result).toBe("redirect-initiation-failed");
  });
});
