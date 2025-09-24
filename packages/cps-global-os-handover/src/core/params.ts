export const stripParams = (url: URL, ...keys: string[]) =>
  keys.map((key) => {
    const value = url.searchParams.get(key);
    url.searchParams.delete(key);
    return value || "";
  });

export const setParams = (url: URL, params: Record<string, string>) =>
  Object.entries(params).forEach(([key, value]) =>
    url.searchParams.set(key, value)
  );

export const createUrlWithParams = (
  baseUrl: string,
  params: Record<string, string>
) => {
  const url = new URL(baseUrl);
  setParams(url, params);
  return url;
};
