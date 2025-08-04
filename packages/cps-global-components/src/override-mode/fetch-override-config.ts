import { ConfigFetch } from "../config/ConfigFetch";

export const fetchOverrideConfig: ConfigFetch = async (configUrl: string) => await fetch(configUrl.replace(".json", ".override.json"));
