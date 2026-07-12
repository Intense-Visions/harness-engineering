import { describe, it, expect } from 'vitest';
import { RoutingError } from '../src/orchestrator';

describe('RoutingError', () => {
  it('carries the privacy-no-match code and message', () => {
    const err = new RoutingError('privacy-no-match', 'no compliant backend');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(RoutingError);
    expect(err.code).toBe('privacy-no-match');
    expect(err.message).toBe('no compliant backend');
    expect(err.name).toBe('RoutingError');
  });

  it('carries the escalation-exhausted code and message', () => {
    const err = new RoutingError('escalation-exhausted', 'strong tier re-crossed threshold');
    expect(err.code).toBe('escalation-exhausted');
    expect(err.message).toBe('strong tier re-crossed threshold');
    expect(err.name).toBe('RoutingError');
  });

  it('is throwable and catchable/narrowable by code', () => {
    try {
      throw new RoutingError('privacy-no-match', 'boom');
    } catch (e) {
      expect(e).toBeInstanceOf(RoutingError);
      expect((e as RoutingError).code).toBe('privacy-no-match');
    }
  });
});
