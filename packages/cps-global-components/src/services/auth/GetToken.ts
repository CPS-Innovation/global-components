// Host-side definition. Structurally compatible with cps-global-auth's GetToken
// so the function returned by initialiseAdAuth can be assigned to this type
// at the call boundary without an explicit import dependency on the library's
// type.

export type GetToken = ({ config: { AD_GATEWAY_SCOPE } }: { config: { AD_GATEWAY_SCOPE: string | undefined } }) => Promise<string | null>;
