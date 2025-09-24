import { configSchema, Config } from "./schema";

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
