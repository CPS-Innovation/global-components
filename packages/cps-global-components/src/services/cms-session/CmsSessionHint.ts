export type CmsSessionHint = {
  cmsDomains: string[];
  isProxySession: boolean;
  handoverEndpoint: string | null;
};
