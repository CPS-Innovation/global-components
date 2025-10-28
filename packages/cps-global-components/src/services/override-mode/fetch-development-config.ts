import { ConfigFetch } from "../config/ConfigFetch";

export const fetchDevelopmentConfig: ConfigFetch = async (configUrl: string) => await fetch(configUrl.replace(".json", ".development.json"));
