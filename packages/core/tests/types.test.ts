import { describe, it, expect, assertType } from 'vitest';
import { Result, Ok, Err, isOk, isErr, configureFeedback, createSelfReview, requestPeerReview } from '../src/index';

describe('Result type', () => {
  describe('Ok', () => {
    it('should create a successful Result', () => {
      const result: Result<number, never> = Ok(42);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42);
      }
    });

    it('should handle null values', () => {
      const result = Ok(null);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(null);
      }
    });

    it('should handle undefined values', () => {
      const result = Ok(undefined);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeUndefined();
      }
    });

    it('should handle complex objects', () => {
      const complexObject = { nested: { data: [1, 2, 3] }, name: 'test' };
      const result = Ok(complexObject);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(complexObject);
        expect(result.value.nested.data).toEqual([1, 2, 3]);
      }
    });

    it('should handle arrays', () => {
      const array = [1, 2, 3, 4, 5];
      const result = Ok(array);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(array);
        expect(result.value.length).toBe(5);
      }
    });
  });

  describe('Err', () => {
    it('should create a failed Result', () => {
      const result: Result<never, string> = Err('Something went wrong');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Something went wrong');
      }
    });

    it('should handle Error objects', () => {
      const error = new Error('Something failed');
      const result = Err(error);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error.message).toBe('Something failed');
      }
    });

    it('should handle complex error objects', () => {
      const complexError = { code: 'ERR_001', message: 'Network error', details: { status: 500 } };
      const result = Err(complexError);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toEqual(complexError);
        expect(result.error.details.status).toBe(500);
      }
    });
  });

  describe('Integration tests with real functions', () => {
    // Example function that returns a Result type
    function divide(a: number, b: number): Result<number, string> {
      if (b === 0) return Err('Division by zero');
      return Ok(a / b);
    }

    it('should handle division success and failure', () => {
      const success = divide(10, 2);
      expect(isOk(success)).toBe(true);
      if (isOk(success)) {
        expect(success.value).toBe(5);
      }

      const failure = divide(10, 0);
      expect(isErr(failure)).toBe(true);
      if (isErr(failure)) {
        expect(failure.error).toBe('Division by zero');
      }
    });

    it('should handle negative numbers', () => {
      const result = divide(-10, 2);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(-5);
      }
    });

    it('should handle decimal results', () => {
      const result = divide(1, 3);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBeCloseTo(0.333, 2);
      }
    });

    // Example function that processes data
    function parseJSON(jsonString: string): Result<unknown, string> {
      try {
        return Ok(JSON.parse(jsonString));
      } catch (error) {
        return Err('Invalid JSON');
      }
    }

    it('should parse valid JSON', () => {
      const result = parseJSON('{"key": "value"}');
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual({ key: 'value' });
      }
    });

    it('should return error for invalid JSON', () => {
      const result = parseJSON('{invalid json}');
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe('Invalid JSON');
      }
    });

    // Example function with object result
    interface User {
      id: number;
      name: string;
      email: string;
    }

    function createUser(name: string, email: string): Result<User, string> {
      if (!name.trim()) return Err('Name cannot be empty');
      if (!email.includes('@')) return Err('Invalid email format');
      return Ok({ id: 1, name, email });
    }

    it('should create user successfully', () => {
      const result = createUser('John Doe', 'john@example.com');
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.name).toBe('John Doe');
        expect(result.value.email).toBe('john@example.com');
        expect(result.value.id).toBe(1);
      }
    });

    it('should reject empty name', () => {
      const result = createUser('   ', 'john@example.com');
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe('Name cannot be empty');
      }
    });

    it('should reject invalid email', () => {
      const result = createUser('John Doe', 'invalid-email');
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe('Invalid email format');
      }
    });
  });

  describe('isOk', () => {
    it('should return true for Ok results', () => {
      const result = Ok(42);
      expect(isOk(result)).toBe(true);
    });

    it('should return false for Err results', () => {
      const result = Err('error');
      expect(isOk(result)).toBe(false);
    });

    it('should narrow type correctly', () => {
      const result: Result<number, string> = Ok(42);

      if (isOk(result)) {
        // Type should be narrowed to { ok: true; value: number }
        const value: number = result.value;
        expect(value).toBe(42);
      }
    });
  });

  describe('isErr', () => {
    it('should return true for Err results', () => {
      const result = Err('error');
      expect(isErr(result)).toBe(true);
    });

    it('should return false for Ok results', () => {
      const result = Ok(42);
      expect(isErr(result)).toBe(false);
    });

    it('should narrow type correctly', () => {
      const result: Result<number, string> = Err('error');

      if (isErr(result)) {
        // Type should be narrowed to { ok: false; error: string }
        const error: string = result.error;
        expect(error).toBe('error');
      }
    });
  });

  describe('Type system tests', () => {
    it('should accept Ok with any value type', () => {
      const okNumber = Ok(42);
      const okString = Ok('hello');
      const okArray = Ok([1, 2, 3]);
      const okObject = Ok({ key: 'value' });

      expect(isOk(okNumber)).toBe(true);
      expect(isOk(okString)).toBe(true);
      expect(isOk(okArray)).toBe(true);
      expect(isOk(okObject)).toBe(true);
    });

    it('should accept Err with any error type', () => {
      const errString = Err('error message');
      const errError = Err(new Error('error'));
      const errObject = Err({ code: 'ERR001', message: 'error' });

      expect(isErr(errString)).toBe(true);
      expect(isErr(errError)).toBe(true);
      expect(isErr(errObject)).toBe(true);
    });

    it('should maintain correct type inference', () => {
      const result: Result<string, number> = Ok('test');

      if (isOk(result)) {
        // This would fail type checking if types aren't correctly inferred
        const _value: string = result.value;
        expect(_value).toBe('test');
      }

      const errorResult: Result<string, number> = Err(404);
      if (isErr(errorResult)) {
        const _error: number = errorResult.error;
        expect(_error).toBe(404);
      }
    });
  });
});

describe('Core Package Exports', () => {
  it('should export feedback module', () => {
    expect(configureFeedback).toBeDefined();
    expect(createSelfReview).toBeDefined();
    expect(requestPeerReview).toBeDefined();
  });
});
