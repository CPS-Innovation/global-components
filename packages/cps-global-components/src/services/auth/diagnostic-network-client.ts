import type { INetworkModule, NetworkRequestOptions, NetworkResponse } from "@azure/msal-browser";
import type { AdDiagnosticsCollector } from "./ad-diagnostics-collector";

const buildHeaders = (options?: NetworkRequestOptions): Headers => {
  const headers = new Headers();
  if (options?.headers) {
    Object.entries(options.headers).forEach(([key, value]) => {
      headers.append(key, value);
    });
  }
  return headers;
};

const getHeaderDict = (headers: Headers): Record<string, string> => {
  const dict: Record<string, string> = {};
  headers.forEach((value, key) => {
    dict[key] = value;
  });
  return dict;
};

export const createDiagnosticNetworkClient = (collector: AdDiagnosticsCollector): INetworkModule => ({
  async sendGetRequestAsync<T>(url: string, options?: NetworkRequestOptions): Promise<NetworkResponse<T>> {
    const startTime = performance.now();
    try {
      const response = await fetch(url, { method: "GET", headers: buildHeaders(options) });
      return {
        headers: getHeaderDict(response.headers),
        body: (await response.json()) as T,
        status: response.status,
      };
    } catch (e) {
      collector.add({
        fetchFailedEndpoint: new URL(url).pathname,
        fetchFailedDurationMs: Math.round(performance.now() - startTime),
        fetchErrorName: e instanceof Error ? e.name : "unknown",
        fetchErrorMessage: e instanceof Error ? e.message : String(e),
        fetchNavigatorOnLine: navigator.onLine,
        fetchDocumentHidden: document.hidden,
        fetchDocumentVisibilityState: document.visibilityState,
      });
      throw e;
    }
  },

  async sendPostRequestAsync<T>(url: string, options?: NetworkRequestOptions): Promise<NetworkResponse<T>> {
    const startTime = performance.now();
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: buildHeaders(options),
        body: options?.body || "",
      });
      return {
        headers: getHeaderDict(response.headers),
        body: (await response.json()) as T,
        status: response.status,
      };
    } catch (e) {
      collector.add({
        fetchFailedEndpoint: new URL(url).pathname,
        fetchFailedDurationMs: Math.round(performance.now() - startTime),
        fetchErrorName: e instanceof Error ? e.name : "unknown",
        fetchErrorMessage: e instanceof Error ? e.message : String(e),
        fetchNavigatorOnLine: navigator.onLine,
        fetchDocumentHidden: document.hidden,
        fetchDocumentVisibilityState: document.visibilityState,
      });
      throw e;
    }
  },
});
