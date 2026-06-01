export type GetToken = ({ config: { AD_GATEWAY_SCOPES } }: { config: { AD_GATEWAY_SCOPES: string[] } }) => Promise<string | null>;
