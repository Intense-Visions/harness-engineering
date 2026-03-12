import { describe, it, expect } from 'vitest';
import { Ok, isOk, Err, isErr, Result } from '../../src/shared/result';

describe('Result', () => {
  describe('Ok', () => {
    it('should create a successful result', () => {
      const result = Ok('success');

      expect(result.ok).toBe(true);
      expect(isOk(result)).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('success');
      }
    });
  });

  describe('Err', () => {
    it('should create an error result', () => {
      const error = new Error('failed');
      const result = Err(error);

      expect(result.ok).toBe(false);
      expect(isErr(result)).toBe(true);
      if (!result.ok) {
        expect(result.error).toBe(error);
      }
    });
  });

  describe('Type narrowing', () => {
    it('should narrow types correctly with isOk', () => {
      const result: Result<string, Error> = Ok('value');

      if (isOk(result)) {
        // TypeScript should know result.value is string
        const value: string = result.value;
        expect(value).toBe('value');
      }
    });

    it('should narrow types correctly with isErr', () => {
      const error = new Error('failed');
      const result: Result<string, Error> = Err(error);

      if (isErr(result)) {
        // TypeScript should know result.error is Error
        const err: Error = result.error;
        expect(err).toBe(error);
      }
    });
  });
});
