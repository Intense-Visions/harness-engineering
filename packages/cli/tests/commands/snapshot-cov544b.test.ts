import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createSnapshotCommand } from '../../src/commands/snapshot';
import { logger } from '../../src/output/logger';

const stripAnsi = (s: string): string =>
  // eslint-disable-next-line no-control-regex
  s.replace(/\[[0-9;]*m/g, '');

/**
 * Coverage for the snapshot command's error/JSON branches and the
 * trends direction/decimal formatting (directionSymbol improving/declining,
 * formatDelta non-integer) that the existing sibling test does not reach.
 */
describe('snapshot command action (cov544b)', () => {
  let tmpDir: string;
  let logs: string[];
  let warns: string[];
  let errs: string[];
  let exitCode: number | null;
  let spies: Array<{ mockRestore: () => void }>;
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snap-cov-'));
    logs = [];
    warns = [];
    errs = [];
    exitCode = null;
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    spies = [
      cwdSpy,
      vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
        logs.push(a.map(String).join(' '));
      }),
      vi.spyOn(logger, 'warn').mockImplementation((m: string) => warns.push(m)),
      vi.spyOn(logger, 'error').mockImplementation((m: string) => errs.push(m)),
      vi.spyOn(process, 'exit').mockImplementation(((c?: number) => {
        exitCode = c ?? 0;
        throw new Error(`__exit__:${exitCode}`);
      }) as never),
    ];
  });

  afterEach(() => {
    spies.forEach((s) => s.mockRestore());
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function build(): ReturnType<typeof createSnapshotCommand> {
    const cmd = createSnapshotCommand();
    cmd.option('--json', 'JSON output');
    cmd.option('--config <path>', 'Config path');
    return cmd;
  }

  async function run(args: string[]) {
    try {
      await build().parseAsync(args, { from: 'user' });
    } catch (e) {
      if (!(e instanceof Error) || !e.message.startsWith('__exit__')) throw e;
    }
  }

  const makeSnapshot = (
    metrics: Record<string, { value: number; violationCount: number }>,
    hash: string,
    date: string,
    stability: number
  ) => ({
    capturedAt: date,
    commitHash: hash,
    stabilityScore: stability,
    metrics,
  });

  function writeTimeline(snapshots: unknown[]): void {
    const dir = path.join(tmpDir, '.harness', 'arch');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'timeline.json'),
      JSON.stringify({ version: 1, snapshots }, null, 2)
    );
  }

  it('capture error in TEXT mode logs via logger.error and exits with the CLIError code', async () => {
    await run(['--config', path.join(tmpDir, 'nope', 'harness.config.json'), 'capture']);
    expect(exitCode).toBe(2); // ExitCode.ERROR from resolveConfig failure
    expect(errs.join('\n').length).toBeGreaterThan(0);
  });

  it('capture error in JSON mode prints a JSON {error} envelope', async () => {
    await run(['--json', '--config', path.join(tmpDir, 'nope', 'harness.config.json'), 'capture']);
    expect(exitCode).toBe(2);
    const jsonErr = logs.find((l) => {
      try {
        return typeof JSON.parse(l).error === 'string';
      } catch {
        return false;
      }
    });
    expect(jsonErr).toBeDefined();
  });

  it('list --json prints the raw timeline JSON', async () => {
    const metrics = {
      'circular-deps': { value: 0, violationCount: 0 },
      'layer-violations': { value: 0, violationCount: 0 },
      complexity: { value: 0, violationCount: 0 },
      coupling: { value: 0, violationCount: 0 },
      'forbidden-imports': { value: 0, violationCount: 0 },
      'module-size': { value: 0, violationCount: 0 },
      'dependency-depth': { value: 0, violationCount: 0 },
    };
    writeTimeline([makeSnapshot(metrics, 'abc1234', '2026-01-01T00:00:00.000Z', 80)]);
    await run(['--json', 'list']);
    const parsed = JSON.parse(logs.join('\n'));
    expect(parsed.snapshots).toHaveLength(1);
    expect(parsed.snapshots[0].stabilityScore).toBe(80);
  });

  it('trends --json prints the computed trends JSON', async () => {
    const mk = (v: number, s: number, hash: string, date: string) =>
      makeSnapshot(
        {
          'circular-deps': { value: v, violationCount: v },
          'layer-violations': { value: 0, violationCount: 0 },
          complexity: { value: 0, violationCount: 0 },
          coupling: { value: 0, violationCount: 0 },
          'forbidden-imports': { value: 0, violationCount: 0 },
          'module-size': { value: 0, violationCount: 0 },
          'dependency-depth': { value: 0, violationCount: 0 },
        },
        hash,
        date,
        s
      );
    writeTimeline([
      mk(10, 60, 'aaa', '2026-01-01T00:00:00.000Z'),
      mk(2, 80, 'bbb', '2026-02-01T00:00:00.000Z'),
    ]);
    await run(['--json', 'trends']);
    const parsed = JSON.parse(logs.join('\n'));
    expect(parsed.snapshotCount).toBe(2);
    expect(parsed.stability.current).toBe(80);
  });

  it('trends TEXT mode renders improving/declining directions and decimal deltas', async () => {
    const base = {
      'circular-deps': { value: 0, violationCount: 0 },
      'layer-violations': { value: 0, violationCount: 0 },
      'forbidden-imports': { value: 0, violationCount: 0 },
      'dependency-depth': { value: 0, violationCount: 0 },
    };
    const start = {
      ...base,
      complexity: { value: 12.5, violationCount: 12 }, // improves down to 5.25
      coupling: { value: 3.0, violationCount: 3 }, // declines up to 9.5
      'module-size': { value: 4, violationCount: 4 }, // stable
    };
    const end = {
      ...base,
      complexity: { value: 5.25, violationCount: 5 },
      coupling: { value: 9.5, violationCount: 9 },
      'module-size': { value: 4, violationCount: 4 },
    };
    writeTimeline([
      makeSnapshot(start, 'aaa1111', '2026-01-01T00:00:00.000Z', 60),
      makeSnapshot(end, 'bbb2222', '2026-02-01T00:00:00.000Z', 70),
    ]);
    await run(['trends']);
    const out = stripAnsi(logs.join('\n'));
    expect(out).toContain('Architecture Trends');
    expect(out).toContain('improving');
    expect(out).toContain('declining');
    // decimal formatting: complexity current 5.25, and a non-integer delta
    expect(out).toContain('5.25');
  });
});
