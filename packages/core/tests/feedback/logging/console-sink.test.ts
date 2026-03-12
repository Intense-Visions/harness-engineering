import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConsoleSink } from '../../../src/feedback/logging/console-sink';
import type { AgentAction } from '../../../src/feedback/types';

describe('ConsoleSink', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  const testAction: AgentAction = {
    id: 'test-id',
    type: 'self-review',
    timestamp: '2026-03-12T10:00:00.000Z',
    status: 'completed',
    duration: 150,
    context: { trigger: 'manual' },
    result: { outcome: 'success', summary: 'All checks passed' },
  };

  it('should have name "console"', () => {
    const sink = new ConsoleSink();
    expect(sink.name).toBe('console');
  });

  describe('format: pretty', () => {
    it('should format completed action with checkmark', async () => {
      const sink = new ConsoleSink({ format: 'pretty' });
      await sink.write(testAction);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain('✓');
      expect(output).toContain('self-review');
      expect(output).toContain('150ms');
    });

    it('should format failed action with X', async () => {
      const sink = new ConsoleSink({ format: 'pretty' });
      await sink.write({ ...testAction, status: 'failed' });

      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain('✗');
    });

    it('should format started action with arrow', async () => {
      const sink = new ConsoleSink({ format: 'pretty' });
      await sink.write({ ...testAction, status: 'started', duration: undefined });

      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain('→');
    });
  });

  describe('format: json', () => {
    it('should output JSON', async () => {
      const sink = new ConsoleSink({ format: 'json' });
      await sink.write(testAction);

      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.id).toBe('test-id');
      expect(parsed.type).toBe('self-review');
    });
  });

  it('should return Ok result', async () => {
    const sink = new ConsoleSink();
    const result = await sink.write(testAction);
    expect(result.ok).toBe(true);
  });
});
