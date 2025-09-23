const sanitizedCookieString = (cookieString: string = "") =>
  cookieString
    .split(";")
    .map((fragment) => fragment.trim())
    .sort()
    .join("; ");

export const areAllCookieStringsEqual = (...cookieStrings: string[]) =>
  cookieStrings.length === 0 ||
  [...new Set(cookieStrings.map(sanitizedCookieString))].length === 1;
