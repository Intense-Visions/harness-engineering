import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { validateConfig } from '../../src/validation/config';
import { isOk, isErr } from '../../src/shared/result';

describe('validateConfig', () => {
  // Step 2: Write failing test for valid config
  it('should validate correct config and return success with value', () => {
    const schema = z.object({
      name: z.string(),
      version: z.string(),
      port: z.number(),
    });

    const validConfig = {
      name: 'my-app',
      version: '1.0.0',
      port: 3000,
    };

    const result = validateConfig(validConfig, schema);

    expect(isOk(result)).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(validConfig);
      expect(result.value.name).toBe('my-app');
      expect(result.value.version).toBe('1.0.0');
      expect(result.value.port).toBe(3000);
    }
  });

  // Step 6: Write test for invalid type
  it('should catch type mismatches and return error', () => {
    const schema = z.object({
      name: z.string(),
      port: z.number(),
    });

    const invalidConfig = {
      name: 'my-app',
      port: 'not-a-number', // Invalid: should be number
    };

    const result = validateConfig(invalidConfig, schema);

    expect(isErr(result)).toBe(true);
    if (result.ok === false) {
      expect(result.error.code).toBe('INVALID_TYPE');
      expect(result.error.message).toContain('Expected number');
    }
  });

  // Step 8: Write test for missing field
  it('should detect missing required fields', () => {
    const schema = z.object({
      name: z.string(),
      version: z.string(),
      port: z.number(),
    });

    const incompleteConfig = {
      name: 'my-app',
      // Missing version and port
    };

    const result = validateConfig(incompleteConfig, schema);

    expect(isErr(result)).toBe(true);
    if (result.ok === false) {
      expect(result.error.code).toBe('MISSING_FIELD');
      expect(result.error.message).toContain('Required');
    }
  });

  // Step 10: Write test for nested objects
  it('should validate nested objects correctly', () => {
    const schema = z.object({
      app: z.object({
        name: z.string(),
        version: z.string(),
      }),
      server: z.object({
        host: z.string(),
        port: z.number(),
      }),
    });

    const validNestedConfig = {
      app: {
        name: 'my-app',
        version: '1.0.0',
      },
      server: {
        host: 'localhost',
        port: 3000,
      },
    };

    const result = validateConfig(validNestedConfig, schema);

    expect(isOk(result)).toBe(true);
    if (result.ok) {
      expect(result.value.app.name).toBe('my-app');
      expect(result.value.server.port).toBe(3000);
    }
  });
});
