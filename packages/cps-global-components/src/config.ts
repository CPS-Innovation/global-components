import { validateConfig, Config } from "cps-global-configuration";

const configUrl = new URL("./", import.meta.url).href + "config.json";
export const CONFIG_ASYNC = fetch(configUrl)
  .then(response => {
    if (!response.ok) {
      throw new Error(`config.json not retrieved from ${configUrl}. Response status: ${response.status}`);
    }
    return response;
  })
  .then(response => response.json())
  .then(json => {
    const { success, data, error } = validateConfig(json);
    if (!success) {
      throw new Error(`Invalid config JSON retrieved from ${configUrl}: ${JSON.stringify(error)}`);
    }
    return data;
  })
  .catch(err => {
    console.error(err);
    return { _CONFIG_ERROR: String(err) } as Config;
  });
