import { handleMsalTermination } from "./handle-msal-termination";

const makeWindow = ({
  origin = "https://example.com",
  pathname = "/page.html",
  search = "",
  hash = "",
  iframe = false,
} = {}) => {
  const top = {} as Window;
  const self = iframe ? ({} as Window) : top;
  return {
    self,
    top,
    location: { origin, pathname, search, hash, href: `${origin}${pathname}${search}${hash}` },
    sessionStorage: { removeItem: jest.fn(), setItem: jest.fn(), getItem: jest.fn() },
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

    const result = await handleMsalTermination(
      makeWindow(),
      { clientId: "c", authority: "a" },
      createInstance,
    );

    expect(result).toBe("handled-with-error");
  });

  it("returns 'handled-with-error' when createInstance rejects (e.g. initialize() fails inside the factory)", async () => {
    const createInstance = jest.fn().mockRejectedValue(new Error("init-fail"));

    const result = await handleMsalTermination(
      makeWindow(),
      { clientId: "c", authority: "a" },
      createInstance,
    );

    expect(result).toBe("handled-with-error");
  });
});
