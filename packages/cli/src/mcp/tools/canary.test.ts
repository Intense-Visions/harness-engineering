import { describe, it, expect } from 'vitest';
import type { CanaryAdapter } from '@harness-engineering/intelligence';
import {
  handleCanaryProbe,
  handleCanaryRecommendFramework,
  handleCanaryDiscoverTestCommand,
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
    listFrameworks: async () => [],
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

const REGISTRY = [
  {
    name: 'playwright',
    languages: ['typescript'],
    file_extensions: ['spec.ts', 'spec.js', 'test.ts', 'test.js'],
    execution_command: 'npx --yes playwright test {file}',
    ci_flags: ['--reporter=list'],
    status: 'preferred',
    tier: 'full',
  },
  {
    name: 'vitest',
    languages: ['typescript'],
    file_extensions: ['test.ts', 'test.js', 'spec.ts', 'spec.js'],
    execution_command: 'npx --yes vitest run {file}',
    ci_flags: ['--reporter=verbose'],
    status: 'preferred',
    tier: 'full',
  },
  {
    name: 'stryker',
    languages: ['typescript'],
    file_extensions: ['js', 'ts'],
    execution_command: 'npx --yes stryker run', // no {file} → not resolvable
    ci_flags: [],
    status: 'supported',
    tier: 'executable',
  },
];

describe('canary_discover_test_command handler', () => {
  const available = (frameworks: unknown[] = REGISTRY) =>
    fakeAdapter({
      probe: async () => ({ status: 'available', version: '5.4.0' }),
      listFrameworks: async () => frameworks as never,
    });

  it('degrades without listing frameworks when probe is degraded', async () => {
    const res = await handleCanaryDiscoverTestCommand(
      { files: ['login.spec.ts'] },
      fakeAdapter({ probe: async () => ({ status: 'degraded', reason: 'not-installed' }) })
    );
    expect(parse(res)).toEqual({ status: 'degraded', reason: 'not-installed', frameworks: [] });
  });

  it('resolves a per-file command from registry truth', async () => {
    const res = await handleCanaryDiscoverTestCommand({ files: ['login.spec.ts'] }, available());
    expect(parse(res)).toEqual({
      status: 'available',
      frameworks: [
        {
          name: 'playwright',
          command: 'npx --yes playwright test login.spec.ts',
          matchedFiles: ['login.spec.ts'],
        },
      ],
    });
  });

  it('appends ci_flags under ci:true', async () => {
    const res = await handleCanaryDiscoverTestCommand(
      { files: ['login.spec.ts'], ci: true },
      available()
    );
    expect(parse(res).frameworks[0].command).toBe(
      'npx --yes playwright test login.spec.ts --reporter=list'
    );
  });

  it('returns no frameworks when nothing matches', async () => {
    const res = await handleCanaryDiscoverTestCommand({ files: ['README.md'] }, available());
    expect(parse(res)).toEqual({ status: 'available', frameworks: [] });
  });

  it('prefers the longest suffix and drops no-{file} whole-suite frameworks', async () => {
    // bar.ts matches only stryker's `ts` (whole-suite, no {file}) → dropped → empty.
    const res = await handleCanaryDiscoverTestCommand({ files: ['bar.ts'] }, available());
    expect(parse(res).frameworks).toEqual([]);
  });

  it('breaks a preferred/full tie by registry order (playwright before vitest)', async () => {
    const res = await handleCanaryDiscoverTestCommand({ files: ['a.spec.ts'] }, available());
    expect(parse(res).frameworks.map((f: { name: string }) => f.name)).toEqual(['playwright']);
  });

  it('groups multiple files under one framework (command uses the first match)', async () => {
    const res = await handleCanaryDiscoverTestCommand(
      { files: ['a.spec.ts', 'b.spec.ts'] },
      available()
    );
    expect(parse(res).frameworks).toEqual([
      {
        name: 'playwright',
        command: 'npx --yes playwright test a.spec.ts',
        matchedFiles: ['a.spec.ts', 'b.spec.ts'],
      },
    ]);
  });

  it('never throws and defaults to available with a real adapter (env-agnostic)', async () => {
    const res = await handleCanaryDiscoverTestCommand({ files: [] });
    expect(['available', 'degraded']).toContain(parse(res).status);
  });
});
