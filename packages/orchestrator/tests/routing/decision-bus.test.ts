import { describe, it, expect, vi } from 'vitest';
import { RoutingDecisionBus } from '../../src/routing/decision-bus.js';
import type { RoutingDecision } from '@harness-engineering/types';
import { StructuredLogger } from '../../src/logging/logger.js';

function makeDecision(overrides?: Partial<RoutingDecision>): RoutingDecision {
  return {
    timestamp: new Date().toISOString(),
    useCase: { kind: 'tier', tier: 'quick-fix' },
    resolutionPath: [{ source: 'default', candidate: 'cloud', outcome: 'chosen' }],
    backendName: 'cloud',
    backendType: 'claude',
    durationMs: 0.1,
    ...overrides,
  };
}

describe('RoutingDecisionBus', () => {
  it('S5: respects capacity bound — 10000 emits → recent() ≤ capacity', () => {
    const bus = new RoutingDecisionBus({ capacity: 500 });
    for (let i = 0; i < 10_000; i++) {
      bus.emit(makeDecision({ backendName: `backend-${i}` }));
    }
    const recent = bus.recent({ limit: 99_999 });
    expect(recent.length).toBeLessThanOrEqual(500);
    // ring drops oldest: first surviving record is index 9500
    expect(recent[0]?.backendName).toBe('backend-9500');
    expect(recent[recent.length - 1]?.backendName).toBe('backend-9999');
  });

  it('S6: subscriber errors are isolated — other subscribers still receive', () => {
    const logger = new StructuredLogger();
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const bus = new RoutingDecisionBus({ capacity: 10, logger });
    const goodCalls: RoutingDecision[] = [];
    bus.subscribe(() => {
      throw new Error('subscriber boom');
    });
    bus.subscribe((d) => goodCalls.push(d));
    expect(() => bus.emit(makeDecision())).not.toThrow();
    expect(goodCalls).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('RoutingDecisionBus subscriber threw'),
      expect.objectContaining({ error: expect.stringContaining('subscriber boom') })
    );
  });

  it('O1: emits structured routing-decision log line per emit', () => {
    const logger = new StructuredLogger();
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    const bus = new RoutingDecisionBus({ capacity: 5, logger });
    bus.emit(
      makeDecision({
        backendName: 'cloud',
        durationMs: 1.23,
        resolutionPath: [{ source: 'skill', candidate: 'cloud', outcome: 'chosen' }],
      })
    );
    expect(infoSpy).toHaveBeenCalledWith(
      'routing-decision',
      expect.objectContaining({
        backendName: 'cloud',
        resolutionPathLength: 1,
        durationMs: 1.23,
        useCase: expect.objectContaining({ kind: 'tier' }),
      })
    );
  });

  it('recent() filters by skillName / mode / backendName / limit', () => {
    const bus = new RoutingDecisionBus({ capacity: 20 });
    bus.emit(
      makeDecision({
        useCase: { kind: 'skill', skillName: 'harness-debugging' },
        backendName: 'local-fast',
      })
    );
    bus.emit(
      makeDecision({
        useCase: { kind: 'mode', cognitiveMode: 'adversarial-reviewer' },
        backendName: 'cloud',
      })
    );
    bus.emit(makeDecision({ backendName: 'cloud' }));
    expect(bus.recent({ skillName: 'harness-debugging' })).toHaveLength(1);
    expect(bus.recent({ mode: 'adversarial-reviewer' })).toHaveLength(1);
    expect(bus.recent({ backendName: 'cloud' })).toHaveLength(2);
    expect(bus.recent({ limit: 2 })).toHaveLength(2);
  });

  it('subscribe() returns an unsubscribe function', () => {
    const bus = new RoutingDecisionBus({ capacity: 5 });
    const calls: RoutingDecision[] = [];
    const off = bus.subscribe((d) => calls.push(d));
    bus.emit(makeDecision());
    off();
    bus.emit(makeDecision());
    expect(calls).toHaveLength(1);
  });
});
