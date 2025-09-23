import fetchJsonp from "fetch-jsonp";
import { ConfigFetch } from "../config/ConfigFetch";

export const fetchOverrideConfigAsJsonP: ConfigFetch = async (configUrl: string) =>
  await fetchJsonp(configUrl.replace(".json", ".override.js"), { jsonpCallbackFunction: "cps_global_components_config_jsonp_callback" });
