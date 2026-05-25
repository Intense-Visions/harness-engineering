import { describe, expect, it } from 'vitest';
import { OrchestratorBackendFactory } from '../../src/agent/orchestrator-backend-factory';
import { buildRoutingUseCase } from '../../src/agent/use-case-builder';
import type { BackendDef, Issue, RoutingConfig } from '@harness-engineering/types';

/**
 * Spec B Phase 3 success criteria — dispatch-site wiring.
 *
 * These tests pin F1, F2, F4, and F11 end-to-end through the
 * `OrchestratorBackendFactory` (which composes `BackendRouter` and the
 * Phase 3 `buildRoutingUseCase` helper). They do NOT instantiate a
 * full `Orchestrator` — that requires too many file-system fixtures
 * for this acceptance layer. Phase-3 wiring `Orchestrator.dispatchIssue`
 * → `buildRoutingUseCase` → `BackendRouter.resolve` is exercised
 * directly via the factory + builder boundary, which is the smallest
 * unit that proves the contract.
 */

const backends: Record<string, BackendDef> = {
  'local-fast': { type: 'local', endpoint: 'http://localhost:1234/v1', model: 'qwen3:8b' },
  'claude-opus': { type: 'anthropic', model: 'claude-opus-4-7' },
  'claude-sonnet': { type: 'anthropic', model: 'claude-sonnet-4-6' },
};

function factory(routing: RoutingConfig): OrchestratorBackendFactory {
  return new OrchestratorBackendFactory({
    backends,
    routing,
    sandboxPolicy: 'none',
  });
}

const issue: Issue = {
  id: 'i-1',
  identifier: 'i-1',
  title: 'fix: small bug',
  description: null,
  priority: null,
  state: 'planned',
  branchName: null,
  url: null,
  labels: [],
  blockedBy: [],
  spec: null,
  plans: [],
  createdAt: '2026-05-25T00:00:00Z',
  updatedAt: '2026-05-25T00:00:00Z',
  externalId: null,
};

describe('Spec B Phase 3 success criteria — dispatch-site wiring', () => {
  it('F1: per-skill routing wins over tier when the skill is configured', () => {
    const f = factory({
      default: 'claude-opus',
      skills: { 'harness-debugging': 'local-fast' },
    });
    expect(f.resolveName({ kind: 'skill', skillName: 'harness-debugging' })).toBe('local-fast');
  });

  it('F2: per-mode routing fires for kind:skill with cognitiveMode and no per-skill override', () => {
    const f = factory({
      default: 'claude-opus',
      modes: { 'adversarial-reviewer': 'local-fast' },
    });
    expect(
      f.resolveName({
        kind: 'skill',
        skillName: 'harness-soundness-review',
        cognitiveMode: 'adversarial-reviewer',
      })
    ).toBe('local-fast');
  });

  it('F4: invocationOverride beats per-skill, per-mode, per-tier, and default', () => {
    const f = factory({
      default: 'claude-opus',
      skills: { 'harness-soundness-review': 'local-fast' },
      modes: { 'adversarial-reviewer': 'local-fast' },
    });
    expect(
      f.resolveName(
        {
          kind: 'skill',
          skillName: 'harness-soundness-review',
          cognitiveMode: 'adversarial-reviewer',
        },
        { invocationOverride: 'claude-sonnet' }
      )
    ).toBe('claude-sonnet');
  });

  it('F11: skill without cognitive_mode and without per-skill entry falls through to tier/default', () => {
    const useCase = buildRoutingUseCase(issue, undefined, []);
    expect(useCase.kind).toBe('tier');
    const f = factory({ default: 'claude-opus' });
    expect(f.resolveName(useCase)).toBe('claude-opus');
  });

  it('F11 (catalog non-empty, skill cataloged but no per-skill route): still falls through', () => {
    // 'fix: small bug' title with no diff signals triggers triage's
    // "default → code-review" branch (the small-fix branch requires
    // changedFileCount to be set). With harness-code-review cataloged
    // (no cognitive_mode), the use case carries the skill name but
    // routing.skills is empty → falls through to default.
    const useCase = buildRoutingUseCase(issue, undefined, [{ name: 'harness-code-review' }]);
    expect(useCase).toEqual({ kind: 'skill', skillName: 'harness-code-review' });
    const f = factory({ default: 'claude-opus' });
    // no routing.skills / routing.modes → falls through to default
    expect(f.resolveName(useCase)).toBe('claude-opus');
  });
});
