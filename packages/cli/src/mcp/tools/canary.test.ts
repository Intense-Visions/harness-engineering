import { describe, it, expect } from 'vitest';
import type { CanaryAdapter } from '@harness-engineering/intelligence';
import {
  handleCanaryProbe,
  handleCanaryRecommendFramework,
  handleCanaryRunHistory,
} from './canary.js';

// Minimal fake adapters — the handlers just call through and JSON-encode.
function fakeAdapter(over: Partial<CanaryAdapter>): CanaryAdapter {
  return {
    probe: async () => ({ status: 'degraded', reason: 'not-installed' }),
    recommendFramework: async () => ({
      status: 'degraded',
      test_type: '',
      framework: '',
      file_extension: '',
      reasoning: [],
      alternatives: [],
    }),
    reviewTest: async () => [],
    readRunHistory: async () => [],
    ...over,
  };
}

function parse(res: { content: Array<{ text: string }> }) {
  const first = res.content[0];
  if (!first) throw new Error('expected tool response content');
  return JSON.parse(first.text);
}

describe('canary_probe handler', () => {
  it('passes through an available probe', async () => {
    const adapter = fakeAdapter({ probe: async () => ({ status: 'available', version: '5.4.0' }) });
    const res = await handleCanaryProbe({}, adapter);
    expect(parse(res)).toEqual({ status: 'available', version: '5.4.0' });
  });

  it('passes through a degraded probe', async () => {
    const adapter = fakeAdapter({
      probe: async () => ({ status: 'degraded', reason: 'binary-missing' }),
    });
    expect(parse(await handleCanaryProbe({}, adapter))).toEqual({
      status: 'degraded',
      reason: 'binary-missing',
    });
  });

  it('default adapter returns well-formed JSON with a status (env-agnostic)', async () => {
    const probe = parse(await handleCanaryProbe({}));
    expect(['available', 'degraded']).toContain(probe.status);
  });
});

describe('canary_recommend_framework handler', () => {
  it('passes through a recommendation', async () => {
    const adapter = fakeAdapter({
      recommendFramework: async () => ({
        status: 'success',
        test_type: 'e2e_ui',
        framework: 'playwright',
        file_extension: 'spec.ts',
        reasoning: ['UI flow'],
        alternatives: [],
      }),
    });
    const res = await handleCanaryRecommendFramework({ prompt: 'login flow' }, adapter);
    expect(parse(res).framework).toBe('playwright');
  });

  it('errors on a missing/blank prompt without calling canary', async () => {
    const res = await handleCanaryRecommendFramework({ prompt: '  ' }, fakeAdapter({}));
    expect('isError' in res && res.isError).toBe(true);
  });

  it('passes through a degraded sentinel when canary is unavailable', async () => {
    const res = await handleCanaryRecommendFramework({ prompt: 'x' }, fakeAdapter({}));
    expect(parse(res).status).toBe('degraded');
  });
});

describe('canary_run_history handler', () => {
  it('passes through injected run records as a JSON array', async () => {
    const records = [
      { run_id: 'run-a', passed: 3, failed: 0, tests: [] },
      { run_id: 'run-b', passed: 2, failed: 1, tests: [{ test_name: 'login', status: 'failed' }] },
    ];
    const adapter = fakeAdapter({ readRunHistory: async () => records });
    const res = await handleCanaryRunHistory({}, adapter);
    expect(parse(res)).toEqual(records);
  });

  it('forwards path and limit to the adapter', async () => {
    let seen: { cwd?: number | string; limit?: number } | undefined;
    const adapter = fakeAdapter({
      readRunHistory: async (opts) => {
        seen = opts;
        return [];
      },
    });
    await handleCanaryRunHistory({ path: '/tmp/project', limit: 5 }, adapter);
    expect(seen).toEqual({ cwd: '/tmp/project', limit: 5 });
  });

  it('degrades to [] when canary is unavailable (default fake)', async () => {
    const res = await handleCanaryRunHistory({}, fakeAdapter({}));
    expect(parse(res)).toEqual([]);
  });
});
