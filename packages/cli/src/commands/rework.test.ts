import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runReworkCommand } from './rework';

function git(cwd: string, args: string[]) {
  execFileSync('git', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
}
function gitInit(cwd: string) {
  git(cwd, ['init', '-q']);
  git(cwd, ['config', 'user.email', 't@t']);
  git(cwd, ['config', 'user.name', 'T']);
}
function commit(cwd: string, file: string, subject: string) {
  const abs = join(cwd, file);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, `${file}:${subject}`);
  git(cwd, ['add', '-A']);
  git(cwd, ['commit', '-q', '-m', subject]);
}

function captureStdout(): { output: () => string; restore: () => void } {
  let buf = '';
  const spy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk: string | Uint8Array): boolean => {
      buf += typeof chunk === 'string' ? chunk : chunk.toString();
      return true;
    });
  return { output: () => buf, restore: () => spy.mockRestore() };
}

describe('runReworkCommand', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'rework-cmd-'));
    gitInit(tmp);
    process.exitCode = undefined;
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    process.exitCode = undefined;
  });

  it('writes a JSON ReworkReport with resolvedWindow + denominatorLabel + surfaces (AC2)', async () => {
    commit(tmp, 'src/foo.ts', 'feat: add foo');
    commit(tmp, 'src/foo.ts', 'fix: correct foo');

    const cap = captureStdout();
    let report;
    try {
      report = await runReworkCommand({ cwd: tmp, json: true });
    } finally {
      cap.restore();
    }
    const parsed = JSON.parse(cap.output());
    expect(parsed.resolvedWindow).toBe('30 days ago');
    expect(parsed.denominatorLabel).toBe('commits touching the surface within the window');
    expect(Array.isArray(parsed.surfaces)).toBe(true);
    expect(report.surfaces.length).toBeGreaterThan(0);
    expect(process.exitCode).toBeUndefined();
  });

  it('prints a ranked table (highest unplanned rate first) with per-surface denominators', async () => {
    // bar: unplanned fix (rate 0.5). foo: no rework (rate 0). bar should rank first.
    commit(tmp, 'src/foo.ts', 'feat: add foo');
    commit(tmp, 'src/foo.ts', 'chore: tidy foo');
    commit(tmp, 'src/bar.ts', 'feat: add bar');
    commit(tmp, 'src/bar.ts', 'fix: correct bar');

    // Human table renders only for an interactive (TTY) stdout.
    const priorTTY = process.stdout.isTTY;
    process.stdout.isTTY = true;
    const cap = captureStdout();
    try {
      await runReworkCommand({ cwd: tmp });
    } finally {
      cap.restore();
      process.stdout.isTTY = priorTTY;
    }
    const out = cap.output();
    expect(out).toContain('src/bar.ts');
    // Per-surface denominator (commit count) is declared in the row.
    expect(out).toMatch(/src\/bar\.ts[\s\S]*2/);
    // bar (higher unplanned rate) appears before foo.
    expect(out.indexOf('src/bar.ts')).toBeLessThan(out.indexOf('src/foo.ts'));
  });

  it('--top caps printed rows but the JSON report is never truncated', async () => {
    commit(tmp, 'src/foo.ts', 'feat: add foo');
    commit(tmp, 'src/foo.ts', 'fix: correct foo');
    commit(tmp, 'src/bar.ts', 'feat: add bar');
    commit(tmp, 'src/bar.ts', 'fix: correct bar');

    // Human table capped to 1 row (requires an interactive stdout).
    const priorTTY = process.stdout.isTTY;
    process.stdout.isTTY = true;
    const capHuman = captureStdout();
    try {
      await runReworkCommand({ cwd: tmp, top: 1 });
    } finally {
      capHuman.restore();
      process.stdout.isTTY = priorTTY;
    }
    const human = capHuman.output();
    const surfaceRows = (human.match(/src\/(foo|bar)\.ts/g) ?? []).length;
    expect(surfaceRows).toBe(1);

    // JSON is full regardless of --top.
    const capJson = captureStdout();
    let report;
    try {
      report = await runReworkCommand({ cwd: tmp, top: 1, json: true });
    } finally {
      capJson.restore();
    }
    const parsed = JSON.parse(capJson.output());
    expect(parsed.surfaces.length).toBe(2);
    expect(report.surfaces.length).toBe(2);
  });

  it('degrade-safe: non-git directory returns an empty report and exit code 0', async () => {
    const nonGit = mkdtempSync(join(tmpdir(), 'rework-cmd-nongit-'));
    const cap = captureStdout();
    let report;
    try {
      report = await runReworkCommand({ cwd: nonGit, json: true });
    } finally {
      cap.restore();
      rmSync(nonGit, { recursive: true, force: true });
    }
    expect(report.surfaces).toEqual([]);
    expect(report.totalCommitsScanned).toBe(0);
    expect(process.exitCode).toBeUndefined();
  });
});
