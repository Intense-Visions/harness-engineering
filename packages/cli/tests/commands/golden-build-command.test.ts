/**
 * Command-wiring tests for `harness golden-build`.
 *
 * The runners themselves are covered by `golden-build.test.ts`; this file
 * covers the layer above them — option accumulation, human-readable rendering,
 * and above all the exit-code mapping. `golden-build verify` is a verification
 * gate, so a wrong exit code turns a red gate green in CI without any visible
 * symptom. The runners are mocked so each exit branch can be driven directly.
 */
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { Command } from 'commander';
import type { GoldenSnapshot, GoldenFileChange } from '@harness-engineering/core';
import { ExitCode } from '../../src/utils/errors';
import {
  captureConsole,
  runToExit,
  stubProcessExit,
  type ConsoleCapture,
} from './cli-command-harness';

vi.mock('../../src/commands/golden-build/runners', () => ({
  runGoldenPromote: vi.fn(),
  runGoldenVerify: vi.fn(),
  runGoldenDiff: vi.fn(),
}));

import { createGoldenBuildCommand } from '../../src/commands/golden-build';
import {
  runGoldenPromote,
  runGoldenVerify,
  runGoldenDiff,
} from '../../src/commands/golden-build/runners';

const promoteMock = runGoldenPromote as unknown as Mock;
const verifyMock = runGoldenVerify as unknown as Mock;
const diffMock = runGoldenDiff as unknown as Mock;

/** A root program mirroring `harness`: the real CLI owns `--json`/`--config`. */
function rootProgram(): Command {
  const program = new Command('harness')
    .option('--json', 'Emit machine-readable JSON')
    .option('-c, --config <path>', 'Config file path')
    .exitOverride();
  program.addCommand(createGoldenBuildCommand());
  return program;
}

/**
 * The options object a runner was invoked with. Fails with a readable message
 * when the command never reached the runner at all — otherwise a wiring
 * regression surfaces as "cannot read property of undefined".
 */
function runnerOptions(mock: Mock): { configPath?: string; paths?: string[] } {
  const [firstCall] = mock.mock.calls;
  if (!firstCall) throw new Error('Expected the runner to be invoked, but it never was.');
  return firstCall[0] as { configPath?: string; paths?: string[] };
}

/** Run `harness golden-build <argv...>` and return the requested exit code. */
function run(...argv: string[]): Promise<number> {
  return runToExit(() => rootProgram().parseAsync(argv, { from: 'user' }));
}

const GOLDEN: GoldenSnapshot = {
  version: 1,
  promotedAt: '2026-01-02T03:04:05.000Z',
  commit: 'abc1234',
  branch: 'main',
  files: [],
};

function change(over: Partial<GoldenFileChange> & { path: string }): GoldenFileChange {
  return { status: 'changed', ...over } as GoldenFileChange;
}

function verifyValue(over: {
  clean?: boolean;
  changed?: GoldenFileChange[];
  missing?: GoldenFileChange[];
  added?: GoldenFileChange[];
  golden?: GoldenSnapshot | null;
}) {
  const changed = over.changed ?? [];
  const missing = over.missing ?? [];
  const added = over.added ?? [];
  const clean = over.clean ?? changed.length + missing.length + added.length === 0;
  return {
    clean,
    diff: { clean, changed, missing, added },
    golden: over.golden === undefined ? GOLDEN : over.golden,
  };
}

let out: ConsoleCapture;
let exitStub: { restore(): void };

beforeEach(() => {
  vi.clearAllMocks();
  out = captureConsole();
  exitStub = stubProcessExit();
});

afterEach(() => {
  out.restore();
  exitStub.restore();
});

