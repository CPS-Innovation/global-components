import { validateConfig, Config } from "cps-global-configuration";
import { scriptUrl } from "./script-url";

let cachedConfigPromise: Promise<Config>;

export const CONFIG_ASYNC = () => {
  const internal = async () => {
    const configUrl = new URL("./", scriptUrl()).href + "config.json";
    try {
      const response = await fetch(configUrl);
      const json = await response.json();
      const { success, data, error } = validateConfig(json);
      if (!success) {
        throw new Error(`Invalid config JSON retrieved from ${configUrl}: ${JSON.stringify(error)}`);
      }
      return data;
    } catch (err) {
      throw new Error(`Invalid config JSON retrieved from ${configUrl}: ${JSON.stringify(err)}`);
    }
  };

  cachedConfigPromise = cachedConfigPromise || internal();
  return cachedConfigPromise;
};
