import { handleMsalTermination } from "./handle-msal-termination";

// Silence console.error — the production code logs intentionally-rejected
// errors in the "handled-with-error" tests, which would otherwise pollute the
// test output with stack traces.
beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

const makeWindow = ({
  origin = "https://example.com",
  pathname = "/page.html",
  search = "",
  hash = "",
  iframe = false,
  uuid = "11111111-1111-4111-8111-111111111111",
  stashedReturnTo,
}: {
  origin?: string;
  pathname?: string;
  search?: string;
  hash?: string;
  iframe?: boolean;
  uuid?: string;
  stashedReturnTo?: string;
} = {}) => {
  const top = {} as Window;
  const self = iframe ? ({} as Window) : top;
  const store: Record<string, string> = {};
  if (stashedReturnTo) {
    store["cps_global_components_msal_redirect_return_to"] = stashedReturnTo;
  }
  return {
    self,
    top,
    location: {
      origin,
      pathname,
      search,
      hash,
      href: `${origin}${pathname}${search}${hash}`,
      assign: jest.fn(),
      replace: jest.fn(),
    },
    sessionStorage: {
      removeItem: jest.fn((k: string) => {
        delete store[k];
      }),
      setItem: jest.fn((k: string, v: string) => {
        store[k] = v;
      }),
      getItem: jest.fn((k: string) => store[k] ?? null),
    },
    crypto: { randomUUID: jest.fn(() => uuid) },
  } as unknown as Window;
};

