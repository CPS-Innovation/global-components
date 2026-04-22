export type ProbeIframeLoadOutcome = "loaded" | "timeout-public" | "timeout-local";

export type ProbeIframeLoadResult = {
  outcome: ProbeIframeLoadOutcome;
  durationMs: number;
};

export const probeIframeLoad = ({ url, timeoutMs }: { url: string; timeoutMs?: number }): Promise<ProbeIframeLoadResult> =>
  new Promise(resolve => {
    const startedAt = Date.now();
    const publicOrigin = new URL(url, location.href).origin;
    const localOrigin = location.origin;
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";

    let settled = false;
    let gotPublic = false;
    let timer: ReturnType<typeof setTimeout>;

    const settle = (outcome: ProbeIframeLoadOutcome) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      iframe.remove();
      resolve({ outcome, durationMs: Date.now() - startedAt });
    };

    const onMessage = (ev: MessageEvent) => {
      if (!ev.data) {
        return;
      }
      if (ev.origin === publicOrigin && ev.data.type === "iframe-public-loaded") {
        gotPublic = true;
        return;
      }
      if (ev.origin === localOrigin && ev.data.type === "iframe-loaded") {
        settle("loaded");
      }
    };

    window.addEventListener("message", onMessage);
    timer = setTimeout(() => settle(gotPublic ? "timeout-local" : "timeout-public"), timeoutMs);
    iframe.src = url;
    document.body.appendChild(iframe);
  });
