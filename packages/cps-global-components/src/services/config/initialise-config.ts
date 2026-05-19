import { ApplicationFlags, Config, ConfigFetch, fetchConfig, transformAndValidateConfig, ValidationResult } from "cps-global-configuration";
import { getArtifactUrl } from "../../utils/get-artifact-url";
import { fetchDevelopmentConfig } from "../override-mode/fetch-development-config";

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

type Register = (arg: { config: Config }) => void;

export const initialiseConfig = async ({
  rootUrl,
  flags: {
    isLocalDevelopment,
    e2eTestMode: { isE2eTestMode },
  },
  register,
}: {
  rootUrl: string;
  flags: ApplicationFlags;
  register: Register;
}): Promise<Config> => {
  const configUrl = getArtifactUrl(rootUrl, "config.json");

  // Local-dev override (fetches config.development.json) tried first; falls
  // through to the deployed config.json. Override-via-preview is gone — see
  // FCT2-17451 drop 4 cleanup; preview no longer drives a config swap so
  // initialiseConfig doesn't need to wait for preview to load.
  const configSources = [
    isLocalDevelopment && !isE2eTestMode //
      ? fetchDevelopmentConfig
      : undefined,
    fetchConfig,
  ].filter(config => !!config) as ConfigFetch[];

  const configObject = await tryConfigSources(configSources, configUrl);
  const configResult: ValidationResult = transformAndValidateConfig(configObject);
  if (configResult.success === true) {
    register({ config: configResult.config });
    return configResult.config;
  } else {
    throw new Error(`Config validation error: ${configResult.errorMsg}`);
  }
};
