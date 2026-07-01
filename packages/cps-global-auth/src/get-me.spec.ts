import type { AccountInfo } from "@azure/msal-browser";
import { getMe } from "./get-me";

const account = { homeAccountId: "h", localAccountId: "l", username: "u@x.com" } as AccountInfo;

// getMe only touches instance.acquireTokenSilent — cast a minimal fake.
const makeInstance = (acquireTokenSilent: jest.Mock) =>
  ({ acquireTokenSilent } as never);

describe("getMe", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  it("returns the department from a successful /me response", async () => {
    const acquireTokenSilent = jest.fn().mockResolvedValue({ accessToken: "graph-token" });
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ department: "Innovation" }) });
    global.fetch = fetchMock as never;

    const result = await getMe({ instance: makeInstance(acquireTokenSilent), account });

    expect(result).toEqual({ department: "Innovation" });
    expect(acquireTokenSilent).toHaveBeenCalledWith(
      expect.objectContaining({ account, scopes: ["https://graph.microsoft.com/User.Read"] }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.microsoft.com/v1.0/me?$select=department",
      expect.objectContaining({ headers: { Authorization: "Bearer graph-token" } }),
    );
  });

  it("returns department: undefined when the field is absent or non-string", async () => {
    const acquireTokenSilent = jest.fn().mockResolvedValue({ accessToken: "t" });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as never;

    const result = await getMe({ instance: makeInstance(acquireTokenSilent), account });

    expect(result).toEqual({ department: undefined });
  });

  it("returns undefined on a non-ok response", async () => {
    const acquireTokenSilent = jest.fn().mockResolvedValue({ accessToken: "t" });
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 }) as never;

    const result = await getMe({ instance: makeInstance(acquireTokenSilent), account });

    expect(result).toBeUndefined();
  });

  it("returns undefined (without fetching) when token acquisition throws", async () => {
    const acquireTokenSilent = jest.fn().mockRejectedValue(new Error("interaction_required"));
    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;

    const result = await getMe({ instance: makeInstance(acquireTokenSilent), account });

    expect(result).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves undefined and aborts the fetch when it hangs past the timeout", async () => {
    jest.useFakeTimers();
    const acquireTokenSilent = jest.fn().mockResolvedValue({ accessToken: "t" });
    let capturedSignal: AbortSignal | undefined;
    const fetchMock = jest.fn().mockImplementation((_url: unknown, init: RequestInit) => {
      capturedSignal = init.signal ?? undefined;
      // Never settles — simulates a black-holed network.
      return new Promise(() => {});
    });
    global.fetch = fetchMock as never;

    const promise = getMe({ instance: makeInstance(acquireTokenSilent), account });
    // Flush the acquireTokenSilent microtask so fetch is invoked, then trip the deadline.
    await jest.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(result).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(capturedSignal?.aborted).toBe(true);
  });
});
