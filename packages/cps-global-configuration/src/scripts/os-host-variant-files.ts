import * as fs from "node:fs";

// OS host variants: configuration/config.<env>.<variant>.json is <env>'s config
// pointed at another OutSystems host (see outsystems-host-consistency.spec.ts, and
// OS_HOST_VARIANTS in infra/proxy/config/global-components.vnext). Notification
// files share the filename shape, so they're excluded.
export type OsHostVariantFile = { file: string; env: string; variant: string };

export const listOsHostVariantFiles = (configDir: string): OsHostVariantFile[] =>
  fs
    .readdirSync(configDir)
    .map(file => file.match(/^config\.([^.]+)\.([^.]+)\.json$/))
    .filter((match): match is RegExpMatchArray => !!match && match[2] !== "notification")
    .map(([file, env, variant]) => ({ file, env: env!, variant: variant! }));
