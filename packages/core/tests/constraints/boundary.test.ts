import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createBoundaryValidator, validateBoundaries } from '../../src/constraints/boundary';

describe('createBoundaryValidator', () => {
  const UserSchema = z.object({
    email: z.string().email(),
    name: z.string().min(1),
  });

  it('should parse valid data', () => {
    const validator = createBoundaryValidator(UserSchema, 'User.create');

    const result = validator.parse({ email: 'test@example.com', name: 'John' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.email).toBe('test@example.com');
      expect(result.value.name).toBe('John');
    }
  });

  it('should return error for invalid data', () => {
    const validator = createBoundaryValidator(UserSchema, 'User.create');

    const result = validator.parse({ email: 'invalid', name: '' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('BOUNDARY_ERROR');
      expect(result.error.suggestions.length).toBeGreaterThan(0);
    }
  });

  it('should validate without parsing', () => {
    const validator = createBoundaryValidator(UserSchema, 'User.create');

    const validResult = validator.validate({ email: 'test@example.com', name: 'John' });
    expect(validResult.ok).toBe(true);
    if (validResult.ok) {
      expect(validResult.value).toBe(true);
    }

    const invalidResult = validator.validate({ email: 'invalid', name: '' });
    expect(invalidResult.ok).toBe(true);
    if (invalidResult.ok) {
      expect(invalidResult.value).toBe(false);
    }
  });

  it('should expose schema and name', () => {
    const validator = createBoundaryValidator(UserSchema, 'User.create');

    expect(validator.name).toBe('User.create');
    expect(validator.schema).toBe(UserSchema);
  });
});

describe('validateBoundaries', () => {
  const UserSchema = z.object({
    email: z.string().email(),
    name: z.string().min(1),
  });

  it('should validate multiple boundaries', () => {
    const boundaries = [
      { name: 'User.create', layer: 'api', schema: UserSchema, direction: 'input' as const },
    ];

    const data = new Map([['User.create', { email: 'test@example.com', name: 'John' }]]);

    const result = validateBoundaries(boundaries, data);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
      expect(result.value.violations).toHaveLength(0);
    }
  });

  it('should collect violations', () => {
    const boundaries = [
      { name: 'User.create', layer: 'api', schema: UserSchema, direction: 'input' as const },
    ];

    const data = new Map([['User.create', { email: 'invalid', name: '' }]]);

    const result = validateBoundaries(boundaries, data);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(false);
      expect(result.value.violations.length).toBeGreaterThan(0);
    }
  });

  it('should skip validation for missing data', () => {
    const boundaries = [
      { name: 'User.create', layer: 'api', schema: UserSchema, direction: 'input' as const },
      { name: 'Order.create', layer: 'api', schema: UserSchema, direction: 'input' as const },
    ];

    // Only provide data for one boundary, not the other
    const data = new Map([
      ['User.create', { email: 'test@example.com', name: 'John' }],
      // Order.create is not provided - should be skipped
    ]);

    const result = validateBoundaries(boundaries, data);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
      expect(result.value.violations).toHaveLength(0);
    }
  });
});
