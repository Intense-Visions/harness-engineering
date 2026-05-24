import { describe, it, expect } from 'vitest';
import type { BackendDef, RoutingConfig, RoutingUseCase } from '@harness-engineering/types';
import { BackendRouter, toArray } from '../../src/agent/backend-router.js';

const cloud: BackendDef = { type: 'claude', command: 'claude' };
const local: BackendDef = {
  type: 'pi',
  endpoint: 'http://pi.local:1234/v1',
  model: ['gemma-4-e4b'],
};
const fast: BackendDef = {
  type: 'pi',
  endpoint: 'http://localhost:1234/v1',
  model: ['qwen3:8b'],
};

describe('toArray normalizer (Phase 1)', () => {
  it('wraps a scalar in a single-element array', () => {
    expect(toArray('cloud')).toEqual(['cloud']);
  });

  it('returns a chain unchanged', () => {
    expect(toArray(['local', 'cloud'])).toEqual(['local', 'cloud']);
  });
});

describe('BackendRouter.resolve — return shape (Phase 1)', () => {
  it('returns a RoutingDecision with backendName, useCase, resolutionPath, timestamp, durationMs, backendType', () => {
    const routing: RoutingConfig = { default: 'cloud' };
    const router = new BackendRouter({ backends: { cloud }, routing });
    const decision = router.resolve({ kind: 'tier', tier: 'quick-fix' });
    expect(decision.backendName).toBe('cloud');
    expect(decision.backendType).toBe('claude');
    expect(decision.useCase).toEqual({ kind: 'tier', tier: 'quick-fix' });
    expect(decision.resolutionPath.length).toBeGreaterThan(0);
    expect(typeof decision.timestamp).toBe('string');
    expect(decision.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof decision.durationMs).toBe('number');
    expect(decision.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('BackendRouter.resolve — invocation override (D7)', () => {
  it('picks invocationOverride when backend exists', () => {
    const routing: RoutingConfig = { default: 'cloud' };
    const router = new BackendRouter({ backends: { cloud, local }, routing });
    const decision = router.resolve(
      { kind: 'tier', tier: 'guided-change' },
      { invocationOverride: 'local' }
    );
    expect(decision.backendName).toBe('local');
    expect(decision.resolutionPath[0]).toEqual({
      source: 'invocation',
      candidate: 'local',
      outcome: 'chosen',
    });
    expect(decision.resolutionPath).toHaveLength(1);
  });

  it('records unknown-backend for invocation override and falls through', () => {
    const routing: RoutingConfig = { default: 'cloud' };
    const router = new BackendRouter({ backends: { cloud }, routing });
    const decision = router.resolve(
      { kind: 'tier', tier: 'quick-fix' },
      { invocationOverride: 'ghost' }
    );
    expect(decision.backendName).toBe('cloud');
    const invocationStep = decision.resolutionPath.find((s) => s.source === 'invocation');
    expect(invocationStep).toEqual({
      source: 'invocation',
      candidate: 'ghost',
      outcome: 'unknown-backend',
    });
  });
});

describe('BackendRouter.resolve — per-skill (D1)', () => {
  it('picks routing.skills[skillName] for kind: skill', () => {
    const routing: RoutingConfig = {
      default: 'cloud',
      skills: { 'harness-debugging': 'local' },
    };
    const router = new BackendRouter({ backends: { cloud, local }, routing });
    const decision = router.resolve({
      kind: 'skill',
      skillName: 'harness-debugging',
    });
    expect(decision.backendName).toBe('local');
    expect(
      decision.resolutionPath.some((s) => s.source === 'skill' && s.outcome === 'chosen')
    ).toBe(true);
  });

  it('walks a per-skill chain entry by entry', () => {
    const routing: RoutingConfig = {
      default: 'cloud',
      skills: { 'harness-debugging': ['fast', 'local'] as const },
    };
    const router = new BackendRouter({ backends: { cloud, local, fast }, routing });
    const decision = router.resolve({
      kind: 'skill',
      skillName: 'harness-debugging',
    });
    expect(decision.backendName).toBe('fast');
  });

  it('skips unknown chain entries and continues', () => {
    // Construct with a "ghost" backend present (passes validateReferences),
    // then remove it from the backends map to exercise the runtime
    // unknown-backend skip path. Same pattern as the S4 exhaustion test:
    // validateReferences pins static-config typos; this test pins the
    // dynamic-backend-removed contract Phase 1's chain walk promises.
    const routing: RoutingConfig = {
      default: 'cloud',
      skills: { 'harness-debugging': ['ghost', 'local'] as const },
    };
    const ghost: BackendDef = { type: 'claude', command: 'claude' };
    const router = new BackendRouter({
      backends: { cloud, local, ghost },
      routing,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (router as any).backends.ghost;
    const decision = router.resolve({
      kind: 'skill',
      skillName: 'harness-debugging',
    });
    expect(decision.backendName).toBe('local');
    const path = decision.resolutionPath;
    expect(path.find((s) => s.candidate === 'ghost')).toEqual({
      source: 'skill',
      candidate: 'ghost',
      outcome: 'unknown-backend',
    });
    expect(path.find((s) => s.candidate === 'local')).toEqual({
      source: 'skill',
      candidate: 'local',
      outcome: 'chosen',
    });
  });

  it('falls through to mode when skill chain produces no available backend', () => {
    const routing: RoutingConfig = {
      default: 'cloud',
      skills: { 'harness-debugging': ['ghost'] as const },
      modes: { 'adversarial-reviewer': 'local' },
    };
    const ghost: BackendDef = { type: 'claude', command: 'claude' };
    const router = new BackendRouter({
      backends: { cloud, local, ghost },
      routing,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (router as any).backends.ghost;
    const decision = router.resolve({
      kind: 'skill',
      skillName: 'harness-debugging',
      cognitiveMode: 'adversarial-reviewer',
    });
    expect(decision.backendName).toBe('local');
    expect(
      decision.resolutionPath.find((s) => s.source === 'mode' && s.outcome === 'chosen')
    ).toBeDefined();
  });
});

describe('BackendRouter.resolve — per-mode (D1)', () => {
  it('picks routing.modes[cognitiveMode] for kind: mode', () => {
    const routing: RoutingConfig = {
      default: 'cloud',
      modes: { 'adversarial-reviewer': 'local' },
    };
    const router = new BackendRouter({ backends: { cloud, local }, routing });
    const decision = router.resolve({
      kind: 'mode',
      cognitiveMode: 'adversarial-reviewer',
    });
    expect(decision.backendName).toBe('local');
  });

  it('picks routing.modes[cognitiveMode] for kind: skill that carries cognitiveMode', () => {
    const routing: RoutingConfig = {
      default: 'cloud',
      modes: { 'adversarial-reviewer': 'local' },
    };
    const router = new BackendRouter({ backends: { cloud, local }, routing });
    const decision = router.resolve({
      kind: 'skill',
      skillName: 'harness-soundness-review',
      cognitiveMode: 'adversarial-reviewer',
    });
    expect(decision.backendName).toBe('local');
  });
});

describe('BackendRouter.resolve — resolution order (D2, F3)', () => {
  it('per-skill wins over per-mode for the same skill', () => {
    const routing: RoutingConfig = {
      default: 'cloud',
      skills: { 'harness-debugging': 'fast' },
      modes: { 'diagnostic-investigator': 'local' },
    };
    const router = new BackendRouter({
      backends: { cloud, local, fast },
      routing,
    });
    const decision = router.resolve({
      kind: 'skill',
      skillName: 'harness-debugging',
      cognitiveMode: 'diagnostic-investigator',
    });
    expect(decision.backendName).toBe('fast');
  });

  it('invocation override beats per-skill', () => {
    const routing: RoutingConfig = {
      default: 'cloud',
      skills: { 'harness-debugging': 'local' },
    };
    const router = new BackendRouter({
      backends: { cloud, local, fast },
      routing,
    });
    const decision = router.resolve(
      { kind: 'skill', skillName: 'harness-debugging' },
      { invocationOverride: 'fast' }
    );
    expect(decision.backendName).toBe('fast');
  });

  it('falls through skill -> mode -> tier -> default', () => {
    const routing: RoutingConfig = {
      default: 'cloud',
      'quick-fix': 'local',
    };
    const router = new BackendRouter({ backends: { cloud, local }, routing });
    const decision = router.resolve({
      kind: 'skill',
      skillName: 'harness-debugging',
      cognitiveMode: 'unmapped-mode',
    });
    // skills map absent, modes map absent, no per-skill kind in tier resolution
    // -> falls through to default
    expect(decision.backendName).toBe('cloud');
  });
});

describe('BackendRouter.resolve — scalar/chain equivalence (F5, F6)', () => {
  it('scalar routing.default behaves identically to single-element-chain', () => {
    const scalar = new BackendRouter({
      backends: { cloud },
      routing: { default: 'cloud' },
    });
    const chain = new BackendRouter({
      backends: { cloud },
      routing: { default: ['cloud'] as const },
    });
    const u: RoutingUseCase = { kind: 'maintenance' };
    expect(scalar.resolve(u).backendName).toBe(chain.resolve(u).backendName);
  });

  it('multi-entry chain picks the first existing backend', () => {
    const routing: RoutingConfig = {
      default: 'cloud',
      'quick-fix': ['ghost', 'local', 'cloud'] as const,
    };
    const ghost: BackendDef = { type: 'claude', command: 'claude' };
    const router = new BackendRouter({
      backends: { cloud, local, ghost },
      routing,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (router as any).backends.ghost;
    const decision = router.resolve({ kind: 'tier', tier: 'quick-fix' });
    expect(decision.backendName).toBe('local');
    // The 'ghost' entry must be recorded as unknown-backend
    expect(decision.resolutionPath.find((s) => s.candidate === 'ghost')?.outcome).toBe(
      'unknown-backend'
    );
  });
});

describe('BackendRouter.resolve — exhaustion (S4)', () => {
  it('throws when every chain entry across all sources is unknown', () => {
    // Note: validateReferences() catches static-config typos, so to
    // exercise the runtime throw we construct a router whose default
    // exists at construction time but is removed before resolve()
    // (simulating a future dynamic-backends feature). For this Phase 1
    // test, we exercise the throw via a stripped backends map.
    const router = new BackendRouter({
      backends: { cloud },
      routing: { default: 'cloud' },
    });
    // Reach in to simulate runtime backend removal; this is the only
    // way to exercise the throw path without bypassing
    // validateReferences().
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (router as any).backends = {};
    expect(() => router.resolve({ kind: 'maintenance' })).toThrowError(
      /routing\.default produced no available backend/
    );
  });
});

describe('BackendRouter.resolve — resolution path fidelity (S7)', () => {
  it('records every chain entry considered with the correct source label', () => {
    const routing: RoutingConfig = {
      default: 'cloud',
      skills: { 'harness-debugging': ['ghost1', 'ghost2'] as const },
      modes: { 'adversarial-reviewer': ['ghost3', 'fast'] as const },
    };
    const ghost: BackendDef = { type: 'claude', command: 'claude' };
    const router = new BackendRouter({
      backends: { cloud, fast, ghost1: ghost, ghost2: ghost, ghost3: ghost },
      routing,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (router as any).backends.ghost1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (router as any).backends.ghost2;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (router as any).backends.ghost3;
    const decision = router.resolve({
      kind: 'skill',
      skillName: 'harness-debugging',
      cognitiveMode: 'adversarial-reviewer',
    });
    expect(decision.backendName).toBe('fast');
    const candidates = decision.resolutionPath.map((s) => ({
      src: s.source,
      cand: s.candidate,
      out: s.outcome,
    }));
    expect(candidates).toEqual([
      { src: 'skill', cand: 'ghost1', out: 'unknown-backend' },
      { src: 'skill', cand: 'ghost2', out: 'unknown-backend' },
      { src: 'mode', cand: 'ghost3', out: 'unknown-backend' },
      { src: 'mode', cand: 'fast', out: 'chosen' },
    ]);
  });
});

describe('BackendRouter.resolveDefinition — API surface preserved (N1)', () => {
  it('still returns the BackendDef reference, identity-equal to backends entry', () => {
    const routing: RoutingConfig = { default: 'cloud', 'quick-fix': 'local' };
    const backends = { cloud, local };
    const router = new BackendRouter({ backends, routing });
    expect(router.resolveDefinition({ kind: 'tier', tier: 'quick-fix' })).toBe(backends.local);
  });

  it('accepts opts.invocationOverride pass-through', () => {
    const routing: RoutingConfig = { default: 'cloud' };
    const backends = { cloud, local };
    const router = new BackendRouter({ backends, routing });
    expect(
      router.resolveDefinition({ kind: 'tier', tier: 'quick-fix' }, { invocationOverride: 'local' })
    ).toBe(backends.local);
  });
});
