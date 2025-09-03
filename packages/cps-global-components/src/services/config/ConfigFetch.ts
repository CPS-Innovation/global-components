export type ConfigFetch = (configUrl: string) => Promise<Pick<Response, "ok" | "json">>;
