import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { computeHotspots } from './hotspot';

describe('computeHotspots', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'hotspot-'));
    execSync('git init -q && git config user.email "t@t" && git config user.name "T"', {
      cwd: tmp,
    });
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

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
  }, 30_000);

  it('returns empty list on empty repo', async () => {
    const result = await computeHotspots({ since: '30d', cwd: tmp, threshold: 1 });
    expect(result).toEqual([]);
  });
});
