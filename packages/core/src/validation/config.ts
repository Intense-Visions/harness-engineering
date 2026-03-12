import { z } from 'zod';
import { Result, Ok, Err } from '../shared/result';
import { createError } from '../shared/errors';
import type { ConfigError } from './types';

/**
 * Validates configuration data against a Zod schema
 * Returns a Result type with validated data or ConfigError
 *
 * @template T - The type of data being validated
 * @param data - The configuration data to validate
 * @param schema - Zod schema to validate against
 * @returns Result<T, ConfigError> - Success with validated data or error
 */
export function validateConfig<T>(
  data: unknown,
  schema: z.ZodSchema<T>,
): Result<T, ConfigError> {
  const result = schema.safeParse(data);

  if (result.success) {
    return Ok(result.data);
  }

  // Convert Zod errors to ConfigError
  const zodErrors = result.error;
  const firstError = zodErrors.errors[0];

  let code: ConfigError['code'] = 'VALIDATION_FAILED';
  let message = 'Configuration validation failed';
  const suggestions: string[] = [];

  if (firstError) {
    const path = firstError.path.join('.');
    const pathDisplay = path ? ` at "${path}"` : '';

    // Determine error code based on issue type
    if (firstError.code === 'invalid_type') {
      const received = (firstError as any).received;
      const expected = (firstError as any).expected;

      // Check if this is a missing field (undefined received)
      if (received === 'undefined') {
        code = 'MISSING_FIELD';
        message = `Missing required field${pathDisplay}: ${firstError.message}`;
        suggestions.push(`Field "${path}" is required and must be of type "${expected}"`);
      } else {
        code = 'INVALID_TYPE';
        message = `Invalid type${pathDisplay}: ${firstError.message}`;
        suggestions.push(`Expected ${expected} but got ${received}`);
      }
    } else if (firstError.code === 'missing_keys') {
      code = 'MISSING_FIELD';
      message = `Missing required field(s)${pathDisplay}: ${firstError.message}`;
      const missingKeys = (firstError as any).keys as string[];
      suggestions.push(`Required field(s) missing: ${missingKeys.join(', ')}`);
    } else {
      code = 'VALIDATION_FAILED';
      message = `${firstError.message}${pathDisplay}`;
    }
  }

  const error: ConfigError = createError<ConfigError>(
    code,
    message,
    {
      zodError: zodErrors,
      path: firstError?.path,
    },
    suggestions,
  );

  return Err(error);
}
