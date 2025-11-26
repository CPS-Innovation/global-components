import urlJoin from "proper-url-join";

export const fullyQualifyRequest = (request: Parameters<typeof fetch>[0], baseUrl: string = "") => {
  const resolveUrl = (url: string) => urlJoin(baseUrl, url);
  return request instanceof Request ? { ...request, url: resolveUrl(request.url) } : resolveUrl(request.toString());
};
