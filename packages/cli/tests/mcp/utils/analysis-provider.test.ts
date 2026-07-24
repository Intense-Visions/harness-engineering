import { describe, it, expect, afterEach } from 'vitest';
import { resolveAnalysisProvider } from '../../../src/mcp/utils/analysis-provider.js';

/**
 * The eval MCP tools (acceptance_eval / outcome_eval) were Anthropic-only, so a
 * fully-local run (no ANTHROPIC_API_KEY) got no judge and degraded to advisory.
 * The shared resolver now falls back to a local /v1 endpoint so the reasoner can
 * serve verdicts on-device. These tests pin the selection precedence.
 */
const ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'HARNESS_ANALYSIS_BASE_URL',
  'HARNESS_ANALYSIS_MODEL',
  'HARNESS_ANALYSIS_API_KEY',
] as const;

function providerName(p: unknown): string | undefined {
  if (p === null || typeof p !== 'object') return undefined;
  return (p as { constructor?: { name?: string } }).constructor?.name;
}

describe('resolveAnalysisProvider — provider selection precedence', () => {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  const clear = () => ENV_KEYS.forEach((k) => delete process.env[k]);

  afterEach(() => {
    for (const k of ENV_KEYS) {
      const v = saved[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('returns null (degrade) when neither a cloud key nor a local endpoint is configured', async () => {
    clear();
    expect(await resolveAnalysisProvider()).toBeNull();
  });

  it('uses the Anthropic provider when ANTHROPIC_API_KEY is set', async () => {
    clear();
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    expect(providerName(await resolveAnalysisProvider('claude-x'))).toBe(
      'AnthropicAnalysisProvider'
    );
  });

  it('uses a local OpenAI-compatible provider when HARNESS_ANALYSIS_BASE_URL is set and no cloud key', async () => {
    clear();
    process.env.HARNESS_ANALYSIS_BASE_URL = 'http://127.0.0.1:11434/v1';
    process.env.HARNESS_ANALYSIS_MODEL = 'qwen3.6:27b';
    expect(providerName(await resolveAnalysisProvider())).toBe('OpenAICompatibleAnalysisProvider');
  });

  it('prefers Anthropic over the local endpoint when both are configured (backward compatible)', async () => {
    clear();
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.HARNESS_ANALYSIS_BASE_URL = 'http://127.0.0.1:11434/v1';
    expect(providerName(await resolveAnalysisProvider())).toBe('AnthropicAnalysisProvider');
  });

  it('treats a blank/whitespace local endpoint as unset (degrade, never throws)', async () => {
    clear();
    process.env.HARNESS_ANALYSIS_BASE_URL = '   ';
    expect(await resolveAnalysisProvider()).toBeNull();
  });
});
