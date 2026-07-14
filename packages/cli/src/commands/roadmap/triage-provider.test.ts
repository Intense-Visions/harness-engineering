// packages/cli/src/commands/roadmap/triage-provider.test.ts
//
// MUST-FIX (Phase 2 review): the CLI brainstorm provider must resolve the FREE LOCAL model per
// config, NOT hardcode a paid Anthropic cloud model from ANTHROPIC_API_KEY. Anthropic is allowed
// ONLY as an explicit opt-in, and the fail-safe (no resolvable provider ⇒ null ⇒ halt to human)
// is preserved so nothing ever silently passes without a model.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  AnthropicAnalysisProvider,
  OpenAICompatibleAnalysisProvider,
} from '@harness-engineering/intelligence';
import { resolveTriageProvider, type TriageProviderConfig } from './triage-provider.js';

describe('resolveTriageProvider — free-local default', () => {
  const savedKey = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = savedKey;
  });

  it('resolves the LOCAL backend (OpenAI-compatible) — the free-local premise, no cloud billing', () => {
    const config: TriageProviderConfig = {
      agent: {
        backends: {
          local: { type: 'local', endpoint: 'http://localhost:11434/v1', model: 'qwen2.5-coder' },
        },
      },
    };
    const provider = resolveTriageProvider(config);
    expect(provider).toBeInstanceOf(OpenAICompatibleAnalysisProvider);
    expect(provider).not.toBeInstanceOf(AnthropicAnalysisProvider);
  });

  it('resolves a `pi` local backend the same way (OpenAI-compatible)', () => {
    const config: TriageProviderConfig = {
      agent: {
        backends: { pi: { type: 'pi', endpoint: 'http://localhost:8000/v1', model: ['m1', 'm2'] } },
      },
    };
    expect(resolveTriageProvider(config)).toBeInstanceOf(OpenAICompatibleAnalysisProvider);
  });

  it('does NOT silently fall back to Anthropic even when ANTHROPIC_API_KEY is present (the bug)', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-should-not-be-used';
    const config: TriageProviderConfig = {
      agent: {
        backends: { local: { type: 'local', endpoint: 'http://localhost:11434/v1', model: 'm' } },
      },
    };
    const provider = resolveTriageProvider(config);
    // The local backend wins; the presence of a cloud key must not silently hijack triage.
    expect(provider).toBeInstanceOf(OpenAICompatibleAnalysisProvider);
    expect(provider).not.toBeInstanceOf(AnthropicAnalysisProvider);
  });
});

describe('resolveTriageProvider — Anthropic only as an explicit opt-in', () => {
  const savedKey = process.env.ANTHROPIC_API_KEY;
  afterEach(() => {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = savedKey;
  });

  it('uses Anthropic ONLY when explicitly opted in via intelligence.provider', () => {
    const config: TriageProviderConfig = {
      intelligence: { provider: { kind: 'anthropic', apiKey: 'sk-ant-explicit' } },
    };
    expect(resolveTriageProvider(config)).toBeInstanceOf(AnthropicAnalysisProvider);
  });

  it('an explicit anthropic-type entry in agent.backends is a deliberate cloud choice', () => {
    const config: TriageProviderConfig = {
      agent: { backends: { cloud: { type: 'anthropic', model: 'claude-x', apiKey: 'sk-ant' } } },
    };
    expect(resolveTriageProvider(config)).toBeInstanceOf(AnthropicAnalysisProvider);
  });
});

describe('resolveTriageProvider — fail-safe (no resolvable provider ⇒ null)', () => {
  const savedKey = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = savedKey;
  });

  it('returns null when no config is provided (halt every item to a human)', () => {
    expect(resolveTriageProvider(undefined)).toBeNull();
  });

  it('returns null when agent.backends is empty', () => {
    expect(resolveTriageProvider({ agent: { backends: {} } })).toBeNull();
  });

  it('returns null when the ONLY backend is a non-provider type (e.g. mock)', () => {
    const config: TriageProviderConfig = { agent: { backends: { m: { type: 'mock' } } } };
    expect(resolveTriageProvider(config)).toBeNull();
  });

  it('returns null for an explicit anthropic opt-in with NO key anywhere (fail-safe, not a silent pass)', () => {
    const config: TriageProviderConfig = {
      intelligence: { provider: { kind: 'anthropic' } },
    };
    expect(resolveTriageProvider(config)).toBeNull();
  });

  it('returns null for an anthropic-type backend with no key (fail-safe)', () => {
    const config: TriageProviderConfig = {
      agent: { backends: { cloud: { type: 'anthropic', model: 'claude-x' } } },
    };
    expect(resolveTriageProvider(config)).toBeNull();
  });
});
