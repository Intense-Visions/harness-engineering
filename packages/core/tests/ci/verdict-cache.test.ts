import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { CICheckResult } from '@harness-engineering/types';
import {
  parseVerdictCacheConfig,
  VerdictCache,
  VerdictCacheStatsCollector,
  computeConfigHash,
  computeProjectInputHash,
  computeVerdictKey,
  shouldCacheResult,
  GATE_VERSIONS,
  MEMOIZABLE_CHECKS,
  DEFAULT_VERDICT_CACHE_DIR,
} from '../../src/ci/verdict-cache';
import type { CICheckName } from '@harness-engineering/types';
import { runCIChecks } from '../../src/ci/check-orchestrator';

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const ALL_CHECK_NAMES: readonly CICheckName[] = [
  'validate',
  'deps',
  'docs',
  'entropy',
  'security',
  'perf',
  'phase-gate',
  'arch',
  'traceability',
];
const MEMOIZED_CHECK_NAMES: readonly CICheckName[] = [
  'validate',
  'deps',
  'docs',
  'entropy',
  'security',
  'perf',
];

const passResult: CICheckResult = { name: 'docs', status: 'pass', issues: [], durationMs: 3 };

describe('computeVerdictKey — content-addressed key', () => {
  const base = { check: 'docs' as const, gateVersion: 1, configHash: 'cfg', inputHash: 'inp' };

  it('is deterministic for the same tuple', () => {
    expect(computeVerdictKey(base)).toBe(computeVerdictKey({ ...base }));
  });

  it('changes when any component changes (never a stale hit)', () => {
    const k0 = computeVerdictKey(base);
    expect(computeVerdictKey({ ...base, check: 'deps' })).not.toBe(k0);
    expect(computeVerdictKey({ ...base, gateVersion: 2 })).not.toBe(k0);
    expect(computeVerdictKey({ ...base, configHash: 'other' })).not.toBe(k0);
    expect(computeVerdictKey({ ...base, inputHash: 'other' })).not.toBe(k0);
  });
});

describe('computeConfigHash', () => {
  it('is order-independent over object keys', () => {
    expect(computeConfigHash({ a: 1, b: 2 })).toBe(computeConfigHash({ b: 2, a: 1 }));
  });

  it('changes when a non-cache value changes', () => {
    expect(computeConfigHash({ security: { enabled: true } })).not.toBe(
      computeConfigHash({ security: { enabled: false } })
    );
  });

  it('ignores the cache subtree so toggling the cache does not cold-start other checks', () => {
    const off = computeConfigHash({ name: 'p', cache: { verdicts: { enabled: false } } });
    const on = computeConfigHash({ name: 'p', cache: { verdicts: { enabled: true } } });
    expect(off).toBe(on);
  });
});

describe('parseVerdictCacheConfig', () => {
  it('defaults to disabled with the default dir', () => {
    const cfg = parseVerdictCacheConfig({}, '/root');
    expect(cfg.enabled).toBe(false);
    expect(cfg.dir).toBe(path.join('/root', DEFAULT_VERDICT_CACHE_DIR));
  });

  it('honors enabled + a custom relative dir (resolved against the root)', () => {
    const cfg = parseVerdictCacheConfig(
      { cache: { verdicts: { enabled: true, dir: 'tmp/vc' } } },
      '/root'
    );
    expect(cfg.enabled).toBe(true);
    expect(cfg.dir).toBe(path.join('/root', 'tmp/vc'));
  });

  it('keeps an absolute dir as-is', () => {
    const cfg = parseVerdictCacheConfig(
      { cache: { verdicts: { enabled: true, dir: '/abs/vc' } } },
      '/root'
    );
    expect(cfg.dir).toBe('/abs/vc');
  });
});

