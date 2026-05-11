import { handleMsalLogin, resolveReturnTo } from "./handle-msal-login";

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

const makeWindow = ({
  origin = "https://example.com",
  pathname = "/msal-redirect.html",
  search = "?action=login&returnTo=https%3A%2F%2Fexample.com%2Fpolaris-ui",
  hash = "",
  iframe = false,
  interactionStatus,
}: {
  origin?: string;
  pathname?: string;
  search?: string;
  hash?: string;
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
      pathname,
      search,
      hash,
      href: `${origin}${pathname}${search}${hash}`,
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
  } as unknown as Window;
};

describe("handleMsalLogin", () => {
  it("returns 'iframe-noop' when inside an iframe and does not create the MSAL instance", async () => {
    const createInstance = jest.fn();

    const result = await handleMsalLogin(
      makeWindow({ iframe: true }),
      { clientId: "c", authority: "a" },
      "https://example.com/polaris-ui",
      createInstance,
    );

    expect(result).toBe("iframe-noop");
    expect(createInstance).not.toHaveBeenCalled();
  });

  it("creates the MSAL instance with a redirectUri that strips both query and hash", async () => {
    const loginRedirect = jest.fn().mockResolvedValue(undefined);
    const createInstance = jest.fn().mockResolvedValue({ loginRedirect });

    await handleMsalLogin(
      makeWindow({
        origin: "https://app.example",
        pathname: "/sub/msal-redirect.html",
        search: "?action=login&returnTo=https%3A%2F%2Fapp.example%2Fhome",
      }),
      { clientId: "client-id", authority: "https://login.microsoftonline.com/tenant" },
      "https://app.example/home",
      createInstance,
    );

    expect(createInstance).toHaveBeenCalledWith({
      clientId: "client-id",
      authority: "https://login.microsoftonline.com/tenant",
      redirectUri: "https://app.example/sub/msal-redirect.html",
    });
  });

  it("calls loginRedirect with redirectStartPage set to the validated returnTo", async () => {
    const loginRedirect = jest.fn().mockResolvedValue(undefined);
    const createInstance = jest.fn().mockResolvedValue({ loginRedirect });

    await handleMsalLogin(
      makeWindow({ origin: "https://example.com" }),
      { clientId: "c", authority: "a" },
      "https://example.com/polaris-ui/case/123",
      createInstance,
    );

    expect(loginRedirect).toHaveBeenCalledWith({
      scopes: ["User.Read"],
      redirectStartPage: "https://example.com/polaris-ui/case/123",
    });
  });

  it("clears a foreign msal.interaction.status before calling loginRedirect (so preflight passes)", async () => {
    const loginRedirect = jest.fn().mockResolvedValue(undefined);
    const createInstance = jest.fn().mockResolvedValue({ loginRedirect });
    const win = makeWindow({
      interactionStatus: '{"clientId":"some-other-clientId","type":"signin"}',
    });

    await handleMsalLogin(
      win,
      { clientId: "c", authority: "a" },
      "https://example.com/polaris-ui",
      createInstance,
    );

    expect(win.sessionStorage.removeItem).toHaveBeenCalledWith("msal.interaction.status");
    expect(loginRedirect).toHaveBeenCalled();
  });

  it("clears a stale own msal.interaction.status too (always clears before loginRedirect)", async () => {
    const loginRedirect = jest.fn().mockResolvedValue(undefined);
    const createInstance = jest.fn().mockResolvedValue({ loginRedirect });
    const win = makeWindow({
      interactionStatus: '{"clientId":"c","type":"signin"}',
    });

    await handleMsalLogin(
      win,
      { clientId: "c", authority: "a" },
      "https://example.com/polaris-ui",
      createInstance,
    );

    expect(win.sessionStorage.removeItem).toHaveBeenCalledWith("msal.interaction.status");
  });

  it("falls back to the redirect page's origin root when returnTo is cross-origin", async () => {
    const loginRedirect = jest.fn().mockResolvedValue(undefined);
    const createInstance = jest.fn().mockResolvedValue({ loginRedirect });

    await handleMsalLogin(
      makeWindow({ origin: "https://example.com" }),
      { clientId: "c", authority: "a" },
      "https://evil.example.org/phishing",
      createInstance,
    );

    expect(loginRedirect).toHaveBeenCalledWith({
      scopes: ["User.Read"],
      redirectStartPage: "https://example.com/",
    });
  });

  it("falls back to origin root when returnTo is null", async () => {
    const loginRedirect = jest.fn().mockResolvedValue(undefined);
    const createInstance = jest.fn().mockResolvedValue({ loginRedirect });

    await handleMsalLogin(
      makeWindow({ origin: "https://example.com" }),
      { clientId: "c", authority: "a" },
      null,
      createInstance,
    );

    expect(loginRedirect).toHaveBeenCalledWith({
      scopes: ["User.Read"],
      redirectStartPage: "https://example.com/",
    });
  });

  it("falls back to origin root when returnTo is unparseable", async () => {
    const loginRedirect = jest.fn().mockResolvedValue(undefined);
    const createInstance = jest.fn().mockResolvedValue({ loginRedirect });

    await handleMsalLogin(
      makeWindow({ origin: "https://example.com" }),
      { clientId: "c", authority: "a" },
      "not a url",
      createInstance,
    );

    expect(loginRedirect).toHaveBeenCalledWith({
      scopes: ["User.Read"],
      redirectStartPage: "https://example.com/",
    });
  });

  it("returns 'initiation-failed' when loginRedirect rejects, swallowing the error", async () => {
    const loginRedirect = jest.fn().mockRejectedValue(new Error("boom"));
    const createInstance = jest.fn().mockResolvedValue({ loginRedirect });

    const result = await handleMsalLogin(
      makeWindow(),
      { clientId: "c", authority: "a" },
      "https://example.com/polaris-ui",
      createInstance,
    );

    expect(result).toBe("initiation-failed");
  });

  it("returns 'initiation-failed' when createInstance rejects (e.g. initialize() fails inside the factory)", async () => {
    const createInstance = jest.fn().mockRejectedValue(new Error("init-fail"));

    const result = await handleMsalLogin(
      makeWindow(),
      { clientId: "c", authority: "a" },
      "https://example.com/polaris-ui",
      createInstance,
    );

    expect(result).toBe("initiation-failed");
  });
});

describe("resolveReturnTo", () => {
  it("returns the input when origin matches", () => {
    expect(
      resolveReturnTo("https://example.com/some/path?q=1", "https://example.com"),
    ).toBe("https://example.com/some/path?q=1");
  });

  it("falls back to origin root on cross-origin input", () => {
    expect(
      resolveReturnTo("https://evil.example.org/phish", "https://example.com"),
    ).toBe("https://example.com/");
  });

  it("falls back on null/empty/undefined", () => {
    expect(resolveReturnTo(null, "https://example.com")).toBe("https://example.com/");
    expect(resolveReturnTo(undefined, "https://example.com")).toBe("https://example.com/");
    expect(resolveReturnTo("", "https://example.com")).toBe("https://example.com/");
  });

  it("falls back on unparseable input", () => {
    expect(resolveReturnTo("not a url", "https://example.com")).toBe("https://example.com/");
  });
});
