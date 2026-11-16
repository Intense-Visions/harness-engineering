import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger, setMachineOutput } from '../../src/output/logger';

describe('logger', () => {
  const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    setMachineOutput(false);
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
    // A warning is a diagnostic: it must never land on stdout, where it would
    // corrupt a `--json` document (#2519).
    it('logs to console.error, never console.log', () => {
      logger.warn('something suspicious');
      expect(mockConsoleError).toHaveBeenCalledTimes(1);
      expect(mockConsoleLog).not.toHaveBeenCalled();
      const output = mockConsoleError.mock.calls[0]!.join(' ');
      expect(output).toContain('something suspicious');
    });
  });

  describe('machine output mode (--json)', () => {
    it('routes info/success/dim to console.error and keeps raw on console.log', () => {
      setMachineOutput(true);
      logger.info('i');
      logger.success('s');
      logger.dim('d');
      logger.warn('w');
      expect(mockConsoleError).toHaveBeenCalledTimes(4);
      logger.raw({ ok: true });
      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
      expect(JSON.parse(mockConsoleLog.mock.calls[0]![0])).toEqual({ ok: true });
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
