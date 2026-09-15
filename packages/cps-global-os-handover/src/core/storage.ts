import { CmsAuthStorageKeys, CmsSessionHint } from "cps-global-configuration";
import { areAllCookieStringsEqual } from "./are-all-cookie-strings-equal";

// Partially-redacted preview for diagnostics: enough to correlate a value
// across page loads, never enough to leak the cookie/token. Deliberately
// distinguishes the states we care about when chasing the auth-wipe — absent
// vs empty vs the literal string "undefined" vs a real value (head + length).
const redactedPreview = (value: string | null | undefined): string => {
  if (value === null || value === undefined) {
    return "<absent>";
  }
  if (value === "undefined") {
    return '<literal "undefined">';
  }
  if (value === "") {
    return "<empty>";
  }
  return `${value.slice(0, 6)}…(len ${value.length})`;
};

// VCA's ClientVar keys are optional — see the note on cmsAuthStorageKeysSchema.
// Every VCA touch goes through here (or an equivalent guard) so an env that has
// not enabled VCA yet is a clean no-op: an unguarded write would land under the
// literal key "undefined", and an unguarded read would drag a permanently-absent
// value into isStoredAuthCurrent's comparison.
const setIfKeyed = (
  storage: Storage,
  key: string | undefined,
  value: string,
) => {
  if (!key) {
    return;
  }
  storage[key] = value;
};

const getIfKeyed = (
  storage: Storage,
  key: string | undefined,
): string | undefined => (key ? storage[key] : undefined);

export const storeAuth = (
  cookies: string,
  token: string,
  storage: Storage,
  keys: CmsAuthStorageKeys,
) => {
  const cmsAuthValuesJson = JSON.stringify({
    Cookies: cookies,
    Token: token,
    ExpiryTime: new Date().toISOString(),
  });

  storage[keys.WMA_COOKIES] = cookies;
  storage[keys.CASE_REVIEW_COOKIES] = cookies;
  storage[keys.HOME_COOKIES] = cookies;
  setIfKeyed(storage, keys.VCA_COOKIES, cookies);
  storage[keys.WMA_JSON] = cmsAuthValuesJson;
  storage[keys.CASE_REVIEW_JSON] = cmsAuthValuesJson;
  storage[keys.HOME_JSON] = cmsAuthValuesJson;
  setIfKeyed(storage, keys.VCA_JSON, cmsAuthValuesJson);

  console.log("[CPS-GLOBAL-OS-HANDOVER] storeAuth wrote auth values", {
    cookies: redactedPreview(cookies),
    token: redactedPreview(token),
    jsonLen: cmsAuthValuesJson.length,
  });
};

export const isStoredAuthCurrent = (
  cookies: string,
  storage: Storage,
  keys: CmsAuthStorageKeys,
) =>
  areAllCookieStringsEqual(
    cookies,
    storage[keys.WMA_COOKIES],
    storage[keys.CASE_REVIEW_COOKIES],
    storage[keys.HOME_COOKIES],
    // Only compare VCA where the env has it configured. Including an absent key
    // here would make this false for every user whose storage predates VCA,
    // sending all of them down the token-handover leg unnecessarily.
    ...(keys.VCA_COOKIES ? [storage[keys.VCA_COOKIES]] : []),
  );

export const isStoredTokenSameAs = (
  token: string,
  storage: Storage,
  keys: CmsAuthStorageKeys,
): boolean => {
  const json = storage[keys.WMA_JSON];
  if (!json) {
    return false;
  }
  try {
    return JSON.parse(json).Token === token;
  } catch {
    return false;
  }
};

// A source value is only worth propagating to the sibling apps if it actually
// holds auth. OutSystems can re-persist an emptied ClientVar as the literal
// string "undefined" (e.g. after a failed post-SSO CMS session check), and an
// unset key reads back as the JS value undefined — neither must be fanned out.
const isUsableValue = (value: string | undefined): value is string =>
  !!value && value !== "undefined";

export const syncOsAuth = (
  currentUrl: string,
  storage: Storage,
  keys: CmsAuthStorageKeys,
) => {
  // Match case-insensitively: OutSystems hands the same logical page back under
  // different casing depending on the navigation (the CMS→OS handover returns to
  // lowercase /casework/home, in-app links use /Casework/Home). A case-sensitive
  // switch would silently no-op on the lowercase entry points.
  const app = new URLPattern({ pathname: "/:app{/*}?" })
    .exec(currentUrl)
    ?.pathname.groups["app"]?.toLowerCase();

  const copyToOtherApps = (
    jsonKey: keyof Pick<
      CmsAuthStorageKeys,
      "WMA_JSON" | "CASE_REVIEW_JSON" | "HOME_JSON" | "VCA_JSON"
    >,
    cookiesKey: keyof Pick<
      CmsAuthStorageKeys,
      "WMA_COOKIES" | "CASE_REVIEW_COOKIES" | "HOME_COOKIES" | "VCA_COOKIES"
    >,
  ) => {
    // Guard each copy on its own source: never let a blank/"undefined" source
    // overwrite a sibling app's still-valid auth. Without this, OutSystems
    // blanking the active app's ClientVar would fan out and wipe the others.
    const json = getIfKeyed(storage, keys[jsonKey]);
    const cookies = getIfKeyed(storage, keys[cookiesKey]);

    console.log("[CPS-GLOBAL-OS-HANDOVER] syncOsAuth copy", {
      app,
      jsonSource: redactedPreview(json),
      willCopyJson: isUsableValue(json),
      cookiesSource: redactedPreview(cookies),
      willCopyCookies: isUsableValue(cookies),
    });

    if (isUsableValue(json)) {
      storage[keys.WMA_JSON] =
        storage[keys.CASE_REVIEW_JSON] =
        storage[keys.HOME_JSON] =
          json;
      setIfKeyed(storage, keys.VCA_JSON, json);
    }

    if (isUsableValue(cookies)) {
      storage[keys.WMA_COOKIES] =
        storage[keys.CASE_REVIEW_COOKIES] =
        storage[keys.HOME_COOKIES] =
          cookies;
      setIfKeyed(storage, keys.VCA_COOKIES, cookies);
    }
  };

  if (!app || !["workmanagementapp", "casereview", "casework_blocks", "casework", "victimscaseapplication"].includes(app)) {
    console.log("[CPS-GLOBAL-OS-HANDOVER] syncOsAuth no-op (app not matched)", { app });
  }

  switch (app) {
    case "workmanagementapp":
      copyToOtherApps("WMA_JSON", "WMA_COOKIES");
      break;
    case "casereview":
      copyToOtherApps("CASE_REVIEW_JSON", "CASE_REVIEW_COOKIES");
      break;
    case "casework_blocks":
    case "casework":
      copyToOtherApps("HOME_JSON", "HOME_COOKIES");
      break;
    case "victimscaseapplication":
      copyToOtherApps("VCA_JSON", "VCA_COOKIES");
      break;
  }
};

export const setCmsSessionHint = (
  cmsSessionHint: CmsSessionHint,
  storage: Storage,
  keys: CmsAuthStorageKeys,
) => (storage[keys.HOME_IS_FROM_PROXY] = String(cmsSessionHint.isProxySession));