describe('--path accumulation (collectPath)', () => {
  it('accumulates every repeated --path into one ordered array', async () => {
    promoteMock.mockResolvedValue({
      ok: true,
      value: { changed: true, fileCount: 2, commit: 'c', branch: 'b', manifestPath: 'm' },
    });

    await run('golden-build', 'promote', '--path', 'a.json', '--path', 'b.json');

    expect(runnerOptions(promoteMock).paths).toEqual(['a.json', 'b.json']);
  });

  it('preserves duplicate --path values verbatim rather than de-duplicating them', async () => {
    // The accumulator is a plain append, not a set: `--path a --path b --path a`
    // must survive as three entries so the runner — not the CLI — owns any
    // normalisation of the reference list.
    verifyMock.mockResolvedValue({ ok: true, value: verifyValue({ clean: true }) });

    await run('golden-build', 'verify', '--path', 'a.json', '--path', 'b.json', '--path', 'a.json');

    expect(runnerOptions(verifyMock).paths).toEqual(['a.json', 'b.json', 'a.json']);
  });

  it('passes an empty path list through when --path is never given', async () => {
    verifyMock.mockResolvedValue({ ok: true, value: verifyValue({ clean: true }) });

    await run('golden-build', 'verify');

    expect(runnerOptions(verifyMock).paths).toEqual([]);
  });
});

describe('global option resolution (isJson / --config)', () => {
  it('honours --json when it lands on the root program', async () => {
    verifyMock.mockResolvedValue({ ok: true, value: verifyValue({ clean: true }) });

    await run('--json', 'golden-build', 'verify');

    expect(JSON.parse(out.stdout()).clean).toBe(true);
  });

  it('honours --json when it lands on the subcommand', async () => {
    verifyMock.mockResolvedValue({ ok: true, value: verifyValue({ clean: true }) });

    await run('golden-build', 'verify', '--json');

    expect(JSON.parse(out.stdout()).clean).toBe(true);
  });

  it('forwards the root --config down to the runner as configPath', async () => {
    diffMock.mockResolvedValue({ ok: true, value: verifyValue({ clean: true }) });

    await run('-c', './ci.harness.config.json', 'golden-build', 'diff');

    expect(runnerOptions(diffMock).configPath).toBe('./ci.harness.config.json');
  });
});

describe('human-readable diff rendering (printDiffHuman / shortHash)', () => {
  it('prints the golden provenance line when a golden snapshot is present', async () => {
    verifyMock.mockResolvedValue({ ok: true, value: verifyValue({ clean: true }) });

    await run('golden-build', 'verify');

    expect(out.stdout()).toContain(
      'Golden promoted from abc1234 (main) at 2026-01-02T03:04:05.000Z'
    );
  });

  it('omits the golden provenance line when no snapshot is attached', async () => {
    verifyMock.mockResolvedValue({
      ok: true,
      value: verifyValue({ clean: true, golden: null }),
    });

    await run('golden-build', 'verify');

    expect(out.stdout()).not.toContain('Golden promoted from');
  });

  it('reports a clean tree and skips the per-entry lines entirely', async () => {
    // `diff.clean` short-circuits the renderer, so the (contradictory) entries
    // below must never be printed. This pins the early return, not the message.
    verifyMock.mockResolvedValue({
      ok: true,
      value: {
        clean: true,
        diff: {
          clean: true,
          changed: [change({ path: 'never-printed.json' })],
          missing: [],
          added: [],
        },
        golden: GOLDEN,
      },
    });

    await run('golden-build', 'verify');

    expect(out.stdout()).toContain('Working tree matches the golden build. No drift.');
    expect(out.stdout()).not.toContain('never-printed.json');
  });

  it('renders a changed entry with both hashes truncated to 12 characters', async () => {
    verifyMock.mockResolvedValue({
      ok: true,
      value: verifyValue({
        changed: [
          change({
            path: 'coverage-baselines.json',
            goldenHash: 'aaaaaaaaaaaabbbbbbbbbbbbcccc',
            currentHash: 'ddddddddddddeeeeeeeeeeeeffff',
          }),
        ],
      }),
    });

    await run('golden-build', 'verify');

    expect(out.stdout()).toContain(
      'changed  coverage-baselines.json  aaaaaaaaaaaa -> dddddddddddd'
    );
  });

  it('renders a missing entry with its former hash and an absence note', async () => {
    verifyMock.mockResolvedValue({
      ok: true,
      value: verifyValue({
        missing: [change({ path: 'gone.json', status: 'missing', goldenHash: '0123456789abcdef' })],
      }),
    });

    await run('golden-build', 'verify');

    expect(out.stdout()).toContain('missing  gone.json  (was 0123456789ab, now absent)');
  });

  it('renders an added entry as not-in-golden', async () => {
    verifyMock.mockResolvedValue({
      ok: true,
      value: verifyValue({
        added: [change({ path: 'new.json', status: 'added', currentHash: 'fedcba9876543210' })],
      }),
    });

    await run('golden-build', 'verify');

    expect(out.stdout()).toContain('added    new.json  fedcba987654 (not in golden)');
  });

  it('substitutes an em-dash placeholder for an absent hash', async () => {
    verifyMock.mockResolvedValue({
      ok: true,
      value: verifyValue({
        // A `missing` entry has no currentHash by construction; rendering it
        // through the `changed` template exposes the placeholder branch.
        changed: [change({ path: 'vanished.json', goldenHash: 'aaaaaaaaaaaabbbb' })],
      }),
    });

    await run('golden-build', 'verify');

    expect(out.stdout()).toContain('changed  vanished.json  aaaaaaaaaaaa -> —');
  });

  it('prints one line per entry across all three change categories', async () => {
    verifyMock.mockResolvedValue({
      ok: true,
      value: verifyValue({
        changed: [
          change({ path: 'c1.json', goldenHash: 'g1', currentHash: 'n1' }),
          change({ path: 'c2.json', goldenHash: 'g2', currentHash: 'n2' }),
        ],
        missing: [change({ path: 'm1.json', status: 'missing', goldenHash: 'g3' })],
        added: [change({ path: 'a1.json', status: 'added', currentHash: 'n4' })],
      }),
    });

    await run('golden-build', 'verify');

    const entryLines = out.stdoutLines.filter((l) => /^\S\s+(changed|missing|added)\s/.test(l));
    expect(entryLines).toHaveLength(4);
  });
});

