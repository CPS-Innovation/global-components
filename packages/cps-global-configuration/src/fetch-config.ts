// Shared config fetcher. `cache: "no-cache"` ensures the browser revalidates
// rather than serving stale JSON after a hard refresh that lands on new code —
// otherwise loadConfig's validation can fail because the runtime expects
// fields the cached config doesn't yet have. Used by loadConfig (config.json,
// for both the host and handover bundles) and by the notifications fetch.

export type ConfigFetch = (configUrl: string) => Promise<Pick<Response, "ok" | "json" | "status" | "statusText">>;

export const fetchConfig: ConfigFetch = (configUrl: string) => fetch(configUrl, { cache: "no-cache" });
