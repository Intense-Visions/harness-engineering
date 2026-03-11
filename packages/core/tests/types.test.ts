import { describe, it, expect } from 'vitest';
import { Result, Ok, Err, isOk, isErr } from '../src/index';

describe('Result type', () => {
  describe('Ok', () => {
    it('should create a successful Result', () => {
      const result: Result<number, never> = Ok(42);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42);
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
});
