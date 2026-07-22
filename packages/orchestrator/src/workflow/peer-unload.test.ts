import { describe, it, expect } from 'vitest';
import { resolvePeerUnloadTarget, resolvePeerUnloadFromConfig } from './peer-unload';

describe('resolvePeerUnloadTarget', () => {
  it('derives the /api/generate URL from the reasoner /v1 endpoint + coder model', () => {
    expect(
      resolvePeerUnloadTarget({
        reasonerEndpoint: 'http://127.0.0.1:11434/v1',
        executionModel: 'qwen3-coder:30b',
      })
    ).toEqual({ url: 'http://127.0.0.1:11434/api/generate', model: 'qwen3-coder:30b' });
  });

  it('uses the first model of a prefer-fallback array', () => {
    expect(
      resolvePeerUnloadTarget({
        reasonerEndpoint: 'http://127.0.0.1:11434/v1/',
        executionModel: ['qwen3-coder:30b', 'fallback'],
      })?.model
    ).toBe('qwen3-coder:30b');
  });

  it('strips a trailing slash with no /v1 suffix', () => {
    expect(
      resolvePeerUnloadTarget({ reasonerEndpoint: 'http://host:11434/', executionModel: 'm' })?.url
    ).toBe('http://host:11434/api/generate');
  });

  it('returns undefined when the endpoint or model is missing', () => {
    expect(resolvePeerUnloadTarget({ executionModel: 'm' })).toBeUndefined();
    expect(resolvePeerUnloadTarget({ reasonerEndpoint: 'http://x/v1' })).toBeUndefined();
    expect(
      resolvePeerUnloadTarget({ reasonerEndpoint: 'http://x/v1', executionModel: [] })
    ).toBeUndefined();
    expect(resolvePeerUnloadTarget({ reasonerEndpoint: '', executionModel: 'm' })).toBeUndefined();
  });
});

describe('resolvePeerUnloadFromConfig', () => {
  const config = {
    routing: { default: 'codex-exec', modes: { thinking: 'reasoner' } },
    backends: {
      reasoner: { type: 'ollama', endpoint: 'http://127.0.0.1:11434/v1', model: 'qwen3.6:27b' },
      'codex-exec': { type: 'codex', model: ['qwen3-coder:30b'] },
    },
  };

  it('derives the target from the thinking-reasoner endpoint + default-backend model', () => {
    expect(resolvePeerUnloadFromConfig(config)).toEqual({
      url: 'http://127.0.0.1:11434/api/generate',
      model: 'qwen3-coder:30b',
    });
  });

  it('handles array-form routing.default / modes.thinking', () => {
    expect(
      resolvePeerUnloadFromConfig({
        routing: { default: ['codex-exec'], modes: { thinking: ['reasoner'] } },
        backends: config.backends,
      })?.model
    ).toBe('qwen3-coder:30b');
  });

  it('returns undefined when the reasoner backend has no endpoint', () => {
    expect(
      resolvePeerUnloadFromConfig({
        routing: { default: 'codex-exec', modes: { thinking: 'claudeish' } },
        backends: { claudeish: { type: 'claude' }, 'codex-exec': { type: 'codex', model: 'm' } },
      })
    ).toBeUndefined();
  });

  it('returns undefined when routing/backends are absent', () => {
    expect(resolvePeerUnloadFromConfig({})).toBeUndefined();
    expect(resolvePeerUnloadFromConfig({ routing: {} })).toBeUndefined();
  });
});
