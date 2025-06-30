import { validateConfig, Config } from "cps-global-configuration";
import { getArtifactUrl } from "../get-artifact-url";
import { tryFetchOverrideConfig } from "../override-mode/try-fetch-override-config";
import { ConfigFetch } from "./ConfigFetch";
import { tryFetchOverrideConfigAsJsonP } from "../override-mode/outsystems-shim/try-fetch-override-config-as-jsonp";

let cachedConfigPromise: Promise<Config> = undefined;

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

export const initialiseConfig = (isOverrideMode: boolean) => {
  const internal = async () => {
    const configUrl = getArtifactUrl("config.json");
    try {
      const configObject = await getConfigObject(
        isOverrideMode
          ? [
              tryFetchOverrideConfig,
              // remove tryFetchOverrideConfigAsJsonP when outsystems have embedded us properly
              tryFetchOverrideConfigAsJsonP,
              getConfig,
            ]
          : [getConfig],
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

export const CONFIG_ASYNC = () =>
  cachedConfigPromise ||
  new Promise((resolve, reject) => {
    let timeoutId: NodeJS.Timeout;
    let intervalId: NodeJS.Timeout;

    // Set up timeout to reject the promise if value isn't defined in time
    timeoutId = setTimeout(() => {
      clearInterval(intervalId);
      reject(new Error(`Config was not defined in expected timeframe`));
    }, 5000);

    // Poll for the global value every 50ms
    intervalId = setInterval(() => {
      if (cachedConfigPromise !== undefined) {
        clearInterval(intervalId);
        if (timeoutId) clearTimeout(timeoutId);
        resolve(cachedConfigPromise);
      }
    }, 100);
  });
