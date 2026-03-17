import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger } from '../../src/output/logger';

describe('logger', () => {
  const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
  });

  describe('info', () => {
    it('logs to console.log', () => {
      logger.info('test info message');
      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
      const output = mockConsoleLog.mock.calls[0]!.join(' ');
      expect(output).toContain('test info message');
    });
  });

  describe('success', () => {
    it('logs to console.log', () => {
      logger.success('operation completed');
      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
      const output = mockConsoleLog.mock.calls[0]!.join(' ');
      expect(output).toContain('operation completed');
    });
  });

  describe('warn', () => {
    it('logs to console.log', () => {
      logger.warn('something suspicious');
      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
      const output = mockConsoleLog.mock.calls[0]!.join(' ');
      expect(output).toContain('something suspicious');
    });
  });

  describe('error', () => {
    it('logs to console.error', () => {
      logger.error('something failed');
      expect(mockConsoleError).toHaveBeenCalledTimes(1);
      const output = mockConsoleError.mock.calls[0]!.join(' ');
      expect(output).toContain('something failed');
    });
  });

  describe('dim', () => {
    it('logs to console.log', () => {
      logger.dim('dimmed text');
      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
      const output = mockConsoleLog.mock.calls[0]!.join(' ');
      expect(output).toContain('dimmed text');
    });
  });

  describe('raw', () => {
    it('outputs JSON-stringified data', () => {
      const data = { key: 'value', count: 42 };
      logger.raw(data);
      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
      const output = mockConsoleLog.mock.calls[0]![0];
      const parsed = JSON.parse(output);
      expect(parsed).toEqual(data);
    });

    it('handles arrays', () => {
      const data = [1, 2, 3];
      logger.raw(data);
      const output = mockConsoleLog.mock.calls[0]![0];
      expect(JSON.parse(output)).toEqual([1, 2, 3]);
    });

    it('handles null', () => {
      logger.raw(null);
      const output = mockConsoleLog.mock.calls[0]![0];
      expect(output).toBe('null');
    });

    it('pretty-prints with 2-space indent', () => {
      logger.raw({ a: 1 });
      const output = mockConsoleLog.mock.calls[0]![0];
      expect(output).toBe(JSON.stringify({ a: 1 }, null, 2));
    });
  });
});
