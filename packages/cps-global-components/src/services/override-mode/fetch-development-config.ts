import { ConfigFetch } from "cps-global-configuration";

export const fetchDevelopmentConfig: ConfigFetch = async (configUrl: string) => await fetch(configUrl.replace(".json", ".development.json"));
