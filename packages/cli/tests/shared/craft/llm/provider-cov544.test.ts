import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  getProvider,
  resolveCraftLlmMode,
  resolveCraftLlmConfig,
  MockLlmProvider,
  InSessionLlmProvider,
  LazyLocalAdapter,
} from '../../../../src/shared/craft/llm/provider.js';

/**
 * Branch-coverage tests for the shared craft LLM provider hub. Exercises the
 * backend-typed provider builders (claude / anthropic / openai / local / pi),
 * their config-resolution fallbacks and error paths, and the env/config
 * precedence rules that resolveCraftLlmConfig implements.
 */

let tmp: string;
let savedEnv: string | undefined;
let savedAnthropic: string | undefined;
let savedOpenAI: string | undefined;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-cov544-'));
  savedEnv = process.env.HARNESS_CRAFT_LLM;
  savedAnthropic = process.env.ANTHROPIC_API_KEY;
  savedOpenAI = process.env.OPENAI_API_KEY;
  delete process.env.HARNESS_CRAFT_LLM;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  const restore = (k: string, v: string | undefined) => {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  };
  restore('HARNESS_CRAFT_LLM', savedEnv);
  restore('ANTHROPIC_API_KEY', savedAnthropic);
  restore('OPENAI_API_KEY', savedOpenAI);
});

function writeConfig(content: object): void {
  fs.writeFileSync(
    path.join(tmp, 'harness.config.json'),
    JSON.stringify({ version: 1, ...content }, null, 2)
  );
}

function backendConfig(name: string, def: Record<string, unknown>): object {
  return {
    agent: { executor: 'subprocess', timeout: 300000, backends: { [name]: def } },
    craft: { llm: { backend: name } },
  };
}

describe('resolveCraftLlmMode back-compat shim', () => {
  it('returns mock/in-session directly from an explicit envValue argument', () => {
    expect(resolveCraftLlmMode('mock')).toBe('mock');
    expect(resolveCraftLlmMode('  in-session  ')).toBe('in-session');
  });

  it('falls through to config resolution when envValue is unrecognized', () => {
    // No config present under cwd → default in-session.
    expect(resolveCraftLlmMode('not-a-mode')).toBe('in-session');
  });
});

describe('MockLlmProvider behavior', () => {
  it('records cost and returns the matching override response', async () => {
    const p = new MockLlmProvider([{ promptIncludes: 'FIND-ME', response: 'custom' }]);
    expect(await p.callText('please FIND-ME here')).toBe('custom');
    const other = await p.callText('no override here');
    expect(other).toContain('```json');
    expect(p.getCosts()).toHaveLength(2);
    expect(p.getCosts()[0]!.provider).toBe('mock');
  });

  it('throws on callVision (Phase 2 unimplemented)', async () => {
    await expect(new MockLlmProvider().callVision()).rejects.toThrow(/callVision/);
  });
});

