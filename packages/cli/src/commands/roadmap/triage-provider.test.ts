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

  it('resolves an `ollama` local backend (the default local backend since #843) — regression', () => {
    // Before the fix the resolver only matched type 'local'/'pi', so the shipped
    // default `type: ollama` backend yielded null and the brainstorm halted every
    // item with "no fork generator or provider wired".
    const config: TriageProviderConfig = {
      agent: {
        backends: {
          local: {
            type: 'ollama',
            endpoint: 'http://127.0.0.1:11434/v1',
            model: ['qwen3-coder:30b'],
          },
        },
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

describe('resolveTriageProvider — pool-first local model (localModelPreference)', () => {
  const savedKey = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => delete process.env.ANTHROPIC_API_KEY);
  afterEach(() => {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = savedKey;
  });

  /** Read the private model an OpenAI-compatible provider resolved to (test-only introspection). */
  const modelOf = (p: unknown): string => (p as { defaultModel: string }).defaultModel;

  const localConfig: TriageProviderConfig = {
    agent: {
      backends: {
        local: {
          type: 'local',
          endpoint: 'http://localhost:11434/v1',
          model: ['qwen2.5-coder:7b', 'gemma3n:e4b'],
        },
      },
    },
  };

  it('prefers the pool pick over the static config list for the local backend', () => {
    const provider = resolveTriageProvider(localConfig, undefined, 'qwen3:32b');
    expect(provider).toBeInstanceOf(OpenAICompatibleAnalysisProvider);
    expect(modelOf(provider)).toBe('qwen3:32b'); // pool pick, NOT config[0] qwen2.5-coder:7b
  });

  it('falls back to the static config list when there is no pool pick', () => {
    const provider = resolveTriageProvider(localConfig, undefined, undefined);
    expect(modelOf(provider)).toBe('qwen2.5-coder:7b'); // config[0] fallback preserved
  });

  it('an explicit --model override still wins over the pool pick', () => {
    const provider = resolveTriageProvider(localConfig, 'pinned-model', 'qwen3:32b');
    expect(modelOf(provider)).toBe('pinned-model');
  });

  it('ignores the pool pick for an explicit cloud (anthropic) backend — an Ollama tag is meaningless there', () => {
    const config: TriageProviderConfig = {
      intelligence: { provider: { kind: 'anthropic', apiKey: 'sk-ant' } },
    };
    // Must remain Anthropic; the local pool pick must not leak into the cloud branch.
    expect(resolveTriageProvider(config, undefined, 'qwen3:32b')).toBeInstanceOf(
      AnthropicAnalysisProvider
    );
  });
});
