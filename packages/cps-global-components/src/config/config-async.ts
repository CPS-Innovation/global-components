import { validateConfig, Config } from "cps-global-configuration";
import { scriptUrl } from "./script-url";
import { tryFetchOverrideConfig } from "../override-mode/try-fetch-override-config";
import { ConfigFetch } from "./ConfigFetch";
import { tryFetchOverrideConfigAsJsonP } from "../override-mode/outsystems-shim/try-fetch-override-config-as-jsonp";

let cachedConfigPromise: Promise<Config>;

const getConfigObject = async ([source, ...rest]: ConfigFetch[], configUrl: string): Promise<any> => {
  try {
    const response = await source(configUrl);
    if (response.ok) {
      return await response.json();
    }

    if (!rest.length) {
      throw new Error("Config returned ok = false, probably a 404");
    }
  } catch (err) {
    if (!rest.length) {
      throw err;
    }
  }

  return getConfigObject(rest, configUrl);
};

const getConfig: ConfigFetch = async (configUrl: string) => await fetch(configUrl);

export const CONFIG_ASYNC = () => {
  const internal = async () => {
    const configUrl = new URL("./", scriptUrl()).href + "config.json";
    try {
      const configObject = await getConfigObject(
        [
          tryFetchOverrideConfig,
          // remove tryFetchOverrideConfigAsJsonP when outsystems have embedded us properly
          tryFetchOverrideConfigAsJsonP,
          getConfig,
        ],
        configUrl,
      );
      const { success, data, error } = validateConfig(configObject);
      if (!success) {
        throw new Error(`Config validation error: ${error}`);
      }
      return data;
    } catch (err) {
      return { _CONFIG_ERROR: `Invalid config JSON retrieved from ${configUrl}: ${err}, ${JSON.stringify(err)}`, ENVIRONMENT: "unknown" };
    }
  };

  cachedConfigPromise = cachedConfigPromise || internal();
  return cachedConfigPromise;
};
