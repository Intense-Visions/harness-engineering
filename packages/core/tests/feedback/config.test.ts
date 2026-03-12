import { describe, it, expect, beforeEach } from 'vitest';
import {
  configureFeedback,
  getFeedbackConfig,
  resetFeedbackConfig,
} from '../../src/feedback/config';

describe('Feedback Config', () => {
  beforeEach(() => {
    resetFeedbackConfig();
  });

  it('should have default configuration', () => {
    const config = getFeedbackConfig();
    expect(config.emitEvents).toBe(true);
    expect(config.defaultTimeout).toBe(300000);
    expect(config.telemetry).toBeDefined();
    expect(config.executor).toBeDefined();
    expect(config.sinks).toBeDefined();
    expect(config.sinks!.length).toBeGreaterThan(0);
  });

  it('should allow partial configuration updates', () => {
    configureFeedback({ defaultTimeout: 60000 });
    const config = getFeedbackConfig();
    expect(config.defaultTimeout).toBe(60000);
    expect(config.emitEvents).toBe(true); // unchanged
  });

  it('should reset to defaults', () => {
    configureFeedback({ defaultTimeout: 60000 });
    resetFeedbackConfig();
    const config = getFeedbackConfig();
    expect(config.defaultTimeout).toBe(300000);
  });

  it('should return frozen config object', () => {
    const config = getFeedbackConfig();
    expect(Object.isFrozen(config)).toBe(true);
  });
});