describe('promote exit-code mapping', () => {
  it('exits SUCCESS and names the promoted file count on a changed promote', async () => {
    promoteMock.mockResolvedValue({
      ok: true,
      value: {
        changed: true,
        fileCount: 3,
        commit: 'deadbee',
        branch: 'main',
        manifestPath: '.harness/golden.json',
      },
    });

    const code = await run('golden-build', 'promote');

    expect(code).toBe(ExitCode.SUCCESS);
    expect(out.stdout()).toContain(
      'Golden build promoted: 3 reference file(s) from deadbee (main).'
    );
    expect(out.stdout()).toContain('Manifest written to .harness/golden.json');
  });

  it('reports a byte-stable manifest instead of a promotion on an unchanged promote', async () => {
    promoteMock.mockResolvedValue({
      ok: true,
      value: {
        changed: false,
        fileCount: 3,
        commit: 'deadbee',
        branch: 'main',
        manifestPath: '.harness/golden.json',
      },
    });

    const code = await run('golden-build', 'promote');

    expect(code).toBe(ExitCode.SUCCESS);
    expect(out.stdout()).toContain(
      'Golden build unchanged (fingerprint identical) — manifest left byte-stable.'
    );
    expect(out.stdout()).not.toContain('Golden build promoted');
  });

  it('emits the promote result as JSON instead of prose when --json is set', async () => {
    promoteMock.mockResolvedValue({
      ok: true,
      value: {
        changed: true,
        fileCount: 3,
        commit: 'deadbee',
        branch: 'main',
        manifestPath: '.harness/golden.json',
      },
    });

    const code = await run('golden-build', 'promote', '--json');

    expect(code).toBe(ExitCode.SUCCESS);
    expect(JSON.parse(out.stdout())).toMatchObject({ changed: true, fileCount: 3 });
    expect(out.stdout()).not.toContain('Golden build promoted');
  });

  it('exits with ERROR when the runner reports an unexpected failure', async () => {
    promoteMock.mockResolvedValue({
      ok: false,
      error: { message: 'config unreadable', exitCode: ExitCode.ERROR },
    });

    expect(await run('golden-build', 'promote')).toBe(ExitCode.ERROR);
  });

  it('exits with ZERO_DENOMINATOR when the runner reports one', async () => {
    // Paired with the ERROR case above: two different runner codes reaching the
    // shell prove the command forwards `error.exitCode` rather than collapsing
    // every failure onto one constant.
    promoteMock.mockResolvedValue({
      ok: false,
      error: { message: 'nothing to fingerprint', exitCode: ExitCode.ZERO_DENOMINATOR },
    });

    expect(await run('golden-build', 'promote')).toBe(ExitCode.ZERO_DENOMINATOR);
  });

  it('routes a failure to stderr in human mode', async () => {
    promoteMock.mockResolvedValue({
      ok: false,
      error: { message: 'config unreadable', exitCode: ExitCode.ERROR },
    });

    await run('golden-build', 'promote');

    expect(out.stderr()).toContain('config unreadable');
    expect(out.stdout()).toBe('');
  });

  it('routes a failure to a JSON error envelope on stdout in --json mode', async () => {
    promoteMock.mockResolvedValue({
      ok: false,
      error: { message: 'config unreadable', exitCode: ExitCode.ERROR },
    });

    await run('golden-build', 'promote', '--json');

    expect(JSON.parse(out.stdout())).toEqual({ error: 'config unreadable' });
    expect(out.stderr()).toBe('');
  });
});

