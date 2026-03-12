import { describe, it, expect } from 'vitest';
import { NoOpTelemetryAdapter } from '../../../src/feedback/telemetry/noop';

describe('NoOpTelemetryAdapter', () => {
  const adapter = new NoOpTelemetryAdapter();

  it('should have name "noop"', () => {
    expect(adapter.name).toBe('noop');
  });

  describe('health()', () => {
    it('should return available: true', async () => {
      const result = await adapter.health();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.available).toBe(true);
        expect(result.value.message).toContain('NoOp');
      }
    });
  });

  describe('getMetrics()', () => {
    it('should return empty array', async () => {
      const result = await adapter.getMetrics('test-service', {
        start: new Date(),
        end: new Date(),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('getTraces()', () => {
    it('should return empty array', async () => {
      const result = await adapter.getTraces('test-service', {
        start: new Date(),
        end: new Date(),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('getLogs()', () => {
    it('should return empty array', async () => {
      const result = await adapter.getLogs('test-service', {
        start: new Date(),
        end: new Date(),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it('should accept filter parameter', async () => {
      const result = await adapter.getLogs(
        'test-service',
        { start: new Date(), end: new Date() },
        { level: 'error', limit: 10 }
      );
      expect(result.ok).toBe(true);
    });
  });
});