describe('getProvider backend builders', () => {
  it('builds a claude provider from a claude backend (no command)', () => {
    writeConfig(backendConfig('cli', { type: 'claude' }));
    const p = getProvider({ projectRoot: tmp });
    expect(p).toBeTruthy();
    expect(typeof p.callText).toBe('function');
  });

  it('builds a claude provider honoring a custom command field', () => {
    writeConfig(backendConfig('cli', { type: 'claude', command: 'claude-custom' }));
    const p = getProvider({ projectRoot: tmp });
    expect(typeof p.callText).toBe('function');
  });

  it('builds an anthropic provider when apiKey is inline in config', () => {
    writeConfig(
      backendConfig('remote', { type: 'anthropic', model: 'claude-x', apiKey: 'sk-inline' })
    );
    const p = getProvider({ projectRoot: tmp });
    expect(p.model).toBeDefined();
  });

  it('builds an anthropic provider when apiKey comes from ANTHROPIC_API_KEY', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-env';
    writeConfig(backendConfig('remote', { type: 'anthropic', model: 'claude-x' }));
    expect(getProvider({ projectRoot: tmp })).toBeTruthy();
  });

  it('throws when an anthropic backend has neither apiKey nor env', () => {
    writeConfig(backendConfig('remote', { type: 'anthropic', model: 'claude-x' }));
    expect(() => getProvider({ projectRoot: tmp })).toThrow(/apiKey or ANTHROPIC_API_KEY/);
  });

  it('builds a single-model openai provider using the default endpoint + OPENAI_API_KEY', () => {
    process.env.OPENAI_API_KEY = 'sk-openai';
    writeConfig(backendConfig('gpt', { type: 'openai', model: 'gpt-4o' }));
    const p = getProvider({ projectRoot: tmp });
    expect(p).not.toBeInstanceOf(LazyLocalAdapter);
    expect(typeof p.callText).toBe('function');
  });

  it('throws for an openai backend with no apiKey and no OPENAI_API_KEY', () => {
    writeConfig(backendConfig('gpt', { type: 'openai', model: 'gpt-4o' }));
    expect(() => getProvider({ projectRoot: tmp })).toThrow(/apiKey or OPENAI_API_KEY/);
  });

  it('builds a multi-model local provider as a LazyLocalAdapter', () => {
    writeConfig(
      backendConfig('ollama', {
        type: 'local',
        endpoint: 'http://localhost:11434/v1',
        model: ['a', 'b'],
      })
    );
    expect(getProvider({ projectRoot: tmp })).toBeInstanceOf(LazyLocalAdapter);
  });

  it('builds a single-model local provider with endpoint + default local apiKey', () => {
    writeConfig(
      backendConfig('ollama', {
        type: 'local',
        endpoint: 'http://localhost:11434/v1',
        model: 'qwen3',
      })
    );
    const p = getProvider({ projectRoot: tmp });
    expect(p).not.toBeInstanceOf(LazyLocalAdapter);
    expect(typeof p.callText).toBe('function');
  });

  it('builds a multi-model pi provider as a LazyLocalAdapter', () => {
    writeConfig(
      backendConfig('pilocal', {
        type: 'pi',
        endpoint: 'http://localhost:9000/v1',
        model: ['a', 'b'],
      })
    );
    expect(getProvider({ projectRoot: tmp })).toBeInstanceOf(LazyLocalAdapter);
  });

  it('throws when a local backend has no endpoint (no openai fallback)', () => {
    // A local backend is only reachable when the config loader accepts it. The
    // craft schema requires endpoint for local; supplying it via env override
    // that names a backend def without endpoint lets us reach the throw.
    process.env.HARNESS_CRAFT_LLM = 'ollama';
    fs.writeFileSync(
      path.join(tmp, 'harness.config.json'),
      JSON.stringify(
        {
          version: 1,
          agent: {
            executor: 'subprocess',
            timeout: 300000,
            backends: { ollama: { type: 'local', model: 'qwen3' } },
          },
        },
        null,
        2
      )
    );
    // Config loader may reject the endpoint-less local backend; when the env
    // override is honored, resolveOpenAICompatibleEndpoint throws. Either way,
    // getProvider does not silently return a usable provider.
    let threw = false;
    try {
      getProvider({ projectRoot: tmp });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it('throws for the not-yet-wired gemini backend', () => {
    process.env.HARNESS_CRAFT_LLM = 'g';
    fs.writeFileSync(
      path.join(tmp, 'harness.config.json'),
      JSON.stringify(
        {
          version: 1,
          agent: {
            executor: 'subprocess',
            timeout: 300000,
            backends: { g: { type: 'gemini', model: 'gemini-x' } },
          },
        },
        null,
        2
      )
    );
    expect(() => getProvider({ projectRoot: tmp })).toThrow(/gemini.*not yet wired/);
  });
});

describe('resolveCraftLlmConfig env-named backend', () => {
  it('resolves a backend named via HARNESS_CRAFT_LLM and copies its def', () => {
    fs.writeFileSync(
      path.join(tmp, 'harness.config.json'),
      JSON.stringify(
        {
          version: 1,
          agent: {
            executor: 'subprocess',
            timeout: 300000,
            backends: {
              ollama: { type: 'local', endpoint: 'http://localhost:11434/v1', model: 'qwen3' },
            },
          },
        },
        null,
        2
      )
    );
    process.env.HARNESS_CRAFT_LLM = 'ollama';
    const r = resolveCraftLlmConfig({ projectRoot: tmp });
    expect(r.mode).toBe('local');
    expect(r.backendName).toBe('ollama');
    expect(r.backendDef?.model).toBe('qwen3');
  });

  it('throws when the env-named backend has a type craft cannot adapt (ollama)', () => {
    // `ollama` is valid against the config schema but is NOT one of the craft
    // adapter's supported backend types, so the env override must reject it.
    fs.writeFileSync(
      path.join(tmp, 'harness.config.json'),
      JSON.stringify(
        {
          version: 1,
          agent: {
            executor: 'subprocess',
            timeout: 300000,
            backends: {
              weird: { type: 'ollama', endpoint: 'http://localhost:11434/v1', model: 'qwen3' },
            },
          },
        },
        null,
        2
      )
    );
    process.env.HARNESS_CRAFT_LLM = 'weird';
    expect(() => resolveCraftLlmConfig({ projectRoot: tmp })).toThrow(/unsupported type/);
  });

  it('throws when a config-file backend has a type craft cannot adapt (ollama)', () => {
    writeConfig(
      backendConfig('weird', {
        type: 'ollama',
        endpoint: 'http://localhost:11434/v1',
        model: 'qwen3',
      })
    );
    expect(() => resolveCraftLlmConfig({ projectRoot: tmp })).toThrow(/unsupported type/);
  });

  it('defaults to in-session with no config and no env', () => {
    expect(resolveCraftLlmConfig({ projectRoot: tmp }).mode).toBe('in-session');
    expect(getProvider({ projectRoot: tmp })).toBeInstanceOf(InSessionLlmProvider);
  });
});
