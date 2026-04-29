import { handleMsalTermination } from "./handle-msal-termination";

const makeWindow = ({ origin = "https://example.com", pathname = "/page.html", iframe = false } = {}) => {
  const top = {} as Window;
  const self = iframe ? ({} as Window) : top;
  return {
    self,
    top,
    location: { origin, pathname },
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

  it("creates the MSAL instance with redirectUri = origin + pathname and calls initialize then handleRedirectPromise", async () => {
    const initialize = jest.fn().mockResolvedValue(undefined);
    const handleRedirectPromise = jest.fn().mockResolvedValue(null);
    const createInstance = jest.fn().mockReturnValue({ initialize, handleRedirectPromise });

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
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(handleRedirectPromise).toHaveBeenCalledTimes(1);
    expect(result).toBe("handled");
  });

  it("returns 'handled-with-error' when handleRedirectPromise rejects, swallowing the error", async () => {
    const initialize = jest.fn().mockResolvedValue(undefined);
    const handleRedirectPromise = jest.fn().mockRejectedValue(new Error("boom"));
    const createInstance = jest.fn().mockReturnValue({ initialize, handleRedirectPromise });

    const result = await handleMsalTermination(
      makeWindow(),
      { clientId: "c", authority: "a" },
      createInstance,
    );

    expect(result).toBe("handled-with-error");
  });

  it("returns 'handled-with-error' when initialize rejects, swallowing the error", async () => {
    const initialize = jest.fn().mockRejectedValue(new Error("init-fail"));
    const handleRedirectPromise = jest.fn();
    const createInstance = jest.fn().mockReturnValue({ initialize, handleRedirectPromise });

    const result = await handleMsalTermination(
      makeWindow(),
      { clientId: "c", authority: "a" },
      createInstance,
    );

    expect(result).toBe("handled-with-error");
    expect(handleRedirectPromise).not.toHaveBeenCalled();
  });
});
