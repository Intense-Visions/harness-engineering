import { describe, it, expect } from 'vitest';
import type { BackendDef } from '@harness-engineering/types';
import { createBackend } from '../../src/agent/backend-factory.js';
import { MockBackend } from '../../src/agent/backends/mock.js';
import { ClaudeBackend } from '../../src/agent/backends/claude.js';
import { AnthropicBackend } from '../../src/agent/backends/anthropic.js';
import { OpenAIBackend } from '../../src/agent/backends/openai.js';
import { GeminiBackend } from '../../src/agent/backends/gemini.js';
import { LocalBackend } from '../../src/agent/backends/local.js';
import { PiBackend } from '../../src/agent/backends/pi.js';

describe('createBackend', () => {
  it('builds MockBackend for type=mock', () => {
    const def: BackendDef = { type: 'mock' };
    expect(createBackend(def)).toBeInstanceOf(MockBackend);
  });

  it('builds ClaudeBackend with default command for type=claude', () => {
    const def: BackendDef = { type: 'claude' };
    expect(createBackend(def)).toBeInstanceOf(ClaudeBackend);
  });

  it('builds ClaudeBackend honoring command override', () => {
    const def: BackendDef = { type: 'claude', command: 'claude-cli' };
    expect(createBackend(def)).toBeInstanceOf(ClaudeBackend);
  });

  it('builds AnthropicBackend with model + apiKey', () => {
    const def: BackendDef = { type: 'anthropic', model: 'claude-sonnet-4', apiKey: 'sk-x' };
    expect(createBackend(def)).toBeInstanceOf(AnthropicBackend);
  });

  it('builds OpenAIBackend with model + apiKey', () => {
    const def: BackendDef = { type: 'openai', model: 'gpt-4o', apiKey: 'sk-y' };
    expect(createBackend(def)).toBeInstanceOf(OpenAIBackend);
  });

  it('builds GeminiBackend with model + apiKey', () => {
    const def: BackendDef = { type: 'gemini', model: 'gemini-2.5', apiKey: 'sk-z' };
    expect(createBackend(def)).toBeInstanceOf(GeminiBackend);
  });

  it('builds LocalBackend for type=local with string model', () => {
    const def: BackendDef = {
      type: 'local',
      endpoint: 'http://localhost:1234/v1',
      model: 'gemma-4-e4b',
    };
    expect(createBackend(def)).toBeInstanceOf(LocalBackend);
  });

  it('builds LocalBackend for type=local with array model and provides getModel resolver', () => {
    const def: BackendDef = {
      type: 'local',
      endpoint: 'http://localhost:1234/v1',
      model: ['gemma-4-e4b', 'qwen3:8b'],
    };
    const backend = createBackend(def) as LocalBackend & { getModel?: () => string | null };
    expect(backend).toBeInstanceOf(LocalBackend);
  });

  it('builds PiBackend for type=pi with string model', () => {
    const def: BackendDef = {
      type: 'pi',
      endpoint: 'http://pi.local:1234/v1',
      model: 'gemma-4-e4b',
    };
    expect(createBackend(def)).toBeInstanceOf(PiBackend);
  });

  it('builds PiBackend for type=pi with array model and head-of-array getModel', () => {
    const def: BackendDef = {
      type: 'pi',
      endpoint: 'http://pi.local:1234/v1',
      model: ['m-a', 'm-b'],
    };
    expect(createBackend(def)).toBeInstanceOf(PiBackend);
  });

  it('propagates timeoutMs to PiBackend when set on the def (Spec 2 PFC-2)', () => {
    const def: BackendDef = {
      type: 'pi',
      endpoint: 'http://pi.local:1234/v1',
      model: 'gemma-4-e4b',
      timeoutMs: 45_000,
    };
    const backend = createBackend(def) as PiBackend;
    expect(backend).toBeInstanceOf(PiBackend);
    expect((backend as unknown as { timeoutMs: number }).timeoutMs).toBe(45_000);
  });

  it('uses default 90_000 timeoutMs on PiBackend when not set on the def (Spec 2 PFC-2)', () => {
    const def: BackendDef = {
      type: 'pi',
      endpoint: 'http://pi.local:1234/v1',
      model: 'gemma-4-e4b',
    };
    const backend = createBackend(def) as PiBackend;
    expect((backend as unknown as { timeoutMs: number }).timeoutMs).toBe(90_000);
  });

  it('throws on unknown discriminant', () => {
    // @ts-expect-error intentionally invalid discriminant
    expect(() => createBackend({ type: 'bogus' })).toThrow(/unknown.*backend.*type/i);
  });
});
