const joinUrl = (baseUrl: string, url: string) => {
  if (!baseUrl) {
    return url;
  }
  const trimmedBaseUrl = baseUrl.replace(/\/+$/, "");
  if (!url) {
    return trimmedBaseUrl;
  }
  return `${trimmedBaseUrl}/${url.replace(/^\/+/, "")}`;
};

export const fullyQualifyRequest = (request: Parameters<typeof fetch>[0], baseUrl: string = "") => {
  const resolveUrl = (url: string) => joinUrl(baseUrl, url);
  return request instanceof Request ? { ...request, url: resolveUrl(request.url) } : resolveUrl(request.toString());
};
