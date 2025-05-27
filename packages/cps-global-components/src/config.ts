import { validateConfig } from "cps-global-configuration";

const configUrl = new URL("./", import.meta.url).href + "config.json";

export type Config = Awaited<ReturnType<typeof loadConfig>>;

export let CONFIG: Config;

const loadConfig = () =>
  fetch(configUrl)
    .then(response => response.json())
    .then(json => {
      const { success, data, error } = validateConfig(json);
      if (!success) {
        throw new Error(`Invalid config JSON retrieved from ${configUrl}: ${JSON.stringify(error)}`);
      }
      console.debug(data);
      CONFIG = data;
      return data;
    });

// We make the act of getting config synchronous by
//  - exporting loadConfig as the default
//  - in stencil.config.ts, setting this as the `globalScript`
// This means this runs to completion before any of the other app code.
// Which in turn means we can safely do const {SETTING} = CONFIG in application code
// without faffing about with awaiting.
export default loadConfig;
