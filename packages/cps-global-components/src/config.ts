import { validateConfig, Config } from "cps-global-configuration";

let cachedConfigPromise: Promise<Config>;

export const CONFIG_ASYNC = () => {
  if (cachedConfigPromise) {
    console.debug("Returning cached config");
    return cachedConfigPromise;
  }
  const internal = async () => {
    const configUrl = new URL("./", import.meta.url).href + "config.json";
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

  cachedConfigPromise = internal();

  return cachedConfigPromise;
};
