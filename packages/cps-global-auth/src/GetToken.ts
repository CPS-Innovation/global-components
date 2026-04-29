export type GetToken = ({ config: { AD_GATEWAY_SCOPE } }: { config: { AD_GATEWAY_SCOPE: string | undefined } }) => Promise<string | null>;
