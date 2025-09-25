import { withLogging } from "../../logging/with-logging";

export const buildSanitizedAddress = withLogging("buildSanitizedAddress", ({ origin, pathname, hash, search }: Location) => {
  const params = new URLSearchParams(search);
  const sortedParams = new URLSearchParams([...params.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  return origin + pathname + (sortedParams.toString() ? `?${sortedParams.toString()}` : "") + hash;
});
