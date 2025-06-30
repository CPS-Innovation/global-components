import { ConfigFetch } from "../config/ConfigFetch";

export const tryFetchOverrideConfig: ConfigFetch = async (configUrl: string) => await fetch(configUrl.replace(".json", ".override.json"));
