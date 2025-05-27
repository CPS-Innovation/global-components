import { ConfigSchema, type Config } from './schema';

export interface ValidationResult {
  success: boolean;
  data?: Config;
  error?: string;
}

export function validateConfig(jsonData: unknown): ValidationResult {
  try {
    const result = ConfigSchema.safeParse(jsonData);
    
    if (result.success) {
      return {
        success: true,
        data: result.data,
      };
    } else {
      return {
        success: false,
        error: result.error.message,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown validation error',
    };
  }
}

export function validateConfigStrict(jsonData: unknown): Config {
  return ConfigSchema.parse(jsonData);
}