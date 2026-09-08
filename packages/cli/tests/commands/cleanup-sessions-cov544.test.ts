import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createCleanupSessionsCommand } from '../../src/commands/cleanup-sessions';
import { ExitCode } from '../../src/utils/errors';

const exitSentinel = new Error('__exit__');
const STALE = 30 * 60 * 60 * 1000; // >24h
const FRESH = 1 * 60 * 60 * 1000;

describe('cleanup-sessions command action (cov544)', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let logs: string[];
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-cov-'));
    logs = [];
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw exitSentinel;
    }) as never);
    logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      logs.push(a.join(' '));
    });
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  function writeAged(relDir: string, name: string, ageMs: number, dir = false): void {
    const full = path.join(tmpDir, '.harness', relDir, name);
    const t = new Date(Date.now() - ageMs);
    if (dir) {
      fs.mkdirSync(full, { recursive: true });
      const inner = path.join(full, 'f.json');
      fs.writeFileSync(inner, 'x');
      // Backdate the inner entry AND the dir — getMostRecentMtime takes the max.
      fs.utimesSync(inner, t, t);
    } else {
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, 'x');
    }
    fs.utimesSync(full, t, t);
  }

  async function run(globalFlags: string[], subArgs: string[]): Promise<number | undefined> {
    const p = new Command();
    p.exitOverride();
    p.option('--json');
    p.addCommand(createCleanupSessionsCommand());
    try {
      await p.parseAsync(['cleanup-sessions', ...globalFlags, ...subArgs], { from: 'user' });
    } catch (e) {
      if (e !== exitSentinel) throw e;
    }
    return exitSpy.mock.calls.at(-1)?.[0] as number | undefined;
  }

  it('sessions-only sweep: prints "No sessions found." when nothing exists (exit 0)', async () => {
    fs.mkdirSync(path.join(tmpDir, '.harness', 'sessions'), { recursive: true });
    const code = await run([], ['--path', tmpDir]);
    expect(logs.join('\n')).toContain('No sessions found.');
    expect(code).toBe(ExitCode.SUCCESS);
  });

  it('sessions-only dry-run lists stale + kept without deleting', async () => {
    writeAged('sessions', 'stale-session', STALE, true);
    writeAged('sessions', 'fresh-session', FRESH, true);
    const code = await run([], ['--path', tmpDir, '--dry-run']);
    const out = logs.join('\n');
    expect(out).toContain('Stale (would remove)');
    expect(out).toContain('stale-session');
    expect(out).toContain('Kept');
    expect(out).toContain('fresh-session');
    expect(fs.existsSync(path.join(tmpDir, '.harness', 'sessions', 'stale-session'))).toBe(true);
    expect(code).toBe(ExitCode.SUCCESS);
  });

  it('sessions-only real sweep deletes stale and prints the cleaned count', async () => {
    writeAged('sessions', 'stale-session', STALE, true);
    const code = await run([], ['--path', tmpDir]);
    expect(logs.join('\n')).toContain('Cleaned up 1 stale session(s).');
    expect(fs.existsSync(path.join(tmpDir, '.harness', 'sessions', 'stale-session'))).toBe(false);
    expect(code).toBe(ExitCode.SUCCESS);
  });

  it('sessions-only sweep honors --json global output', async () => {
    writeAged('sessions', 'stale-session', STALE, true);
    const code = await run(['--json'], ['--path', tmpDir, '--dry-run']);
    const parsed = JSON.parse(logs.join('\n'));
    expect(parsed.removed).toContain('stale-session');
    expect(parsed.dryRun).toBe(true);
    expect(code).toBe(ExitCode.SUCCESS);
  });

  it('extended --all sweep prints per-target lines including "(no entries)"', async () => {
    writeAged('cache', 'old.json', 10 * 24 * 60 * 60 * 1000);
    const code = await run([], ['--path', tmpDir, '--all', '--dry-run']);
    const out = logs.join('\n');
    expect(out).toContain('[cleanup]');
    expect(out).toContain('cache');
    // Some registered targets have no dir at all → "(no entries)" branch.
    expect(out).toContain('(no entries)');
    expect(out).toContain('would remove');
    expect(code).toBe(ExitCode.SUCCESS);
  });

  it('extended --include restricts targets and deletes when not dry-run', async () => {
    writeAged('cache', 'old.json', 10 * 24 * 60 * 60 * 1000);
    const code = await run([], ['--path', tmpDir, '--include', 'cache']);
    const out = logs.join('\n');
    expect(out).toContain('cache');
    expect(out).toContain('removed');
    expect(fs.existsSync(path.join(tmpDir, '.harness', 'cache', 'old.json'))).toBe(false);
    expect(code).toBe(ExitCode.SUCCESS);
  });

  it('extended --exclude skips a target', async () => {
    writeAged('cache', 'old.json', 10 * 24 * 60 * 60 * 1000);
    const code = await run([], ['--path', tmpDir, '--exclude', 'sessions', '--dry-run']);
    // sessions excluded; cache still swept.
    expect(logs.join('\n')).toContain('cache');
    expect(code).toBe(ExitCode.SUCCESS);
  });

  it('extended --all honors --json output', async () => {
    writeAged('cache', 'old.json', 10 * 24 * 60 * 60 * 1000);
    const code = await run(['--json'], ['--path', tmpDir, '--all', '--dry-run']);
    const parsed = JSON.parse(logs.join('\n'));
    expect(Array.isArray(parsed.results)).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(code).toBe(ExitCode.SUCCESS);
  });
});
