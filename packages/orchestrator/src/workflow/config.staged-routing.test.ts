import { describe, it, expect } from 'vitest';
import type { WorkflowConfig } from '@harness-engineering/types';
import { validateWorkflowConfig, getDefaultConfig } from './config';

/**
 * SC4′: a `StagedWorkflowDecl` stage that declares `cognitiveMode: X` with NO
 * `routing.modes.X` entry (and no `routing.skills.<skill>` fallback) fails
 * `validateWorkflowConfig` with a clear error naming the stage skill, the
 * unmapped mode, and `routing.modes`. A stage whose mode IS mapped stays valid.
 */
function baseConfigWith(stageCognitiveMode: string): WorkflowConfig {
  const base = getDefaultConfig();
  const caps = {
    tier: 'strong' as const,
    costPer1kTokens: 1,
    privacyClass: 'on-device' as const,
    contextWindow: 32000,
  };
  const agent = {
    ...base.agent,
    backends: {
      reasoner: {
        type: 'ollama',
        endpoint: 'http://localhost:11434',
        model: ['qwen3:32b'],
        capabilities: caps,
      },
      coder: {
        type: 'ollama',
        endpoint: 'http://localhost:11434',
        model: ['qwen3-coder:30b'],
        capabilities: caps,
      },
    },
    routing: {
      default: 'coder',
      modes: { thinking: 'reasoner' },
    },
  };
  delete (agent as { backend?: unknown }).backend;
  return {
    ...base,
    agent,
    workflows: [
      {
        name: 'local-full-workflow',
        match: { identifierPrefix: 'LOCAL-' },
        stages: [
          { skill: 'harness-brainstorming', cognitiveMode: stageCognitiveMode, produces: 'spec' },
          { skill: 'harness-execution', produces: 'impl' },
        ],
      },
    ],
  } as unknown as WorkflowConfig;
}

describe('validateWorkflowConfig — staged-decl cognitiveMode routing coverage (SC4′)', () => {
  it('Test A: a mapped cognitiveMode (thinking → routing.modes.thinking) validates ok', () => {
    const r = validateWorkflowConfig(baseConfigWith('thinking'));
    expect(r.ok).toBe(true);
  });

  it('Test B: an unmapped cognitiveMode (no routing.modes/skills) fails with a clear error', () => {
    const r = validateWorkflowConfig(baseConfigWith('reasoning'));
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected Err');
    const msg = r.error.message;
    expect(msg).toContain('harness-brainstorming'); // names the stage skill
    expect(msg).toContain('reasoning'); // names the unmapped cognitiveMode
    expect(msg).toContain('routing.modes'); // mentions the missing mapping surface
  });
});
