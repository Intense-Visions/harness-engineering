import { describe, it, expect } from 'vitest';
import type { BackendDef, WorkflowStep } from '@harness-engineering/types';
import { resolveStageBackendFactory, isLocalBackendFactory } from './orchestrator-context';
import type { OrchestratorBackendFactory } from '../agent/orchestrator-backend-factory';

/**
 * Regression: a materialized backend's `.name` is a TYPE label ('ollama' / 'codex'),
 * NOT a routing key. `resolveStageBackend` must return the ROUTING NAME (via
 * `resolveName`) so that both `makeRunner` (re-materialize by name) and
 * `isLocalBackend` (look the name up in the config's backends map) resolve the
 * INTENDED backend. Returning the type label silently fell through to
 * `routing.default` (every design stage ran on the coder) AND made isLocalBackend
 * miss (wrong prompt template for every stage).
 */
const thinkingStep: WorkflowStep = {
  skill: 'harness-brainstorming',
  produces: 'spec',
  cognitiveMode: 'thinking',
} as WorkflowStep;

// A fake factory that models the real trap: resolveName yields the routing key
// 'reasoner', but forUseCase materializes a backend whose `.name` is the type label.
const fakeFactory = {
  resolveName: () => 'reasoner',
  forUseCase: () => ({ name: 'ollama' }), // type label — the bug's source
} as unknown as OrchestratorBackendFactory;

const backends: Record<string, BackendDef> = {
  reasoner: {
    type: 'ollama',
    endpoint: 'http://localhost:11434',
    model: ['qwen3.6:27b'],
  } as BackendDef,
  'codex-exec': { type: 'codex', model: ['qwen3-coder:30b'] } as unknown as BackendDef,
  primary: { type: 'claude' } as unknown as BackendDef,
};

describe('resolveStageBackendFactory — returns the routing key, not the type label', () => {
  it('resolves a thinking stage to its routing NAME (reasoner), not the backend type (ollama)', () => {
    const resolve = resolveStageBackendFactory(fakeFactory, 'codex-exec');
    expect(resolve(thinkingStep).name).toBe('reasoner');
    expect(resolve(thinkingStep).name).not.toBe('ollama');
  });

  it('legacy fallback (no factory) uses routing.default', () => {
    const resolve = resolveStageBackendFactory(null, 'codex-exec');
    expect(resolve(thinkingStep).name).toBe('codex-exec');
  });
});

describe('isLocalBackend agrees with resolveStageBackend on the name namespace', () => {
  const isLocal = isLocalBackendFactory(backends);
  const resolve = resolveStageBackendFactory(fakeFactory, 'codex-exec');

  it('the routing name resolveStageBackend returns IS resolvable in the backends map → local', () => {
    const backend = resolve(thinkingStep); // { name: 'reasoner' }
    expect(isLocal(backend)).toBe(true); // reasoner (ollama) is a local-endpoint backend
  });

  it('the OLD type-label name would MISS the backends map → wrongly non-local (the bug)', () => {
    // Demonstrates why the type label broke template selection: 'ollama' is not a
    // config backend NAME, so the def lookup returns undefined → non-local.
    expect(isLocal({ name: 'ollama' } as never)).toBe(false);
  });

  it('a codex-exec routing name also resolves → local (execution stage gets the skill-run template)', () => {
    expect(isLocal({ name: 'codex-exec' } as never)).toBe(true);
  });
});
