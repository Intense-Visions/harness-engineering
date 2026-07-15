import { describe, it, expect, vi } from 'vitest';
import { probeToolCalling } from '../../src/capability/tool-calling.js';

/**
 * Build a fake `fetch` that routes `/api/show` and `/v1/chat/completions` to configurable
 * responses. `show.capabilities` gates whether the (more expensive) chat probe even runs.
 */
function fakeFetch(cfg: {
  showOk?: boolean;
  capabilities?: string[];
  chatOk?: boolean;
  toolCalls?: unknown[] | null; // null ⇒ text-only response (no tool_calls field)
  throwOn?: 'show' | 'chat';
}) {
  return vi.fn(async (url: string) => {
    const isShow = url.includes('/api/show');
    if (cfg.throwOn === 'show' && isShow) throw new Error('ECONNREFUSED');
    if (cfg.throwOn === 'chat' && !isShow) throw new Error('ECONNREFUSED');
    if (isShow) {
      return {
        ok: cfg.showOk ?? true,
        json: async () => ({ capabilities: cfg.capabilities ?? [] }),
      } as unknown as Response;
    }
    // /v1/chat/completions
    const message =
      cfg.toolCalls === null ? { content: '{"name":"write_file"}' } : { tool_calls: cfg.toolCalls };
    return {
      ok: cfg.chatOk ?? true,
      json: async () => ({ choices: [{ message }] }),
    } as unknown as Response;
  });
}

const BASE = 'http://127.0.0.1:11434/v1';

describe('probeToolCalling', () => {
  it('returns false WITHOUT an inference call when /api/show lacks the tools capability', async () => {
    const f = fakeFetch({ capabilities: ['completion', 'insert'] });
    const result = await probeToolCalling({ model: 'no-tools:1b', baseUrl: BASE, fetchImpl: f });
    expect(result).toBe(false);
    expect(f).toHaveBeenCalledTimes(1); // only /api/show — the free negative, no /v1 probe
    expect(f.mock.calls[0]![0]).toContain('/api/show');
  });

  it('returns true when tools-capable AND the model emits native tool_calls', async () => {
    const f = fakeFetch({
      capabilities: ['completion', 'tools'],
      toolCalls: [{ function: { name: 'write_file' } }],
    });
    expect(await probeToolCalling({ model: 'qwen3:32b', baseUrl: BASE, fetchImpl: f })).toBe(true);
    expect(f).toHaveBeenCalledTimes(2); // /api/show then /v1
  });

  it('returns FALSE when tools-capable but the model emits the call as TEXT (no tool_calls) — the coder-7b case', async () => {
    const f = fakeFetch({ capabilities: ['completion', 'tools', 'insert'], toolCalls: null });
    expect(await probeToolCalling({ model: 'qwen2.5-coder:7b', baseUrl: BASE, fetchImpl: f })).toBe(
      false
    );
  });

  it('returns false for an empty tool_calls array', async () => {
    const f = fakeFetch({ capabilities: ['tools'], toolCalls: [] });
    expect(await probeToolCalling({ model: 'x', baseUrl: BASE, fetchImpl: f })).toBe(false);
  });

  it('returns undefined (unknown) when /api/show is unreachable', async () => {
    const f = fakeFetch({ throwOn: 'show' });
    expect(await probeToolCalling({ model: 'x', baseUrl: BASE, fetchImpl: f })).toBeUndefined();
  });

  it('returns undefined (unknown) when /api/show returns non-2xx', async () => {
    const f = fakeFetch({ showOk: false });
    expect(await probeToolCalling({ model: 'x', baseUrl: BASE, fetchImpl: f })).toBeUndefined();
  });

  it('returns undefined (unknown) when the chat probe errors', async () => {
    const f = fakeFetch({ capabilities: ['tools'], throwOn: 'chat' });
    expect(await probeToolCalling({ model: 'x', baseUrl: BASE, fetchImpl: f })).toBeUndefined();
  });

  it('derives /api/show from the /v1 base URL', async () => {
    const f = fakeFetch({
      capabilities: ['tools'],
      toolCalls: [{ function: { name: 'write_file' } }],
    });
    await probeToolCalling({ model: 'x', baseUrl: 'http://host:11434/v1', fetchImpl: f });
    expect(f.mock.calls[0]![0]).toBe('http://host:11434/api/show');
    expect(f.mock.calls[1]![0]).toBe('http://host:11434/v1/chat/completions');
  });
});
