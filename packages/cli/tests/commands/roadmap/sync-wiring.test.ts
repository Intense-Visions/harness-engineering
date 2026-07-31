import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createRoadmapSyncCommand, buildSyncOptions } from '../../../src/commands/roadmap/sync';
import { createRoadmapCommand } from '../../../src/commands/roadmap/index';

/**
 * Commander wiring for `harness roadmap sync`.
 *
 * `--json` also exists as a ROOT-level global (`harness --json`), which wins the
 * parse and leaves the subcommand-local option undefined. That silently made
 * `harness roadmap sync --json` print prose; these tests pin both positions.
 *
 * Every case runs against an empty temp dir so the command fails fast on "no
 * roadmap found" — the flag plumbing is what is under test, not the sync.
 */

let cwd: string;
let logs: string[];
let errors: string[];
let exitCode: number | undefined;

/** Build a program shaped like the real one: root globals + the roadmap group. */
function program(): Command {
  const p = new Command();
  p.name('harness').option('--json', 'Output as JSON').option('--verbose', 'Verbose output');
  p.addCommand(createRoadmapCommand());
  p.exitOverride();
  return p;
}

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-sync-wiring-'));
  logs = [];
  errors = [];
  exitCode = undefined;
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    logs.push(a.join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    errors.push(a.join(' '));
  });
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exitCode = code;
    throw new Error('process.exit');
  }) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(cwd, { recursive: true, force: true });
});

async function run(...argv: string[]): Promise<void> {
  await expect(program().parseAsync(['node', 'harness', ...argv])).rejects.toThrow('process.exit');
}

describe('harness roadmap sync — registration', () => {
  it('is registered under the roadmap command group', () => {
    const names = createRoadmapCommand().commands.map((c) => c.name());
    expect(names).toContain('sync');
  });

  it('documents all three exit codes in its description', () => {
    const description = createRoadmapSyncCommand().description();
    expect(description).toMatch(/DRY RUN BY DEFAULT/);
    expect(description).toMatch(/0 converged/);
    expect(description).toMatch(/2 error/);
    expect(description).toMatch(/3 ZERO DENOMINATOR/);
  });

  it('exposes every documented flag', () => {
    const flags = createRoadmapSyncCommand()
      .options.map((o) => o.long)
      .filter((f): f is string => Boolean(f));
    expect(flags).toEqual(
      expect.arrayContaining([
        '--cwd',
        '--apply',
        '--no-create',
        '--no-state-change',
        '--force',
        '--json',
      ])
    );
  });
});

describe('buildSyncOptions() — --json resolves at either position', () => {
  it('honours the subcommand-local --json', () => {
    expect(buildSyncOptions({ json: true }, {}).json).toBe(true);
  });

  it('honours the ROOT-level global --json (the position that broke it)', () => {
    expect(buildSyncOptions({}, { json: true }).json).toBe(true);
  });

  it('is false when neither is given', () => {
    expect(buildSyncOptions({}, {}).json).toBe(false);
    expect(buildSyncOptions({}).json).toBe(false);
  });
});

describe('buildSyncOptions() — guard flag mapping', () => {
  it('defaults to dry run with both guards permissive', () => {
    expect(buildSyncOptions({})).toMatchObject({
      apply: false,
      allowCreate: true,
      syncIssueState: true,
      force: false,
    });
  });

  it('maps Commander --no-create / --no-state-change negations', () => {
    // Commander sets these keys to `false` for the `--no-*` forms.
    expect(buildSyncOptions({ create: false, stateChange: false })).toMatchObject({
      allowCreate: false,
      syncIssueState: false,
    });
  });

  it('maps --apply and --force', () => {
    expect(buildSyncOptions({ apply: true, force: true })).toMatchObject({
      apply: true,
      force: true,
    });
  });
});

describe('harness roadmap sync — end-to-end flag plumbing', () => {
  it('exits non-zero and reports on stderr when there is no roadmap source', async () => {
    await run('roadmap', 'sync', '--cwd', cwd);
    expect(exitCode).not.toBe(0);
    expect(errors.join('\n')).toMatch(/No roadmap found/);
    expect(logs.join('\n')).not.toMatch(/Examined/);
  });

  it('accepts the root-level --json without a parse error', async () => {
    await run('--json', 'roadmap', 'sync', '--cwd', cwd);
    expect(exitCode).not.toBe(0);
  });
});
