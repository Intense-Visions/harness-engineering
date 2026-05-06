import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { gitScan, normalizeSince } from './git-scan';

function gitInit(cwd: string) {
  execSync('git init -q', { cwd });
  execSync('git config user.email "t@t" && git config user.name "T"', { cwd, shell: '/bin/bash' });
}
function commit(cwd: string, file: string, content: string, message: string) {
  writeFileSync(join(cwd, file), content);
  execSync(`git add . && git commit -q -m "${message}"`, { cwd, shell: '/bin/bash' });
}

describe('gitScan', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'git-scan-'));
    gitInit(tmp);
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('returns only fix: commits within the lookback window', async () => {
    commit(tmp, 'a.ts', 'a', 'feat: initial');
    commit(tmp, 'b.ts', 'b', 'fix: handle null in parser');
    commit(tmp, 'c.ts', 'c', 'fix(orchestrator): retry logic');
    commit(tmp, 'd.ts', 'd', 'chore: bump version');
    const result = await gitScan({ since: '30d', cwd: tmp });
    expect(result.map((c) => c.subject)).toEqual([
      'fix(orchestrator): retry logic',
      'fix: handle null in parser',
    ]);
  });

  it('reports filesChanged count per commit', async () => {
    mkdirSync(join(tmp, 'src'));
    writeFileSync(join(tmp, 'src/x.ts'), 'x');
    writeFileSync(join(tmp, 'src/y.ts'), 'y');
    execSync('git add . && git commit -q -m "fix: two-file fix"', { cwd: tmp, shell: '/bin/bash' });
    const result = await gitScan({ since: '30d', cwd: tmp });
    expect(result[0]?.filesChanged).toBe(2);
  });

  it('returns empty array on a fresh repo with no fix commits', async () => {
    commit(tmp, 'a.ts', 'a', 'feat: only feature');
    const result = await gitScan({ since: '30d', cwd: tmp });
    expect(result).toEqual([]);
  });
});

describe('normalizeSince', () => {
  it.each([
    ['24h', '24 hours ago'],
    ['7d', '7 days ago'],
    ['4w', '4 weeks ago'],
    ['3mo', '3 months ago'],
    ['1H', '1 hours ago'],
    ['2MO', '2 months ago'],
  ])('converts %p to git --since=%p', (input, expected) => {
    expect(normalizeSince(input)).toBe(expected);
  });

  it.each([['1m'], ['foo'], [''], ['24'], ['h24'], ['7days'], ['1y']])(
    'rejects malformed lookback %p',
    (input) => {
      expect(() => normalizeSince(input)).toThrow(/Invalid lookback/);
    }
  );
});
