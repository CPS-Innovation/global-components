import { Config } from "./Config";
import { ConfigFetch, fetchConfig } from "./fetch-config";
import { transformAndValidateConfig } from "./validator";

// THE way a runtime bundle turns a config URL into a Config — used by both the
// host bundle (initialiseConfig) and the handover bundle (getConfig), so neither
// can fetch config.json and forget to transform/validate it (timed values, the
// CONTEXTS flattening, schema checks all live behind transformAndValidateConfig).
//
// `sources` are tried in order; the first ok response wins. A failing source
// (not ok, or throws — including unparseable JSON) falls through to the next;
// the last source's failure is the one reported. The host passes the local-dev
// override source ahead of fetchConfig; everything else takes the default.

const tryConfigSources = async ([source, ...rest]: ConfigFetch[], configUrl: string): Promise<unknown> => {
  try {
    const response = await source(configUrl);
    if (response.ok) {
      return await response.json();
    }

    if (!rest.length) {
      throw new Error(`Config fetch from ${configUrl} returned ${response.status} ${response.statusText}`);
    }
  } catch (err) {
    if (!rest.length) {
      throw err;
    }
  }

  return tryConfigSources(rest, configUrl);
};

export const loadConfig = async (configUrl: string, sources: ConfigFetch[] = [fetchConfig]): Promise<Config> => {
  const json = await tryConfigSources(sources, configUrl);
  const result = transformAndValidateConfig(json);
  if (result.success === false) {
    throw new Error(`Config validation error: ${result.errorMsg}`);
  }
  return result.config;
};
