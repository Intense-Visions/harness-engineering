import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AgentActionEmitter,
  logAgentAction,
  trackAction,
  getActionEmitter,
} from '../../../src/feedback/logging/emitter';
import { resetFeedbackConfig, configureFeedback } from '../../../src/feedback/config';
import { NoOpSink } from '../../../src/feedback/logging/sink';

describe('AgentActionEmitter', () => {
  let emitter: AgentActionEmitter;

  beforeEach(() => {
    emitter = new AgentActionEmitter();
  });

  describe('on() / emit()', () => {
    it('should call handler when event is emitted', () => {
      const handler = vi.fn();
      emitter.on('action:completed', handler);

      const event = {
        type: 'action:completed' as const,
        action: {
          id: 'test',
          type: 'self-review' as const,
          timestamp: new Date().toISOString(),
          status: 'completed' as const,
          context: { trigger: 'manual' as const },
        },
        timestamp: new Date().toISOString(),
      };

      emitter.emit(event);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should support wildcard listener', () => {
      const handler = vi.fn();
      emitter.on('action:*', handler);

      emitter.emit({
        type: 'action:started',
        action: {
          id: 'test',
          type: 'self-review',
          timestamp: new Date().toISOString(),
          status: 'started',
          context: { trigger: 'manual' },
        },
        timestamp: new Date().toISOString(),
      });

      emitter.emit({
        type: 'action:completed',
        action: {
          id: 'test',
          type: 'self-review',
          timestamp: new Date().toISOString(),
          status: 'completed',
          context: { trigger: 'manual' },
        },
        timestamp: new Date().toISOString(),
      });

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should return unsubscribe function', () => {
      const handler = vi.fn();
      const unsubscribe = emitter.on('action:completed', handler);

      unsubscribe();

      emitter.emit({
        type: 'action:completed',
        action: {
          id: 'test',
          type: 'self-review',
          timestamp: new Date().toISOString(),
          status: 'completed',
          context: { trigger: 'manual' },
        },
        timestamp: new Date().toISOString(),
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('once()', () => {
    it('should only call handler once', () => {
      const handler = vi.fn();
      emitter.once('action:completed', handler);

      const event = {
        type: 'action:completed' as const,
        action: {
          id: 'test',
          type: 'self-review' as const,
          timestamp: new Date().toISOString(),
          status: 'completed' as const,
          context: { trigger: 'manual' as const },
        },
        timestamp: new Date().toISOString(),
      };

      emitter.emit(event);
      emitter.emit(event);

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('listenerCount()', () => {
    it('should return correct count', () => {
      emitter.on('action:completed', () => {});
      emitter.on('action:completed', () => {});
      emitter.on('action:failed', () => {});

      expect(emitter.listenerCount('action:completed')).toBe(2);
      expect(emitter.listenerCount('action:failed')).toBe(1);
      expect(emitter.listenerCount('action:started')).toBe(0);
    });
  });

  describe('removeAllListeners()', () => {
    it('should remove all listeners', () => {
      emitter.on('action:completed', () => {});
      emitter.on('action:failed', () => {});

      emitter.removeAllListeners();

      expect(emitter.listenerCount('action:completed')).toBe(0);
      expect(emitter.listenerCount('action:failed')).toBe(0);
    });
  });
});

describe('logAgentAction()', () => {
  beforeEach(() => {
    resetFeedbackConfig();
    configureFeedback({ sinks: [new NoOpSink()] });
  });

  it('should create action with id and timestamp', async () => {
    const result = await logAgentAction({
      type: 'self-review',
      status: 'completed',
      context: { trigger: 'manual' },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBeDefined();
      expect(result.value.timestamp).toBeDefined();
    }
  });
});

describe('trackAction()', () => {
  beforeEach(() => {
    resetFeedbackConfig();
    configureFeedback({ sinks: [new NoOpSink()] });
  });

  it('should track action lifecycle', async () => {
    const tracker = trackAction('self-review', { trigger: 'ci' });

    expect(tracker.action.status).toBe('started');

    const result = await tracker.complete({
      outcome: 'success',
      summary: 'All checks passed',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('completed');
      expect(result.value.duration).toBeDefined();
    }
  });

  it('should track failures', async () => {
    const tracker = trackAction('self-review', { trigger: 'manual' });

    const result = await tracker.fail({
      code: 'REVIEW_ERROR',
      message: 'Something went wrong',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('failed');
      expect(result.value.error?.code).toBe('REVIEW_ERROR');
    }
  });
});
