export type CmsSessionHint = {
  cmsDomains: string[];
  isProxySession: boolean;
  handoverEndpoint: string | null;
};

export type CmsSessionHintResult =
  | {
      found: true;
      hint: CmsSessionHint;
      error?: undefined;
    }
  | { found: false; hint?: undefined; error: any };
