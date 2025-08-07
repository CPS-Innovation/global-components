import { validateConfig } from "cps-global-configuration";
import { getArtifactUrl } from "../utils/get-artifact-url";
import { fetchOverrideConfig } from "../override-mode/fetch-override-config";
import { ConfigFetch } from "./ConfigFetch";
import { fetchOverrideConfigAsJsonP } from "../override-mode/outsystems-shim/fetch-override-config-as-jsonp";

let cachedPromise: ReturnType<typeof internal> = undefined;

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

const internal = async (isOverrideMode: boolean) => {
  const configUrl = getArtifactUrl("config.json");
  try {
    const configObject = await getConfigObject(
      isOverrideMode
        ? [
            fetchOverrideConfig,
            // remove fetchOverrideConfigAsJsonP when outsystems have embedded us properly
            fetchOverrideConfigAsJsonP,
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

export const initialiseConfig = (isOverrideMode: boolean): void => {
  cachedPromise = internal(isOverrideMode);
};

export const CONFIG = () => cachedPromise;