describe("handleMsalTermination", () => {
  it("returns 'iframe-noop' when inside an iframe and does not create the MSAL instance", async () => {
    const createInstance = jest.fn();

    const result = await handleMsalTermination(
      makeWindow({ iframe: true }),
      { clientId: "c", authority: "a" },
      createInstance,
    );

    expect(result.outcome).toBe("iframe-noop");
    expect(createInstance).not.toHaveBeenCalled();
  });

  it("creates the MSAL instance with redirectUri = href minus hash and calls handleRedirectPromise", async () => {
    const handleRedirectPromise = jest.fn().mockResolvedValue(null);
    const createInstance = jest.fn().mockResolvedValue({ handleRedirectPromise });

    const result = await handleMsalTermination(
      makeWindow({ origin: "https://app.example", pathname: "/sub/redirect.html" }),
      { clientId: "client-id", authority: "https://login.microsoftonline.com/tenant" },
      createInstance,
    );

    expect(createInstance).toHaveBeenCalledWith({
      clientId: "client-id",
      authority: "https://login.microsoftonline.com/tenant",
      redirectUri: "https://app.example/sub/redirect.html",
    });
    expect(handleRedirectPromise).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe("handled");
  });

  it("preserves query string in redirectUri (folded OS path: ?src=…&stage=…) but strips hash", async () => {
    const handleRedirectPromise = jest.fn().mockResolvedValue(null);
    const createInstance = jest.fn().mockResolvedValue({ handleRedirectPromise });

    await handleMsalTermination(
      makeWindow({
        origin: "https://cps-tst.outsystemsenterprise.com",
        pathname: "/Casework_Patterns/auth-handover.html",
        search: "?src=https%3A%2F%2Fpolaris.example%2Fauth-handover.js&stage=os-ad-redirect",
        hash: "#code=abc&state=xyz",
      }),
      { clientId: "c", authority: "a" },
      createInstance,
    );

    expect(createInstance).toHaveBeenCalledWith({
      clientId: "c",
      authority: "a",
      redirectUri:
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=https%3A%2F%2Fpolaris.example%2Fauth-handover.js&stage=os-ad-redirect",
    });
  });

  it("returns 'handled-with-error' when handleRedirectPromise rejects, swallowing the error", async () => {
    const handleRedirectPromise = jest.fn().mockRejectedValue(new Error("boom"));
    const createInstance = jest.fn().mockResolvedValue({ handleRedirectPromise });

    const result = await handleMsalTermination(makeWindow(), { clientId: "c", authority: "a" }, createInstance);

    expect(result.outcome).toBe("handled-with-error");
  });

  it("returns 'handled-with-error' when createInstance rejects (e.g. initialize() fails inside the factory)", async () => {
    const createInstance = jest.fn().mockRejectedValue(new Error("init-fail"));

    const result = await handleMsalTermination(makeWindow(), { clientId: "c", authority: "a" }, createInstance);

    expect(result.outcome).toBe("handled-with-error");
  });

  it("on failure, surfaces the stashed returnTo so the caller can navigate the user back to the host", async () => {
    const handleRedirectPromise = jest.fn().mockRejectedValue(new Error("boom"));
    const createInstance = jest.fn().mockResolvedValue({ handleRedirectPromise });
    const win = makeWindow({ stashedReturnTo: "https://example.com/polaris-ui/case/123" });

    const result = await handleMsalTermination(win, { clientId: "c", authority: "a" }, createInstance);

    expect(result.outcome).toBe("handled-with-error");
    expect(result.returnTo).toBe("https://example.com/polaris-ui/case/123");
    // The stash is still cleared — we surface but don't leave stale state.
    expect(win.sessionStorage.removeItem).toHaveBeenCalledWith(
      "cps_global_components_msal_redirect_return_to",
    );
  });

  it("on failure with no stashed returnTo, returns returnTo=undefined (caller stays put)", async () => {
    const handleRedirectPromise = jest.fn().mockRejectedValue(new Error("boom"));
    const createInstance = jest.fn().mockResolvedValue({ handleRedirectPromise });

    const result = await handleMsalTermination(makeWindow(), { clientId: "c", authority: "a" }, createInstance);

    expect(result.returnTo).toBeUndefined();
  });

  it("on success writes a completion id UUID and clears the in-flight loop guard", async () => {
    const handleRedirectPromise = jest.fn().mockResolvedValue(null);
    const createInstance = jest.fn().mockResolvedValue({ handleRedirectPromise });
    const win = makeWindow({ uuid: "abcdef01-2345-4678-89ab-cdef01234567" });

    await handleMsalTermination(win, { clientId: "c", authority: "a" }, createInstance);

    expect(win.sessionStorage.setItem).toHaveBeenCalledWith("cps_global_components_msal_redirect_completion_id", "abcdef01-2345-4678-89ab-cdef01234567");
    expect(win.sessionStorage.removeItem).toHaveBeenCalledWith("cps_global_components_msal_redirect_in_flight_at");
  });

  it("does not write the completion id when handleRedirectPromise rejects (the failure path is caught upstream)", async () => {
    const handleRedirectPromise = jest.fn().mockRejectedValue(new Error("boom"));
    const createInstance = jest.fn().mockResolvedValue({ handleRedirectPromise });
    const win = makeWindow();

    await handleMsalTermination(win, { clientId: "c", authority: "a" }, createInstance);

    expect(win.sessionStorage.setItem).not.toHaveBeenCalled();
    // The in-flight sentinel must NOT be cleared on failure — leaving it in
    // place is what powers get-ad-user-account's "redirect-failure" inference.
    expect(win.sessionStorage.removeItem).not.toHaveBeenCalledWith(
      "cps_global_components_msal_redirect_in_flight_at",
    );
    // The returnTo stash IS cleared on failure — the flow is over and we don't
    // want stale state polluting the next termination.
    expect(win.sessionStorage.removeItem).toHaveBeenCalledWith(
      "cps_global_components_msal_redirect_return_to",
    );
  });

  describe("when a returnTo is stashed (initiated via handle-msal-login)", () => {
    it("returns the stashed returnTo for the caller to navigate to (handleMsalTermination itself does not navigate)", async () => {
      const handleRedirectPromise = jest.fn().mockResolvedValue(null);
      const createInstance = jest.fn().mockResolvedValue({ handleRedirectPromise });
      const win = makeWindow({ stashedReturnTo: "https://example.com/polaris-ui/case/123" });

      const result = await handleMsalTermination(win, { clientId: "c", authority: "a" }, createInstance);

      expect(result.outcome).toBe("handled");
      expect(result.returnTo).toBe("https://example.com/polaris-ui/case/123");
      // The caller is responsible for navigation — no direct call from this fn.
      expect((win.location as any).replace).not.toHaveBeenCalled();
      expect((win.location as any).assign).not.toHaveBeenCalled();
    });

    it("clears the stash on success so a re-entry to the page doesn't pick up stale state", async () => {
      const handleRedirectPromise = jest.fn().mockResolvedValue(null);
      const createInstance = jest.fn().mockResolvedValue({ handleRedirectPromise });
      const win = makeWindow({ stashedReturnTo: "https://example.com/polaris-ui" });

      await handleMsalTermination(win, { clientId: "c", authority: "a" }, createInstance);

      expect(win.sessionStorage.removeItem).toHaveBeenCalledWith(
        "cps_global_components_msal_redirect_return_to",
      );
    });

    it("still stamps completion id and clears in-flight before navigating", async () => {
      const handleRedirectPromise = jest.fn().mockResolvedValue(null);
      const createInstance = jest.fn().mockResolvedValue({ handleRedirectPromise });
      const win = makeWindow({
        stashedReturnTo: "https://example.com/polaris-ui",
        uuid: "abcdef01-2345-4678-89ab-cdef01234567",
      });

      await handleMsalTermination(win, { clientId: "c", authority: "a" }, createInstance);

      expect(win.sessionStorage.setItem).toHaveBeenCalledWith(
        "cps_global_components_msal_redirect_completion_id",
        "abcdef01-2345-4678-89ab-cdef01234567",
      );
      expect(win.sessionStorage.removeItem).toHaveBeenCalledWith(
        "cps_global_components_msal_redirect_in_flight_at",
      );
    });
  });

  describe("when no returnTo is stashed", () => {
    it("returns undefined returnTo and does not navigate", async () => {
      const handleRedirectPromise = jest.fn().mockResolvedValue(null);
      const createInstance = jest.fn().mockResolvedValue({ handleRedirectPromise });
      const win = makeWindow();

      const result = await handleMsalTermination(win, { clientId: "c", authority: "a" }, createInstance);

      expect(result.returnTo).toBeUndefined();
      expect((win.location as any).assign).not.toHaveBeenCalled();
      expect((win.location as any).replace).not.toHaveBeenCalled();
    });
  });

  describe("account info surfaced for telemetry", () => {
    it("returns the AccountInfo from handleRedirectPromise when present", async () => {
      const account = {
        homeAccountId: "abc",
        localAccountId: "def",
        username: "user@example.com",
        idTokenClaims: { oid: "11111111-2222-3333-4444-555555555555" },
      };
      const handleRedirectPromise = jest.fn().mockResolvedValue({ account });
      const setActiveAccount = jest.fn();
      const createInstance = jest.fn().mockResolvedValue({ handleRedirectPromise, setActiveAccount });

      const result = await handleMsalTermination(makeWindow(), { clientId: "c", authority: "a" }, createInstance);

      expect(result.outcome).toBe("handled");
      expect(result.account).toBe(account);
    });

    it("returns account=null when handleRedirectPromise resolves null (e.g. no AAD response on the URL)", async () => {
      const handleRedirectPromise = jest.fn().mockResolvedValue(null);
      const createInstance = jest.fn().mockResolvedValue({ handleRedirectPromise });

      const result = await handleMsalTermination(makeWindow(), { clientId: "c", authority: "a" }, createInstance);

      expect(result.account).toBeNull();
    });

    it("fetches and surfaces the /me slice (department + jobTitle) off the fresh account", async () => {
      const account = {
        homeAccountId: "abc",
        localAccountId: "def",
        username: "user@example.com",
        idTokenClaims: { oid: "11111111-2222-3333-4444-555555555555" },
      };
      const handleRedirectPromise = jest.fn().mockResolvedValue({ account });
      const setActiveAccount = jest.fn();
      const acquireTokenSilent = jest.fn().mockResolvedValue({ accessToken: "graph-token" });
      const createInstance = jest
        .fn()
        .mockResolvedValue({ handleRedirectPromise, setActiveAccount, acquireTokenSilent });

      const fetchMock = jest
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ department: "Innovation", jobTitle: "Head of Innovation" }) });
      const originalFetch = global.fetch;
      (global as unknown as { fetch: unknown }).fetch = fetchMock;
      try {
        const result = await handleMsalTermination(makeWindow(), { clientId: "c", authority: "a" }, createInstance);

        expect(result.me).toEqual({ department: "Innovation", jobTitle: "Head of Innovation" });
        expect(acquireTokenSilent).toHaveBeenCalledWith(
          expect.objectContaining({ account, scopes: ["https://graph.microsoft.com/User.Read"] }),
        );
        expect(fetchMock).toHaveBeenCalledWith(
          "https://graph.microsoft.com/v1.0/me?$select=department,jobTitle",
          expect.objectContaining({ headers: { Authorization: "Bearer graph-token" } }),
        );
      } finally {
        (global as unknown as { fetch: unknown }).fetch = originalFetch;
      }
    });
  });

  describe("active account reconciliation", () => {
    // Closes the multi-account loop: after a redirect lands an account, the
    // active-account pointer in MSAL cache must reflect that account so the
    // host's next get-ad-user-account picks the same identity (rather than
    // coin-flipping via getAllAccounts()[0]).
    it("calls setActiveAccount with the account returned by handleRedirectPromise", async () => {
      const account = {
        homeAccountId: "h-1",
        localAccountId: "oid-1",
        username: "user@example.com",
        idTokenClaims: { oid: "oid-1", sid: "sid-1" },
      };
      const handleRedirectPromise = jest.fn().mockResolvedValue({ account });
      const setActiveAccount = jest.fn();
      const createInstance = jest.fn().mockResolvedValue({ handleRedirectPromise, setActiveAccount });

      await handleMsalTermination(makeWindow(), { clientId: "c", authority: "a" }, createInstance);

      expect(setActiveAccount).toHaveBeenCalledTimes(1);
      expect(setActiveAccount).toHaveBeenCalledWith(account);
    });

    it("does not call setActiveAccount when handleRedirectPromise resolves null (no AAD response)", async () => {
      const handleRedirectPromise = jest.fn().mockResolvedValue(null);
      const setActiveAccount = jest.fn();
      const createInstance = jest.fn().mockResolvedValue({ handleRedirectPromise, setActiveAccount });

      await handleMsalTermination(makeWindow(), { clientId: "c", authority: "a" }, createInstance);

      expect(setActiveAccount).not.toHaveBeenCalled();
    });

    it("does not call setActiveAccount when handleRedirectPromise resolves with no account on the response", async () => {
      const handleRedirectPromise = jest.fn().mockResolvedValue({ account: null });
      const setActiveAccount = jest.fn();
      const createInstance = jest.fn().mockResolvedValue({ handleRedirectPromise, setActiveAccount });

      await handleMsalTermination(makeWindow(), { clientId: "c", authority: "a" }, createInstance);

      expect(setActiveAccount).not.toHaveBeenCalled();
    });

    it("does not call setActiveAccount when handleRedirectPromise rejects", async () => {
      const handleRedirectPromise = jest.fn().mockRejectedValue(new Error("boom"));
      const setActiveAccount = jest.fn();
      const createInstance = jest.fn().mockResolvedValue({ handleRedirectPromise, setActiveAccount });

      await handleMsalTermination(makeWindow(), { clientId: "c", authority: "a" }, createInstance);

      expect(setActiveAccount).not.toHaveBeenCalled();
    });
  });
});