describe('computeProjectInputHash — the input closure', () => {
  let root: string;
  beforeEach(() => {
    root = tmpDir('vc-input-');
    fs.writeFileSync(path.join(root, 'a.ts'), 'export const a = 1;');
    fs.writeFileSync(path.join(root, 'README.md'), '# hi');
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const cacheDir = (r: string) => path.join(r, DEFAULT_VERDICT_CACHE_DIR);

  it('is stable across two reads of an unchanged tree', async () => {
    const h1 = await computeProjectInputHash(root, cacheDir(root));
    const h2 = await computeProjectInputHash(root, cacheDir(root));
    expect(h1).toBe(h2);
  });

  it('changes when a closure file changes (→ miss on the next run)', async () => {
    const before = await computeProjectInputHash(root, cacheDir(root));
    fs.writeFileSync(path.join(root, 'a.ts'), 'export const a = 2;');
    const after = await computeProjectInputHash(root, cacheDir(root));
    expect(after).not.toBe(before);
  });

  it('changes when a file is added (membership is part of the closure)', async () => {
    const before = await computeProjectInputHash(root, cacheDir(root));
    fs.writeFileSync(path.join(root, 'b.ts'), 'export const b = 1;');
    const after = await computeProjectInputHash(root, cacheDir(root));
    expect(after).not.toBe(before);
  });

  it('excludes the .harness runtime dir and the cache dir (no self-reference)', async () => {
    const before = await computeProjectInputHash(root, cacheDir(root));
    fs.mkdirSync(path.join(root, '.harness', 'cache', 'verdicts'), { recursive: true });
    fs.writeFileSync(path.join(root, '.harness', 'state.json'), '{"x":1}');
    fs.writeFileSync(path.join(root, '.harness', 'cache', 'verdicts', 'deadbeef.json'), '{"y":2}');
    const after = await computeProjectInputHash(root, cacheDir(root));
    expect(after).toBe(before);
  });
});

describe('VerdictCache store', () => {
  let dir: string;
  beforeEach(() => {
    dir = tmpDir('vc-store-');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('round-trips a stored verdict', () => {
    const cache = new VerdictCache({ enabled: true, dir });
    expect(cache.get('k1')).toBeUndefined();
    cache.set('k1', passResult);
    expect(cache.get('k1')).toEqual(passResult);
  });

  it('returns undefined (a miss) for a corrupt entry instead of throwing', () => {
    const cache = new VerdictCache({ enabled: true, dir });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'bad.json'), 'not json{');
    expect(cache.get('bad')).toBeUndefined();
  });

  it('does not cache a check that threw (transient-error guard)', () => {
    const cache = new VerdictCache({ enabled: true, dir });
    const threw: CICheckResult = {
      name: 'security',
      status: 'fail',
      issues: [{ severity: 'error', message: `Check 'security' threw: boom` }],
      durationMs: 1,
    };
    cache.set('kt', threw);
    expect(cache.get('kt')).toBeUndefined();
  });
});

describe('shouldCacheResult', () => {
  it('is true for a normal pass/fail verdict', () => {
    expect(shouldCacheResult(passResult)).toBe(true);
    expect(
      shouldCacheResult({
        name: 'deps',
        status: 'fail',
        issues: [{ severity: 'error', message: 'layer violation' }],
        durationMs: 2,
      })
    ).toBe(true);
  });

  it('is false when the check threw', () => {
    expect(
      shouldCacheResult({
        name: 'arch',
        status: 'fail',
        issues: [{ severity: 'error', message: `Check 'arch' threw: nope` }],
        durationMs: 2,
      })
    ).toBe(false);
  });
});

describe('VerdictCacheStatsCollector', () => {
  it('counts hits and misses and preserves entry order', () => {
    const c = new VerdictCacheStatsCollector();
    c.record('validate', 'miss', 'a');
    c.record('docs', 'hit', 'b');
    c.record('deps', 'hit', 'c');
    const stats = c.toStats();
    expect(stats).toEqual({
      enabled: true,
      hits: 2,
      misses: 1,
      entries: [
        { check: 'validate', outcome: 'miss', key: 'a' },
        { check: 'docs', outcome: 'hit', key: 'b' },
        { check: 'deps', outcome: 'hit', key: 'c' },
      ],
    });
  });
});

describe('MEMOIZABLE_CHECKS', () => {
  it('excludes checks whose verdict inputs live outside the source closure', () => {
    // traceability reads the .harness graph; arch reads the .harness baseline +
    // allowances and the git base-ref — none covered by the source-tree hash.
    expect(MEMOIZABLE_CHECKS.has('traceability')).toBe(false);
    expect(MEMOIZABLE_CHECKS.has('arch')).toBe(false);
  });

  it('includes the source/config/docs-scanning checks', () => {
    for (const name of MEMOIZED_CHECK_NAMES) {
      expect(MEMOIZABLE_CHECKS.has(name)).toBe(true);
    }
  });
});

describe('GATE_VERSIONS', () => {
  it('declares a version for every check name', () => {
    for (const name of ALL_CHECK_NAMES) {
      expect(GATE_VERSIONS[name]).toBeTypeOf('number');
    }
  });
});

describe('runCIChecks — memoization integration (issue #1639)', () => {
  let root: string;
  const skip = ['entropy', 'security', 'perf', 'arch', 'traceability', 'deps'] as const;
  beforeEach(() => {
    root = tmpDir('vc-run-');
    fs.writeFileSync(path.join(root, 'a.ts'), 'export const a = 1;');
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function cfg(enabled: boolean): Record<string, unknown> {
    return {
      version: 1,
      name: 'tmp',
      cache: { verdicts: { enabled, dir: path.join(root, '.harness/cache/verdicts') } },
    };
  }

  it('misses on the first run and hits on an unchanged second run', async () => {
    const r1 = await runCIChecks({ projectRoot: root, config: cfg(true), skip: [...skip] });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.value.cacheStats).toBeDefined();
    expect(r1.value.cacheStats!.hits).toBe(0);
    expect(r1.value.cacheStats!.misses).toBeGreaterThan(0);

    const r2 = await runCIChecks({ projectRoot: root, config: cfg(true), skip: [...skip] });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    // Every check that missed on run 1 is served from cache on run 2.
    expect(r2.value.cacheStats!.misses).toBe(0);
    expect(r2.value.cacheStats!.hits).toBe(r1.value.cacheStats!.misses);
    // The memoized verdicts are identical to the freshly-computed ones.
    expect(r2.value.checks).toEqual(r1.value.checks);
  });

  it('misses again after a closure file changes (correct-by-construction, no stale hit)', async () => {
    await runCIChecks({ projectRoot: root, config: cfg(true), skip: [...skip] });
    fs.writeFileSync(path.join(root, 'a.ts'), 'export const a = 999;');
    const r = await runCIChecks({ projectRoot: root, config: cfg(true), skip: [...skip] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.cacheStats!.hits).toBe(0);
    expect(r.value.cacheStats!.misses).toBeGreaterThan(0);
  });

  it('never records a non-memoizable check (arch, traceability) in the cache stats', async () => {
    // arch and traceability RUN (not skipped) but must bypass the cache — their
    // verdicts depend on .harness baseline/graph state not covered by the source
    // hash, so caching them could serve a stale verdict.
    const skipRest = ['entropy', 'security', 'perf', 'deps'] as const;
    const r = await runCIChecks({ projectRoot: root, config: cfg(true), skip: [...skipRest] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.checks.some((c) => c.name === 'arch')).toBe(true);
    expect(r.value.checks.some((c) => c.name === 'traceability')).toBe(true);
    expect(r.value.cacheStats!.entries.some((e) => e.check === 'arch')).toBe(false);
    expect(r.value.cacheStats!.entries.some((e) => e.check === 'traceability')).toBe(false);
  });

  it('attaches no cacheStats when the cache is disabled (byte-stable default path)', async () => {
    const r = await runCIChecks({ projectRoot: root, config: cfg(false), skip: [...skip] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.cacheStats).toBeUndefined();
  });
});
