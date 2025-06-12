import { validateConfig, Config } from "cps-global-configuration";
import { scriptUrl } from "./script-url";
import { tryFetchOverrideConfig, tryFetchOverrideConfigAsJsonP } from "../test-mode/test-mode";

let cachedConfigPromise: Promise<Config>;

const getConfig = async (configUrl: string): Promise<{ json: () => Promise<any> }> =>
  (await tryFetchOverrideConfig(configUrl)) || (await tryFetchOverrideConfigAsJsonP(configUrl)) || (await fetch(configUrl));

export const CONFIG_ASYNC = () => {
  const internal = async () => {
    const configUrl = new URL("./", scriptUrl()).href + "config.json";
    try {
      const response = await getConfig(configUrl);
      const json = await response.json();

      const { success, data, error } = validateConfig(json);
      if (!success) {
        throw new Error(`Config validation error: ${error}`);
      }
      return data;
    } catch (err) {
      throw new Error(`Invalid config JSON retrieved from ${configUrl}: ${JSON.stringify(err)}`);
    }
  };

  cachedConfigPromise = cachedConfigPromise || internal();
  return cachedConfigPromise;
};
