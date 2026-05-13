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

export type BeaconPayload = {
  authHintObjectId: string;
  // Free-form telemetry fields, all optional. Anything serialisable to a
  // query string param. Common keys: errorCode, errorName, reason.
  [key: string]: string | undefined;
};

// Build the beacon URL from the bundle's script URL — sibling of the .js file.
export const buildBeaconUrl = (
  scriptUrl: URL,
  outcome: BeaconOutcome,
  payload: BeaconPayload,
): string => {
  const beaconUrl = new URL("./ad-redirect-beacon", scriptUrl);
  beaconUrl.searchParams.set("outcome", outcome);
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) {
      beaconUrl.searchParams.set(key, value);
    }
  }
  return beaconUrl.href;
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
