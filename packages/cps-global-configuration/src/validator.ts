import { configSchema, Config } from "./schema";
import { configSchema2, Config2 } from "./schema2";

export type ValidationResult =
  | {
      success: true;
      config: Config;
    }
  | {
      success: false;
      errorMsg: string;
    };

export const validateConfig = (
  jsonData: unknown,
  filename?: string
): ValidationResult => {
  try {
    const result = configSchema.safeParse(jsonData);

    if (result.success) {
      // If filename is provided, validate that ENVIRONMENT matches
      if (filename) {
        const match = filename.match(/^config\.(.+)\.json$/);
        if (match) {
          const expectedEnvironment = match[1];
          if (result.data.ENVIRONMENT !== expectedEnvironment) {
            throw new Error(
              `ENVIRONMENT field value "${result.data.ENVIRONMENT}" does not match filename environment "${expectedEnvironment}"`
            );
          }
        }
      }

      return {
        success: true,
        config: result.data,
      };
    } else {
      throw new Error(result.error.message);
    }
  } catch (err) {
    return {
      success: false,
      errorMsg: err instanceof Error ? err.message : "Unknown validation error",
    };
  }
};

export function validateConfigStrict(
  jsonData: unknown,
  filename?: string
): Config {
  const parsed = configSchema.parse(jsonData);

  // If filename is provided, validate that ENVIRONMENT matches
  if (filename) {
    const match = filename.match(/^config\.(.+)\.json$/);
    if (match) {
      const expectedEnvironment = match[1];
      if (parsed.ENVIRONMENT !== expectedEnvironment) {
        throw new Error(
          `ENVIRONMENT field value "${parsed.ENVIRONMENT}" does not match filename environment "${expectedEnvironment}"`
        );
      }
    }
  }

  return parsed;
}

export type ValidationResult2 =
  | {
      success: true;
      config: Config2;
    }
  | {
      success: false;
      errorMsg: string;
    };

export const validateConfig2 = (
  jsonData: unknown,
  filename?: string
): ValidationResult2 => {
  try {
    const result = configSchema2.safeParse(jsonData);

    if (result.success) {
      // If filename is provided, validate that ENVIRONMENT matches
      if (filename) {
        const match = filename.match(/^config\.(.+)\.json$/);
        if (match) {
          const expectedEnvironment = match[1];
          if (result.data.ENVIRONMENT !== expectedEnvironment) {
            throw new Error(
              `ENVIRONMENT field value "${result.data.ENVIRONMENT}" does not match filename environment "${expectedEnvironment}"`
            );
          }
        }
      }

      return {
        success: true,
        config: result.data,
      };
    } else {
      throw new Error(result.error.message);
    }
  } catch (err) {
    return {
      success: false,
      errorMsg: err instanceof Error ? err.message : "Unknown validation error",
    };
  }
};

export function validateConfig2Strict(
  jsonData: unknown,
  filename?: string
): Config2 {
  const parsed = configSchema2.parse(jsonData);

  // If filename is provided, validate that ENVIRONMENT matches
  if (filename) {
    const match = filename.match(/^config\.(.+)\.json$/);
    if (match) {
      const expectedEnvironment = match[1];
      if (parsed.ENVIRONMENT !== expectedEnvironment) {
        throw new Error(
          `ENVIRONMENT field value "${parsed.ENVIRONMENT}" does not match filename environment "${expectedEnvironment}"`
        );
      }
    }
  }

  return parsed;
}
