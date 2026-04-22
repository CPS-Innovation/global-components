import { probeIframeLoad } from "./probe-iframe-load";

const postMessageToProbe = (data: unknown, origin: string) => {
  const listener = (window.addEventListener as jest.Mock).mock.calls.filter(([event]) => event === "message").slice(-1)[0]?.[1] as ((ev: unknown) => void) | undefined;
  listener?.({ data, origin });
};

const PUBLIC_URL = "https://public.example/probe.html";
const PUBLIC_ORIGIN = "https://public.example";

describe("probeIframeLoad", () => {
  let addEventListenerSpy: jest.SpyInstance;
  let removeEventListenerSpy: jest.SpyInstance;

  beforeEach(() => {
    document.body.innerHTML = "";
    addEventListenerSpy = jest.spyOn(window, "addEventListener");
    removeEventListenerSpy = jest.spyOn(window, "removeEventListener");
  });

  afterEach(() => {
    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  it("resolves 'loaded' when the iframe-loaded message arrives from the local origin", async () => {
    const promise = probeIframeLoad({ url: PUBLIC_URL, timeoutMs: 1000 });

    postMessageToProbe({ type: "iframe-public-loaded" }, PUBLIC_ORIGIN);
    postMessageToProbe({ type: "iframe-loaded" }, location.origin);

    const result = await promise;
    expect(result.outcome).toBe("loaded");
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("resolves 'loaded' even without an iframe-public-loaded message (e.g. when the iframe src is same-origin)", async () => {
    const promise = probeIframeLoad({ url: PUBLIC_URL, timeoutMs: 1000 });

    postMessageToProbe({ type: "iframe-loaded" }, location.origin);

    const result = await promise;
    expect(result.outcome).toBe("loaded");
  });

  it("resolves 'timeout-public' when no messages arrive at all (suspected deployment issue)", async () => {
    const result = await probeIframeLoad({ url: PUBLIC_URL, timeoutMs: 10 });

    expect(result.outcome).toBe("timeout-public");
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("resolves 'timeout-local' when public responded but local never did (suspected LNA block)", async () => {
    const promise = probeIframeLoad({ url: PUBLIC_URL, timeoutMs: 20 });

    postMessageToProbe({ type: "iframe-public-loaded" }, PUBLIC_ORIGIN);

    const result = await promise;
    expect(result.outcome).toBe("timeout-local");
  });

  it("ignores an iframe-public-loaded message from an origin other than the configured URL", async () => {
    const promise = probeIframeLoad({ url: PUBLIC_URL, timeoutMs: 10 });

    postMessageToProbe({ type: "iframe-public-loaded" }, "https://attacker.example");

    const result = await promise;
    expect(result.outcome).toBe("timeout-public");
  });

  it("ignores an iframe-loaded message from an origin other than the local origin", async () => {
    const promise = probeIframeLoad({ url: PUBLIC_URL, timeoutMs: 10 });

    postMessageToProbe({ type: "iframe-public-loaded" }, PUBLIC_ORIGIN);
    postMessageToProbe({ type: "iframe-loaded" }, "https://attacker.example");

    const result = await promise;
    expect(result.outcome).toBe("timeout-local");
  });

  it("ignores messages that don't match the expected shape", async () => {
    const promise = probeIframeLoad({ url: PUBLIC_URL, timeoutMs: 10 });

    postMessageToProbe({ type: "something-else" }, location.origin);
    postMessageToProbe(null, location.origin);

    const result = await promise;
    expect(result.outcome).toBe("timeout-public");
  });

  it("appends the iframe with the given URL as src and hides it", () => {
    probeIframeLoad({ url: PUBLIC_URL, timeoutMs: 10 });

    const iframe = document.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.src).toBe(PUBLIC_URL);
    expect(iframe?.style.display).toBe("none");
  });

  it("cleans up the iframe and message listener after resolving", async () => {
    const promise = probeIframeLoad({ url: PUBLIC_URL, timeoutMs: 1000 });
    postMessageToProbe({ type: "iframe-loaded" }, location.origin);
    await promise;

    expect(document.querySelector("iframe")).toBeNull();
    const added = addEventListenerSpy.mock.calls.filter(([e]) => e === "message").length;
    const removed = removeEventListenerSpy.mock.calls.filter(([e]) => e === "message").length;
    expect(removed).toBe(added);
  });

  it("does not double-resolve if a message arrives after the timeout", async () => {
    const promise = probeIframeLoad({ url: PUBLIC_URL, timeoutMs: 10 });
    const result = await promise;
    expect(result.outcome).toBe("timeout-public");

    postMessageToProbe({ type: "iframe-loaded" }, location.origin);
  });
});
