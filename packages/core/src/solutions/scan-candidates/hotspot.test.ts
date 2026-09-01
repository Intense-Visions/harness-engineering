import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { computeHotspots, computeStableHotspots } from './hotspot';

describe('computeHotspots', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'hotspot-'));
    execSync('git init -q && git config user.email "t@t" && git config user.name "T"', {
      cwd: tmp,
    });
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }));

  it('returns files modified more than threshold times, sorted desc', async () => {
    for (let i = 0; i < 5; i++) {
      writeFileSync(join(tmp, 'hot.ts'), `// v${i}`);
      execSync(`git add . && git commit -q -m "edit ${i}"`, { cwd: tmp });
    }
    writeFileSync(join(tmp, 'cold.ts'), 'x');
    execSync('git add . && git commit -q -m "cold"', { cwd: tmp });

    const result = await computeHotspots({ since: '30d', cwd: tmp, threshold: 2 });
    expect(result[0]?.path).toBe('hot.ts');
    expect(result[0]?.churn).toBe(5);
    expect(result.find((r) => r.path === 'cold.ts')).toBeUndefined();
  });

  it('returns empty list on empty repo', async () => {
    const result = await computeHotspots({ since: '30d', cwd: tmp, threshold: 1 });
    expect(result).toEqual([]);
  });
});

describe('computeStableHotspots', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'stable-hotspot-'));
    execSync('git init -q && git config user.email "t@t" && git config user.name "T"', {
      cwd: tmp,
    });
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }));

  it('gates the churn ranking over two adjacent windows and carries the report', async () => {
    for (let i = 0; i < 4; i++) {
      writeFileSync(join(tmp, 'hot.ts'), `// v${i}`);
      execSync(`git add . && git commit -q -m "edit ${i}"`, { cwd: tmp });
    }
    const result = await computeStableHotspots({ cwd: tmp, threshold: 2, window: '30d' });
    // The report always names both window definitions and a correlation.
    expect(result.report.windows.primary).toBe('most recent 30d');
    expect(result.report.windows.secondary).toBe('preceding 30d');
    expect(typeof result.report.correlation).toBe('number');
    // Exactly one of ordered / tiers is populated.
    expect((result.ordered === null) !== (result.tiers === null)).toBe(true);
  });

  it('returns an empty, unstable ranking on an empty repo', async () => {
    const result = await computeStableHotspots({ cwd: tmp, threshold: 1, window: '30d' });
    expect(result.report.stable).toBe(false);
    expect(result.report.sampleSize).toBe(0);
  });

  it('rejects a malformed window', async () => {
    await expect(
      computeStableHotspots({ cwd: tmp, threshold: 1, window: 'garbage' })
    ).rejects.toThrow(/Invalid (window|lookback)/);
  });
});
