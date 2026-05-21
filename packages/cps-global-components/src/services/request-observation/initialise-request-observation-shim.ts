import { Preview } from "cps-global-configuration";
import { Result } from "../../utils/Result";
import { makeConsole } from "../../logging/makeConsole";

const { _log, _warn } = makeConsole("request-observation-shim");

type ObservedRequest = {
  method: string;
  url: string;
};

export const initialiseRequestObservationShim = ({ window, preview }: { window: Window & typeof globalThis; preview: Result<Preview> }) => {
  if (!preview.result?.requestObservationShim) {
    return;
  }

  const XHR = window.XMLHttpRequest;
  if (!XHR?.prototype) {
    _warn("XMLHttpRequest not available; shim not installed");
    return;
  }

  const observed = new WeakMap<XMLHttpRequest, ObservedRequest>();
  const originalOpen = XHR.prototype.open as (...args: any[]) => void;
  const originalSend = XHR.prototype.send as (...args: any[]) => void;

  // Use `function` (not arrow) so `this` is the XHR instance.
  XHR.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: any[]) {
    try {
      observed.set(this, { method: String(method ?? "").toUpperCase(), url: String(url) });
    } catch {
      // never let bookkeeping break the host request
    }
    return originalOpen.apply(this, [method, url, ...rest]);
  };

  XHR.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    try {
      const entry = observed.get(this);
      if (entry?.method === "POST") {
        _log("POST", entry.url, "body length:", describeBodyLength(body));
      }
    } catch {
      // never let logging break the host request
    }
    return originalSend.apply(this, [body]);
  };

  _log("XHR shim installed");
};

export const describeBodyLength = (body: Document | XMLHttpRequestBodyInit | null | undefined): number | string => {
  if (body == null) {
    return 0;
  }
  if (typeof body === "string") {
    return body.length;
  }
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return body.size;
  }
  if (body instanceof ArrayBuffer) {
    return body.byteLength;
  }
  if (ArrayBuffer.isView(body)) {
    return body.byteLength;
  }
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return "FormData";
  }
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    return body.toString().length;
  }
  return "unknown";
};
