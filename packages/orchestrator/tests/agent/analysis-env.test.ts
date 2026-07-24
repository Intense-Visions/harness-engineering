import { describe, it, expect, afterEach } from 'vitest';
import type { WorkflowConfig } from '@harness-engineering/types';
import { deriveAnalysisEnv, applyAnalysisEnv } from '../../src/agent/analysis-env';

/**
 * The eval MCP tools read HARNESS_ANALYSIS_BASE_URL/_MODEL to run their judgment
 * on a local /v1 endpoint. The orchestrator derives those from the THINKING-mode
 * (reasoner) backend so the strong local model judges the coder's work.
 */
function config(agent: Record<string, unknown>): WorkflowConfig {
  return { agent } as unknown as WorkflowConfig;
}

const reasoner = {
  type: 'ollama',
  endpoint: 'http://127.0.0.1:11434/v1',
  model: ['qwen3.6:27b', 'qwen3:32b'],
};

describe('deriveAnalysisEnv', () => {
  it('resolves the thinking-mode backend endpoint + first model', () => {
    const env = deriveAnalysisEnv(
      config({ routing: { modes: { thinking: 'reasoner' } }, backends: { reasoner } })
    );
    expect(env).toEqual({
      HARNESS_ANALYSIS_BASE_URL: 'http://127.0.0.1:11434/v1',
      HARNESS_ANALYSIS_MODEL: 'qwen3.6:27b',
    });
  });

  it('accepts a scalar model and a prefer-list thinking value (uses the first name)', () => {
    const env = deriveAnalysisEnv(
      config({
        routing: { modes: { thinking: ['reasoner', 'other'] } },
        backends: { reasoner: { ...reasoner, model: 'qwen3.6:27b' } },
      })
    );
    expect(env?.HARNESS_ANALYSIS_MODEL).toBe('qwen3.6:27b');
  });

  it('returns null when there is no thinking mode', () => {
    expect(
      deriveAnalysisEnv(config({ routing: { modes: {} }, backends: { reasoner } }))
    ).toBeNull();
    expect(deriveAnalysisEnv(config({ backends: { reasoner } }))).toBeNull();
  });

  it('returns null when the thinking backend has no local endpoint (e.g. a cloud type)', () => {
    const env = deriveAnalysisEnv(
      config({
        routing: { modes: { thinking: 'primary' } },
        backends: { primary: { type: 'claude' } },
      })
    );
    expect(env).toBeNull();
  });

  it('omits the model when the backend declares none', () => {
    const env = deriveAnalysisEnv(
      config({
        routing: { modes: { thinking: 'r' } },
        backends: { r: { type: 'ollama', endpoint: 'http://x/v1' } },
      })
    );
    expect(env).toEqual({ HARNESS_ANALYSIS_BASE_URL: 'http://x/v1' });
  });
});

describe('applyAnalysisEnv — process.env side effect', () => {
  const saved = {
    base: process.env.HARNESS_ANALYSIS_BASE_URL,
    model: process.env.HARNESS_ANALYSIS_MODEL,
  };
  afterEach(() => {
    for (const [k, v] of [
      ['HARNESS_ANALYSIS_BASE_URL', saved.base],
      ['HARNESS_ANALYSIS_MODEL', saved.model],
    ] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('sets process.env from the reasoner when unset', () => {
    delete process.env.HARNESS_ANALYSIS_BASE_URL;
    delete process.env.HARNESS_ANALYSIS_MODEL;
    const applied = applyAnalysisEnv(
      config({ routing: { modes: { thinking: 'reasoner' } }, backends: { reasoner } })
    );
    expect(applied?.HARNESS_ANALYSIS_BASE_URL).toBe('http://127.0.0.1:11434/v1');
    expect(process.env.HARNESS_ANALYSIS_BASE_URL).toBe('http://127.0.0.1:11434/v1');
    expect(process.env.HARNESS_ANALYSIS_MODEL).toBe('qwen3.6:27b');
  });

  it('never overrides an explicit operator value (returns null, leaves env untouched)', () => {
    process.env.HARNESS_ANALYSIS_BASE_URL = 'http://operator/v1';
    const applied = applyAnalysisEnv(
      config({ routing: { modes: { thinking: 'reasoner' } }, backends: { reasoner } })
    );
    expect(applied).toBeNull();
    expect(process.env.HARNESS_ANALYSIS_BASE_URL).toBe('http://operator/v1');
  });
});
