import fetchJsonp from "fetch-jsonp";
import { ConfigFetch } from "../../config/ConfigFetch";
import { isOutSystemsApp } from "../../helpers/is-outsystems-app";

export const tryFetchOverrideConfigAsJsonP: ConfigFetch = async (configUrl: string) =>
  isOutSystemsApp(window.location.href)
    ? await fetchJsonp(configUrl.replace(".json", ".override.js"), { jsonpCallbackFunction: "cps_global_components_config_jsonp_callback" })
    : { ok: false, json: () => Promise.resolve(null) };
