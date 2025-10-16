import { Config, validateConfig, ValidationResult } from "cps-global-configuration";
import { ConfigFetch } from "./ConfigFetch";
import { getArtifactUrl } from "../../utils/get-artifact-url";
import { fetchOverrideConfig } from "../../services/override-mode/fetch-override-config";
import { fetchOverrideConfigAsJsonP } from "../../services/outsystems-shim/fetch-override-config-as-jsonp";

const tryConfigSources = async ([source, ...rest]: ConfigFetch[], configUrl: string): Promise<any> => {
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

  return tryConfigSources(rest, configUrl);
};

export const initialiseConfig = async ({ flags: { isOverrideMode, isOutSystems } }: { flags: { isOverrideMode: boolean; isOutSystems: boolean } }): Promise<Config> => {
  const configUrl = getArtifactUrl("config.json");

  const fetchConfig: ConfigFetch = async (configUrl: string) => await fetch(configUrl);

  let configSources: ConfigFetch[];
  if (isOverrideMode && isOutSystems) {
    // remove fetchOverrideConfigAsJsonP when outsystems have embedded us properly
    configSources = [fetchOverrideConfig, fetchOverrideConfigAsJsonP, fetchConfig];
  } else if (isOverrideMode) {
    configSources = [fetchOverrideConfig, fetchConfig];
  } else {
    configSources = [fetchConfig];
  }

  const configObject = await tryConfigSources(configSources, configUrl);
  const configResult: ValidationResult = validateConfig(configObject);
  if (configResult.success === true) {
    return configResult.config;
  } else {
    throw new Error(`Config validation error: ${configResult.errorMsg}`);
  }
};
