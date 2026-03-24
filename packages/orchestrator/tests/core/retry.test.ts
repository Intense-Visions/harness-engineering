import { describe, it, expect } from 'vitest';
import { calculateRetryDelay } from '../../src/core/retry';

describe('calculateRetryDelay', () => {
  describe('continuation retries', () => {
    it('should return 1000ms for continuation regardless of attempt', () => {
      expect(calculateRetryDelay(1, 'continuation')).toBe(1000);
      expect(calculateRetryDelay(5, 'continuation')).toBe(1000);
      expect(calculateRetryDelay(100, 'continuation')).toBe(1000);
    });
  });

  describe('failure retries', () => {
    it('should calculate exponential backoff: 10000 * 2^(attempt-1)', () => {
      expect(calculateRetryDelay(1, 'failure', 300000)).toBe(10000);
      expect(calculateRetryDelay(2, 'failure', 300000)).toBe(20000);
      expect(calculateRetryDelay(3, 'failure', 300000)).toBe(40000);
      expect(calculateRetryDelay(4, 'failure', 300000)).toBe(80000);
      expect(calculateRetryDelay(5, 'failure', 300000)).toBe(160000);
    });

    it('should cap at maxRetryBackoffMs', () => {
      expect(calculateRetryDelay(6, 'failure', 300000)).toBe(300000);
      expect(calculateRetryDelay(10, 'failure', 300000)).toBe(300000);
    });

    it('should respect custom maxRetryBackoffMs', () => {
      expect(calculateRetryDelay(1, 'failure', 5000)).toBe(5000);
      expect(calculateRetryDelay(2, 'failure', 15000)).toBe(15000);
    });

    it('should use default maxRetryBackoffMs of 300000 when not provided', () => {
      expect(calculateRetryDelay(1, 'failure')).toBe(10000);
      expect(calculateRetryDelay(6, 'failure')).toBe(300000);
    });
  });
});
