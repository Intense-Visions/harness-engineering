import { describe, expect, it, vi } from 'vitest';

import { probeAgenticSignals } from '../../src/capability/agentic.js';

const BASE = 'http://127.0.0.1:11434/v1';

/**
 * Fake `fetch` routing `/api/show` + `/v1/chat/completions`. The tool-calling probe
 * hits `/api/show` then a `/v1` chat call; the latency probe hits `/v1` again. A
 * per-URL `throwOn` / `okBy` lets each leg fail independently to exercise fail-open.
 */
function fakeFetch(cfg: {
  capabilities?: string[];
  toolCalls?: unknown[] | null;
  throwOnChat?: boolean;
  throwOnShow?: boolean;
  chatOk?: boolean;
}) {
  return vi.fn(async (url: string) => {
    const isShow = url.includes('/api/show');
    if (isShow) {
      if (cfg.throwOnShow) throw new Error('ECONNREFUSED');
      return {
        ok: true,
        json: async () => ({ capabilities: cfg.capabilities ?? ['tools'] }),
      } as unknown as Response;
    }
    // /v1/chat/completions — used by BOTH the tool-call probe and the latency probe.
    if (cfg.throwOnChat) throw new Error('ECONNREFUSED');
    const message =
      cfg.toolCalls === null ? { content: 'text only' } : { tool_calls: cfg.toolCalls };
    return {
      ok: cfg.chatOk ?? true,
      json: async () => ({ choices: [{ message }] }),
    } as unknown as Response;
  });
}

describe('probeAgenticSignals (SC6, D5)', () => {
  it('fills toolCalling + measuredAgenticLatencyMs when the endpoint is healthy', async () => {
    const f = fakeFetch({
      capabilities: ['tools'],
      toolCalls: [{ function: { name: 'write_file' } }],
    });
    // Deterministic clock: +25ms per read (started, then after the timed call).
    let t = 0;
    const now = () => (t += 25);
    const signals = await probeAgenticSignals({
      model: 'qwen3:32b',
      baseUrl: BASE,
      fetchImpl: f,
      now,
    });
    expect(signals.toolCalling).toBe(true);
    expect(typeof signals.measuredAgenticLatencyMs).toBe('number');
    expect(signals.measuredAgenticLatencyMs!).toBeGreaterThan(0);
  });

  it('reports toolCalling:false for a tools-capable model that emits the call as TEXT', async () => {
    const f = fakeFetch({ capabilities: ['tools'], toolCalls: null });
    const signals = await probeAgenticSignals({
      model: 'qwen2.5-coder:7b',
      baseUrl: BASE,
      fetchImpl: f,
    });
    expect(signals.toolCalling).toBe(false);
    expect(typeof signals.measuredAgenticLatencyMs).toBe('number');
  });

  it('never throws + leaves latency undefined when the timed agentic call errors', async () => {
    const f = fakeFetch({ throwOnChat: true, capabilities: ['tools'] });
    const signals = await probeAgenticSignals({ model: 'x', baseUrl: BASE, fetchImpl: f });
    // Tool-calling chat leg also errors ⇒ undefined; latency leg errors ⇒ undefined.
    expect(signals.toolCalling).toBeUndefined();
    expect(signals.measuredAgenticLatencyMs).toBeUndefined();
  });

  it('returns undefined-signals (never throws) on a total transport outage', async () => {
    const f = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const signals = await probeAgenticSignals({ model: 'x', baseUrl: BASE, fetchImpl: f });
    expect(signals).toEqual({});
  });

  it('never assigns undefined properties (exactOptionalPropertyTypes)', async () => {
    const f = vi.fn(async () => {
      throw new Error('down');
    });
    const signals = await probeAgenticSignals({ model: 'x', baseUrl: BASE, fetchImpl: f });
    expect(Object.prototype.hasOwnProperty.call(signals, 'toolCalling')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(signals, 'measuredAgenticLatencyMs')).toBe(false);
  });
});