describe('verify exit-code mapping', () => {
  it('exits SUCCESS when the working tree matches the golden', async () => {
    verifyMock.mockResolvedValue({ ok: true, value: verifyValue({ clean: true }) });

    expect(await run('golden-build', 'verify')).toBe(ExitCode.SUCCESS);
  });

  it('exits VALIDATION_FAILED when the working tree has drifted', async () => {
    verifyMock.mockResolvedValue({
      ok: true,
      value: verifyValue({
        changed: [change({ path: 'x.json', goldenHash: 'a', currentHash: 'b' })],
      }),
    });

    expect(await run('golden-build', 'verify')).toBe(ExitCode.VALIDATION_FAILED);
  });

  it('forwards the runner error exit code when verification cannot run', async () => {
    verifyMock.mockResolvedValue({
      ok: false,
      error: { message: 'no golden build found', exitCode: ExitCode.ERROR },
    });

    expect(await run('golden-build', 'verify')).toBe(ExitCode.ERROR);
    expect(out.stderr()).toContain('no golden build found');
  });
});

describe('diff exit-code mapping', () => {
  it('exits SUCCESS even when the tree has drifted, because diff is advisory', async () => {
    diffMock.mockResolvedValue({
      ok: true,
      value: verifyValue({
        changed: [change({ path: 'x.json', goldenHash: 'a', currentHash: 'b' })],
      }),
    });

    const code = await run('golden-build', 'diff');

    expect(code).toBe(ExitCode.SUCCESS);
    expect(out.stdout()).toContain('changed  x.json');
  });

  it('suggests promoting instead of rendering a diff when no golden exists', async () => {
    diffMock.mockResolvedValue({
      ok: true,
      value: verifyValue({ clean: true, golden: null }),
    });

    const code = await run('golden-build', 'diff');

    expect(code).toBe(ExitCode.SUCCESS);
    expect(out.stdout()).toContain(
      'No golden build has been promoted yet. Run `harness golden-build promote`.'
    );
    expect(out.stdout()).not.toContain('Working tree matches the golden build');
  });

  it('emits the raw result instead of the hint when --json is set and no golden exists', async () => {
    diffMock.mockResolvedValue({
      ok: true,
      value: verifyValue({ clean: true, golden: null }),
    });

    await run('golden-build', 'diff', '--json');

    expect(JSON.parse(out.stdout()).golden).toBeNull();
    expect(out.stdout()).not.toContain('No golden build has been promoted yet');
  });

  it('forwards the runner error exit code when the diff itself fails', async () => {
    diffMock.mockResolvedValue({
      ok: false,
      error: { message: 'config unreadable', exitCode: ExitCode.ERROR },
    });

    expect(await run('golden-build', 'diff')).toBe(ExitCode.ERROR);
  });
});
