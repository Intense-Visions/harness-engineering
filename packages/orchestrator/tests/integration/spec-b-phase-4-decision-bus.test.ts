import { describe, expect, it, vi } from 'vitest';
import { OrchestratorBackendFactory } from '../../src/agent/orchestrator-backend-factory';
import { RoutingDecisionBus } from '../../src/routing/decision-bus';
import { StructuredLogger } from '../../src/logging/logger';
import type { BackendDef, RoutingConfig } from '@harness-engineering/types';

/**
 * Spec B Phase 4 acceptance — RoutingDecisionBus + event emission.
 *
 * These tests pin the Phase 4 observable contracts (O1, S5, S6) and the
 * single-resolve invariant introduced by `BackendRouter.resolveDecisionAndDef`.
 * They exercise the `OrchestratorBackendFactory` + `RoutingDecisionBus` pair
 * directly — the smallest unit that proves the integration boundary —
 * matching the Phase 3 acceptance pattern (factory + builder, no full
 * `Orchestrator`). Full-Orchestrator wiring is covered by the agent-tier
 * tests + `orchestrator-local-resolver.test.ts`.
 */

const backends: Record<string, BackendDef> = {
  cloud: { type: 'claude', command: 'claude' },
  local: { type: 'pi', endpoint: 'http://localhost:1234/v1', model: 'qwen3:8b' },
};

const routing: RoutingConfig = {
  default: 'cloud',
  skills: { 'harness-debugging': 'local' },
};

function makeFactoryWithBus(opts?: { capacity?: number; logger?: StructuredLogger }): {
  factory: OrchestratorBackendFactory;
  bus: RoutingDecisionBus;
} {
  const bus = new RoutingDecisionBus({
    capacity: opts?.capacity ?? 500,
    ...(opts?.logger !== undefined ? { logger: opts.logger } : {}),
  });
  const factory = new OrchestratorBackendFactory({
    backends,
    routing,
    sandboxPolicy: 'none',
    decisionBus: bus,
  });
  return { factory, bus };
}

describe('Spec B Phase 4: RoutingDecisionBus + event emission', () => {
  it('O1: bus emits structured routing-decision log line when BackendRouter.resolve is called', () => {
    const logger = new StructuredLogger();
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    const { factory, bus } = makeFactoryWithBus({ logger });
    factory.resolveName({ kind: 'tier', tier: 'quick-fix' });
    expect(infoSpy).toHaveBeenCalledWith(
      'routing-decision',
      expect.objectContaining({
        backendName: expect.any(String),
        resolutionPathLength: expect.any(Number),
        durationMs: expect.any(Number),
        useCase: expect.objectContaining({ kind: 'tier' }),
      })
    );
    expect(bus.recent()).toHaveLength(1);
  });

  it('S5: capacity bound — emitting > capacity drops oldest', () => {
    const { factory, bus } = makeFactoryWithBus({ capacity: 50 });
    for (let i = 0; i < 200; i++) {
      factory.resolveName({ kind: 'tier', tier: 'quick-fix' });
    }
    expect(bus.recent({ limit: 99_999 }).length).toBeLessThanOrEqual(50);
  });

  it('S6: subscriber errors do not propagate', () => {
    const logger = new StructuredLogger();
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    const { factory, bus } = makeFactoryWithBus({ logger });
    bus.subscribe(() => {
      throw new Error('subscriber boom');
    });
    expect(() => factory.resolveName({ kind: 'tier', tier: 'quick-fix' })).not.toThrow();
    expect(bus.recent()).toHaveLength(1);
  });

  it('Single-resolve invariant: forUseCase calls router.resolve exactly once', () => {
    const { factory } = makeFactoryWithBus();
    const router = factory.getRouter();
    const resolveSpy = vi.spyOn(router, 'resolve');
    factory.forUseCase({ kind: 'tier', tier: 'quick-fix' });
    expect(resolveSpy).toHaveBeenCalledTimes(1);
  });

  it('Single-resolve invariant: bus records exactly one decision per forUseCase dispatch', () => {
    const { factory, bus } = makeFactoryWithBus();
    factory.forUseCase({ kind: 'tier', tier: 'quick-fix' });
    factory.forUseCase({ kind: 'tier', tier: 'guided-change' });
    factory.forUseCase({ kind: 'skill', skillName: 'harness-debugging' });
    expect(bus.recent()).toHaveLength(3);
    // Pin that the most-recently emitted decision routed via 'skills' source
    // — proves per-skill routing still flows correctly through the
    // single-resolve seam. Phase 5 S1 fix: recent() is newest-first, so the
    // most recent emission lives at index [0] (was [2] under chronological).
    const last = bus.recent()[0];
    expect(last?.backendName).toBe('local');
    expect(last?.useCase).toMatchObject({ kind: 'skill', skillName: 'harness-debugging' });
  });
});
