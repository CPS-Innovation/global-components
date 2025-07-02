const paramKeys = {
  STAGE: "stage",
  COOKIES: "cc",
  R: "r",
  TOKEN: "cms-modern-token",
};

const stages = {
  OS_OUTBOUND: "os-outbound",
  OS_COOKIE_RETURN: "os-cookie-return",
  OS_TOKEN_RETURN: "os-token-return",
};

const stripParams = (url: URL, ...keys: string[]) =>
  keys.map((key) => {
    const value = url.searchParams.get(key);
    url.searchParams.delete(key);
    return value;
  });

const setParams = (url: URL, params: Record<string, string>) =>
  Object.entries(params).forEach(([key, value]) =>
    url.searchParams.set(key, value)
  );

const createUrl = (baseUrl: string, params: Record<string, string>) => {
  const url = new URL(baseUrl);
  setParams(url, params);
  return url;
};

export const createOutboundUrl = ({
  handoverUrl,
  targetUrl,
}: {
  handoverUrl: string;
  targetUrl: string;
}) => {
  const nextUrl = createUrl(handoverUrl, {
    [paramKeys.STAGE]: stages.OS_OUTBOUND,
    [paramKeys.R]: targetUrl,
  });

  return nextUrl.toString();
};

export const handleRedirect = ({
  currentUrl,
  cookieHandoverUrl,
  tokenHandoverUrl,
}: {
  currentUrl: string;
  cookieHandoverUrl: string;
  tokenHandoverUrl: string;
}) => {
  const url = new URL(currentUrl);
  const [stage] = stripParams(url, paramKeys.STAGE);

  switch (stage) {
    case stages.OS_OUTBOUND: {
      setParams(url, { [paramKeys.STAGE]: stages.OS_COOKIE_RETURN });

      const nextUrl = createUrl(cookieHandoverUrl, {
        [paramKeys.R]: url.toString(),
      });

      return nextUrl.toString();
    }
    case stages.OS_COOKIE_RETURN: {
      setParams(url, { [paramKeys.STAGE]: stages.OS_TOKEN_RETURN });
      const [cookies] = stripParams(url, paramKeys.COOKIES);

      const nextUrl = createUrl(tokenHandoverUrl, {
        [paramKeys.R]: url.toString(),
        [paramKeys.COOKIES]: cookies!,
      });

      return nextUrl.toString();
    }
    case stages.OS_TOKEN_RETURN: {
      const [target, cookies, token] = stripParams(
        url,
        paramKeys.R,
        paramKeys.COOKIES,
        paramKeys.TOKEN
      );

      console.log({ target, cookies, token });

      return target!;
    }
    default:
      throw new Error(
        `Unknown ${paramKeys.STAGE} query parameter: ${stage || "empty"}`
      );
  }
};
