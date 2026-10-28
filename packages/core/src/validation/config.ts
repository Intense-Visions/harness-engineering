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
export function validateConfig<T>(data: unknown, schema: z.ZodSchema<T>): Result<T, ConfigError> {
  const result = schema.safeParse(data);

  if (result.success) {
    return Ok(result.data);
  }

  // Convert Zod errors to ConfigError
  const zodErrors = result.error;
  const firstError = zodErrors.issues[0];

  let code: ConfigError['code'] = 'VALIDATION_FAILED';
  let message = 'Configuration validation failed';
  const suggestions: string[] = [];

  if (firstError) {
    const path = firstError.path.join('.');
    const pathDisplay = path ? ` at "${path}"` : '';

    // Determine error code based on issue type
    if (firstError.code === 'invalid_type') {
      // zod 4 dropped `received` from invalid_type issues, so derive it from the
      // input itself — otherwise every missing field would read as a type mismatch.
      const received = describeReceived(valueAtPath(data, firstError.path));
      const expected = firstError.expected;

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
    suggestions
  );

  return Err(error);
}

function valueAtPath(data: unknown, path: readonly PropertyKey[]): unknown {
  let current: unknown = data;
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<PropertyKey, unknown>)[key];
  }
  return current;
}

function describeReceived(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}
