import { validateConfig, Config } from "cps-global-configuration";
import { scriptUrl } from "./script-url";
import { tryGetConfigAsJsonP } from "../test-mode/test-mode";

let cachedConfigPromise: Promise<Config>;

const getConfig = async (configUrl: string) => {
  try {
    const response = await fetch(configUrl);
    return await response.json();
  } catch (err) {
    const responseFromJsonp = await tryGetConfigAsJsonP(configUrl);
    if (responseFromJsonp) {
      return responseFromJsonp;
    }
    throw err;
  }
};

export const CONFIG_ASYNC = () => {
  const internal = async () => {
    const configUrl = new URL("./", scriptUrl()).href + "config.json";
    try {
      const json = await getConfig(configUrl);
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
