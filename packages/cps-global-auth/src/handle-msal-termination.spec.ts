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

    expect(result).toBe("iframe-noop");
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
    expect(result).toBe("handled");
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

    expect(result).toBe("handled-with-error");
  });

  it("returns 'handled-with-error' when createInstance rejects (e.g. initialize() fails inside the factory)", async () => {
    const createInstance = jest.fn().mockRejectedValue(new Error("init-fail"));

    const result = await handleMsalTermination(makeWindow(), { clientId: "c", authority: "a" }, createInstance);

    expect(result).toBe("handled-with-error");
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
    it("navigates window.location to the stashed returnTo after handleRedirectPromise resolves", async () => {
      const handleRedirectPromise = jest.fn().mockResolvedValue(null);
      const createInstance = jest.fn().mockResolvedValue({ handleRedirectPromise });
      const win = makeWindow({ stashedReturnTo: "https://example.com/polaris-ui/case/123" });

      const result = await handleMsalTermination(win, { clientId: "c", authority: "a" }, createInstance);

      expect(result).toBe("handled");
      expect((win.location as any).assign).toHaveBeenCalledWith(
        "https://example.com/polaris-ui/case/123",
      );
    });

    it("clears the stash before navigating so a re-entry to the page doesn't loop", async () => {
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

  describe("when no returnTo is stashed (OS handover folded path)", () => {
    it("does not navigate window.location — MSAL's default handles it", async () => {
      const handleRedirectPromise = jest.fn().mockResolvedValue(null);
      const createInstance = jest.fn().mockResolvedValue({ handleRedirectPromise });
      const win = makeWindow();

      await handleMsalTermination(win, { clientId: "c", authority: "a" }, createInstance);

      expect((win.location as any).assign).not.toHaveBeenCalled();
    });
  });
});
