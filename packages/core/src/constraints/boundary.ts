import { z } from 'zod';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import type { ConstraintError } from '../shared/errors';
import { createError } from '../shared/errors';
import type {
  BoundaryDefinition,
  BoundaryViolation,
  BoundaryValidation,
  BoundaryValidator,
} from './types';

/**
 * Create a boundary validator from a Zod schema
 */
export function createBoundaryValidator<T>(
  schema: z.ZodSchema<T>,
  name: string
): BoundaryValidator<T> {
  return {
    name,
    schema,

    parse(input: unknown): Result<T, ConstraintError> {
      const result = schema.safeParse(input);

      if (result.success) {
        return Ok(result.data);
      }

      const suggestions = result.error.issues.map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      });

      return Err(
        createError<ConstraintError>(
          'BOUNDARY_ERROR',
          `Boundary validation failed for ${name}`,
          {
            boundary: name,
            zodError: result.error,
            input,
          },
          suggestions
        )
      );
    },

    validate(input: unknown): Result<boolean, ConstraintError> {
      const result = schema.safeParse(input);
      return Ok(result.success);
    },
  };
}

/**
 * Validate multiple boundaries at once
 */
export function validateBoundaries(
  boundaries: BoundaryDefinition[],
  data: Map<string, unknown>
): Result<BoundaryValidation, ConstraintError> {
  const violations: BoundaryViolation[] = [];

  for (const boundary of boundaries) {
    const input = data.get(boundary.name);
    if (input === undefined) {
      continue;
    }

    const result = boundary.schema.safeParse(input);
    if (!result.success) {
      violations.push({
        boundary: boundary.name,
        direction: boundary.direction,
        error: result.error,
        data: input,
      });
    }
  }

  return Ok({
    valid: violations.length === 0,
    violations,
  });
}
