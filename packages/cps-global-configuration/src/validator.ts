import { ConfigSchema, type Config } from './schema';

export interface ValidationResult {
  success: boolean;
  data?: Config;
  error?: string;
}

export function validateConfig(jsonData: unknown, filename?: string): ValidationResult {
  try {
    const result = ConfigSchema.safeParse(jsonData);
    
    if (result.success) {
      // If filename is provided, validate that ENVIRONMENT matches
      if (filename) {
        const match = filename.match(/^config\.(.+)\.json$/);
        if (match) {
          const expectedEnvironment = match[1];
          if (result.data.ENVIRONMENT !== expectedEnvironment) {
            return {
              success: false,
              error: `ENVIRONMENT field value "${result.data.ENVIRONMENT}" does not match filename environment "${expectedEnvironment}"`,
            };
          }
        }
      }
      
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

export function validateConfigStrict(jsonData: unknown, filename?: string): Config {
  const parsed = ConfigSchema.parse(jsonData);
  
  // If filename is provided, validate that ENVIRONMENT matches
  if (filename) {
    const match = filename.match(/^config\.(.+)\.json$/);
    if (match) {
      const expectedEnvironment = match[1];
      if (parsed.ENVIRONMENT !== expectedEnvironment) {
        throw new Error(`ENVIRONMENT field value "${parsed.ENVIRONMENT}" does not match filename environment "${expectedEnvironment}"`);
      }
    }
  }
  
  return parsed;
}