import { ZodSafeParseSuccess } from "zod";
import {
  Config,
  configSchema,
  ConfigStorage,
  configStorageSchema,
  Context,
  ContextStorageSchema,
} from "./schema";
import { PotentiallyValidConfig, transformConfig } from "./transform-config";

export type ValidationResult =
  | {
      success: true;
      config: Config;
    }
  | {
      success: false;
      errorMsg: string;
    };

export const transformAndValidateConfig = (
  jsonData: unknown,
  filename?: string
): ValidationResult => {
  try {
    const storedConfig = validateStoredConfig(jsonData);
    validateStoredEnvironment(storedConfig, filename);

    const config = transformConfig(storedConfig);
    validateConfig(config);

    return {
      success: true,
      config,
    };
  } catch (err) {
    return {
      success: false,
      errorMsg: err instanceof Error ? err.message : "Unknown validation error",
    };
  }
};

const validateStoredConfig = (jsonData: any): ConfigStorage => {
  const result = configStorageSchema.safeParse(jsonData);
  if (!result.success) {
    throw new Error(result.error.message);
  }
  return result.data;
};

const validateStoredEnvironment = (
  storedConfig: ConfigStorage,
  filename?: string
) => {
  if (!filename) {
    return;
  }

  const match = filename.match(/^config\.(.+)\.json$/);
  if (!match) {
    return;
  }

  const expectedEnvironment = match[1];
  if (storedConfig.ENVIRONMENT === expectedEnvironment) {
    return;
  }

  throw new Error(
    `ENVIRONMENT field value "${storedConfig.ENVIRONMENT}" does not match filename environment "${expectedEnvironment}"`
  );
};

type AssertValidConfig = (
  config: PotentiallyValidConfig
) => asserts config is Config;

const validateConfig: AssertValidConfig = (
  config: PotentiallyValidConfig
): asserts config is Config => {
  const result = configSchema.safeParse(config);
  if (!result.success) {
    throw new Error(result.error.message);
  }
};
