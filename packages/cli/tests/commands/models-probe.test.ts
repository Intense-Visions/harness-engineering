import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runModelsProbe } from '../../src/commands/models';

const ORIG_FETCH = globalThis.fetch;

function mockFetchResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: 'OK',
    json: async () => body,
  } as unknown as Response;
}

describe('harness models probe', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'models-probe-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    globalThis.fetch = ORIG_FETCH;
  });

  function writeConfig(obj: object): string {
    const file = path.join(tmp, 'harness.config.json');
    fs.writeFileSync(file, JSON.stringify({ version: 1, ...obj }, null, 2));
    return file;
  }

  it('errors when no config and no --endpoint is given', async () => {
    const result = await runModelsProbe({});
    expect(result.status).toBe('error');
  });

  it('reports resolved=null when no configured model is loaded', async () => {
    const cfg = writeConfig({
      agent: {
        executor: 'subprocess',
        timeout: 300000,
        backends: {
          ollama: {
            type: 'local',
            endpoint: 'http://localhost:11434/v1',
            model: ['gemma-4-e4b', 'qwen3:8b'],
          },
        },
      },
    });
    globalThis.fetch = vi.fn(async () =>
      mockFetchResponse({ data: [{ id: 'llama3:8b' }, { id: 'mistral:7b' }] })
    ) as typeof fetch;

    const result = await runModelsProbe({ configPath: cfg });
    expect(result.status).toBe('no-match');
    expect(result.backend).toBe('ollama');
    expect(result.configured).toEqual(['gemma-4-e4b', 'qwen3:8b']);
    expect(result.detected).toEqual(['llama3:8b', 'mistral:7b']);
    expect(result.resolved).toBeNull();
    expect(result.exitCode).not.toBe(0);
  });

  it('reports the first configured model that is loaded', async () => {
    const cfg = writeConfig({
      agent: {
        executor: 'subprocess',
        timeout: 300000,
        backends: {
          ollama: {
            type: 'local',
            endpoint: 'http://localhost:11434/v1',
            model: ['gemma-4-e4b', 'qwen3:8b', 'deepseek-coder-v2'],
          },
        },
      },
    });
    globalThis.fetch = vi.fn(async () =>
      mockFetchResponse({ data: [{ id: 'qwen3:8b' }, { id: 'mistral:7b' }] })
    ) as typeof fetch;

    const result = await runModelsProbe({ configPath: cfg });
    expect(result.status).toBe('ok');
    expect(result.resolved).toBe('qwen3:8b');
    expect(result.exitCode).toBe(0);
  });

  it('auto-selects the first local/pi backend when --backend is omitted', async () => {
    const cfg = writeConfig({
      agent: {
        executor: 'subprocess',
        timeout: 300000,
        backends: {
          primary: { type: 'claude', command: 'claude' },
          lmstudio: { type: 'local', endpoint: 'http://localhost:1234/v1', model: 'gemma' },
        },
      },
    });
    globalThis.fetch = vi.fn(async () =>
      mockFetchResponse({ data: [{ id: 'gemma' }] })
    ) as typeof fetch;

    const result = await runModelsProbe({ configPath: cfg });
    expect(result.backend).toBe('lmstudio');
    expect(result.resolved).toBe('gemma');
  });

  it('respects --backend selection', async () => {
    const cfg = writeConfig({
      agent: {
        executor: 'subprocess',
        timeout: 300000,
        backends: {
          ollama: {
            type: 'local',
            endpoint: 'http://localhost:11434/v1',
            model: 'qwen3:8b',
          },
          lmstudio: {
            type: 'local',
            endpoint: 'http://localhost:1234/v1',
            model: 'gemma',
          },
        },
      },
    });
    globalThis.fetch = vi.fn(async () =>
      mockFetchResponse({ data: [{ id: 'gemma' }] })
    ) as typeof fetch;

    const result = await runModelsProbe({ configPath: cfg, backend: 'lmstudio' });
    expect(result.backend).toBe('lmstudio');
    expect(result.endpoint).toBe('http://localhost:1234/v1');
    expect(result.resolved).toBe('gemma');
  });

  it('surfaces probe network errors with context', async () => {
    const cfg = writeConfig({
      agent: {
        executor: 'subprocess',
        timeout: 300000,
        backends: {
          ollama: {
            type: 'local',
            endpoint: 'http://localhost:11434/v1',
            model: 'qwen3:8b',
          },
        },
      },
    });
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;

    const result = await runModelsProbe({ configPath: cfg });
    expect(result.status).toBe('error');
    expect(result.error).toMatch(/ECONNREFUSED/);
  });

  it('errors when no local/pi backend exists in config', async () => {
    const cfg = writeConfig({
      agent: {
        executor: 'subprocess',
        timeout: 300000,
        backends: {
          primary: { type: 'claude', command: 'claude' },
        },
      },
    });
    const result = await runModelsProbe({ configPath: cfg });
    expect(result.status).toBe('error');
    expect(result.error).toMatch(/No local backend/);
  });
});
