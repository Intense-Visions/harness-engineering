import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  getProvider,
  resolveCraftLlmMode,
  resolveCraftLlmConfig,
  InSessionLlmProvider,
  PromptDeferredError,
  MockLlmProvider,
} from '../../../src/shared/craft/llm/provider';

describe('resolveCraftLlmMode', () => {
  let savedEnv: string | undefined;
  beforeEach(() => {
    savedEnv = process.env.HARNESS_CRAFT_LLM;
  });
  afterEach(() => {
    if (savedEnv === undefined) delete process.env.HARNESS_CRAFT_LLM;
    else process.env.HARNESS_CRAFT_LLM = savedEnv;
  });

  it('returns mock when env is mock', () => {
    process.env.HARNESS_CRAFT_LLM = 'mock';
    expect(resolveCraftLlmMode()).toBe('mock');
  });

  it('returns in-session when env is in-session', () => {
    process.env.HARNESS_CRAFT_LLM = 'in-session';
    expect(resolveCraftLlmMode()).toBe('in-session');
  });
});

describe('getProvider (explicit overrides)', () => {
  it('returns InSessionLlmProvider for mode=in-session', () => {
    expect(getProvider({ mode: 'in-session' })).toBeInstanceOf(InSessionLlmProvider);
  });

  it('returns MockLlmProvider for mode=mock', () => {
    expect(getProvider({ mode: 'mock' })).toBeInstanceOf(MockLlmProvider);
  });
});

describe('resolveCraftLlmConfig (config-file driven)', () => {
  let tmp: string;
  let savedEnv: string | undefined;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-cfg-'));
    savedEnv = process.env.HARNESS_CRAFT_LLM;
    delete process.env.HARNESS_CRAFT_LLM;
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    if (savedEnv === undefined) delete process.env.HARNESS_CRAFT_LLM;
    else process.env.HARNESS_CRAFT_LLM = savedEnv;
  });

  function writeConfig(content: object): void {
    fs.writeFileSync(
      path.join(tmp, 'harness.config.json'),
      JSON.stringify({ version: 1, ...content }, null, 2)
    );
  }

  it('returns in-session when no config exists', () => {
    expect(resolveCraftLlmConfig({ projectRoot: tmp }).mode).toBe('in-session');
  });

  it('honors craft.llm.mode=mock', () => {
    writeConfig({ craft: { llm: { mode: 'mock' } } });
    expect(resolveCraftLlmConfig({ projectRoot: tmp }).mode).toBe('mock');
  });

  it('resolves craft.llm.backend to a named entry in agent.backends', () => {
    writeConfig({
      agent: {
        executor: 'subprocess',
        timeout: 300000,
        backends: {
          ollama: {
            type: 'local',
            endpoint: 'http://localhost:11434/v1',
            model: 'deepseek-coder-v2',
          },
        },
      },
      craft: { llm: { backend: 'ollama' } },
    });
    const r = resolveCraftLlmConfig({ projectRoot: tmp });
    expect(r.mode).toBe('local');
    expect(r.backendName).toBe('ollama');
    expect(r.backendDef?.endpoint).toBe('http://localhost:11434/v1');
  });

  it('throws when craft.llm.backend references a missing entry', () => {
    writeConfig({ craft: { llm: { backend: 'nonexistent' } } });
    expect(() => resolveCraftLlmConfig({ projectRoot: tmp })).toThrow(
      /missing from agent.backends/
    );
  });

  it('env HARNESS_CRAFT_LLM=<backend-name> picks that backend at runtime', () => {
    writeConfig({
      agent: {
        executor: 'subprocess',
        timeout: 300000,
        backends: {
          ollama: { type: 'local', endpoint: 'http://localhost:11434/v1', model: 'qwen3' },
        },
      },
    });
    process.env.HARNESS_CRAFT_LLM = 'ollama';
    const r = resolveCraftLlmConfig({ projectRoot: tmp });
    expect(r.mode).toBe('local');
    expect(r.backendName).toBe('ollama');
  });

  it('env HARNESS_CRAFT_LLM=mock wins over config-file backend', () => {
    writeConfig({
      agent: {
        executor: 'subprocess',
        timeout: 300000,
        backends: {
          ollama: { type: 'local', endpoint: 'http://localhost:11434/v1', model: 'qwen3' },
        },
      },
      craft: { llm: { backend: 'ollama' } },
    });
    process.env.HARNESS_CRAFT_LLM = 'mock';
    expect(resolveCraftLlmConfig({ projectRoot: tmp }).mode).toBe('mock');
  });

  it('instantiates a MockLlmProvider when resolution → mock', () => {
    writeConfig({ craft: { llm: { mode: 'mock' } } });
    expect(getProvider({ projectRoot: tmp })).toBeInstanceOf(MockLlmProvider);
  });

  it('instantiates an InSessionLlmProvider when resolution → in-session', () => {
    writeConfig({ craft: { llm: { mode: 'in-session' } } });
    expect(getProvider({ projectRoot: tmp })).toBeInstanceOf(InSessionLlmProvider);
  });

  it('errors when anthropic backend has no apiKey and no env var', () => {
    writeConfig({
      agent: {
        executor: 'subprocess',
        timeout: 300000,
        backends: {
          remote: { type: 'anthropic', model: 'claude-sonnet-4-6' },
        },
      },
      craft: { llm: { backend: 'remote' } },
    });
    const savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(() => getProvider({ projectRoot: tmp })).toThrow(/apiKey or ANTHROPIC_API_KEY/);
    } finally {
      if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
    }
  });

  it('errors when local backend has no endpoint', () => {
    writeConfig({
      agent: {
        executor: 'subprocess',
        timeout: 300000,
        backends: {
          // model present but no endpoint — schema requires endpoint, so this is invalid config;
          // verify the loader rejects it (loadConfig returns Err → resolveCraftLlmConfig falls through).
          ollama: { type: 'local', model: 'qwen3' },
        },
      },
      craft: { llm: { backend: 'ollama' } },
    });
    // Invalid config means the file fails to load entirely; selector falls through to default.
    expect(resolveCraftLlmConfig({ projectRoot: tmp }).mode).toBe('in-session');
  });
});

describe('InSessionLlmProvider', () => {
  it('throws PromptDeferredError and records the prompt', async () => {
    const p = new InSessionLlmProvider();
    await expect(p.callText('prompt body', { systemPrompt: 'system body' })).rejects.toBeInstanceOf(
      PromptDeferredError
    );
    const deferred = p.getDeferred();
    expect(deferred).toHaveLength(1);
    expect(deferred[0]!.userPrompt).toBe('prompt body');
    expect(deferred[0]!.systemPrompt).toBe('system body');
    expect(deferred[0]!.promptId).toMatch(/^p/);
  });

  it('assigns distinct promptIds for sequential calls', async () => {
    const p = new InSessionLlmProvider();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      try {
        await p.callText(`prompt-${i}`);
      } catch (err) {
        if (err instanceof PromptDeferredError) ids.push(err.promptId);
      }
    }
    expect(new Set(ids).size).toBe(3);
  });

  it('throws on callVision (not implemented for in-session)', async () => {
    const p = new InSessionLlmProvider();
    await expect(p.callVision('hi', {})).rejects.toThrow(/callVision/);
  });
});
