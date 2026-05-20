// Short-lived AD-redirect beacon (drop 8 / FCT2-17451). Awaited fetch to a
// sibling endpoint of the bundle, kill-switched via config. We use awaited
// fetch (not navigator.sendBeacon) because the user wants the fetch to be
// observable from JS — keepalive carries delivery guarantee across the unload
// that follows a successful AAD termination + navigation.
//
// Beacon URL is derived at runtime from the bundle's own URL — sibling path:
//   https://foo.com/global-components/test/auth-handover.js
// becomes
//   https://foo.com/global-components/test/ad-redirect-beacon
// so deployment per env Just Works without extra config.

export type BeaconOutcome = "success" | "failure";

// Keys are hyphen-cased (kebab-case), not camelCase — keeps the log lines easy
// to grep.
export type BeaconPayload = {
  "auth-hint-object-id": string;
  // Free-form telemetry fields, all optional. Common keys: "error-code",
  // "error-name", "reason".
  [key: string]: string | undefined;
};

// Build the beacon URL from the bundle's script URL — sibling of the .js file.
//
// k/v pairs are encoded as PATH SEGMENTS, not query string parameters: the
// Polaris nginx proxy's blob-storage `proxy_pass` block strips query strings
// before forwarding to blob storage, so query params would never reach the
// storage logs. Path segments are forwarded verbatim. Each segment is
// encodeURIComponent'd so freeform values (e.g. reasons with spaces or slashes)
// survive intact and can be decoded back at the consumer end.
//
// Example output:
//   https://foo.com/global-components/test/ad-redirect-beacon/outcome/success/auth-hint-object-id/<oid>
export const buildBeaconUrl = (
  scriptUrl: URL,
  outcome: BeaconOutcome,
  payload: BeaconPayload,
): string => {
  const segments = ["ad-redirect-beacon", "outcome", outcome];
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) {
      segments.push(encodeURIComponent(key), encodeURIComponent(value));
    }
  }
  return new URL("./" + segments.join("/"), scriptUrl).href;
};

// Awaited fetch. keepalive lets the request finish even if the page unloads
// during the await — necessary because beacon firing on success happens just
// before MSAL or the caller navigates the user back to the originating page.
// Errors are swallowed: this is best-effort telemetry, not a hard dependency.
export const beaconAdRedirect = async (
  scriptUrl: URL,
  outcome: BeaconOutcome,
  payload: BeaconPayload,
): Promise<void> => {
  const url = buildBeaconUrl(scriptUrl, outcome, payload);
  try {
    await fetch(url, { method: "GET", keepalive: true, credentials: "omit" });
    console.log("[CPS-GLOBAL-HANDOVER] beacon sent", { outcome, url });
  } catch (err) {
    console.warn("[CPS-GLOBAL-HANDOVER] beacon failed (swallowed)", { outcome, err });
  }
};
