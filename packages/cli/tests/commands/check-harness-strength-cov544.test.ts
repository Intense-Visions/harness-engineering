import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as path from 'path';
import { createCheckHarnessStrengthCommand } from '../../src/commands/check-harness-strength';
import { ExitCode } from '../../src/utils/errors';

const WEAK = path.join(__dirname, '../fixtures/harness-strength-weak');
const CLEAN_HARNESS = path.join(__dirname, '../fixtures/harness-strength-clean');

const exitSentinel = new Error('__exit__');

describe('check-harness-strength action (cov544)', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let logs: string[];
  let origCwd: string;

  beforeEach(() => {
    origCwd = process.cwd();
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
    process.chdir(origCwd);
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  /** Run the subcommand under a parent that owns the given global flags. */
  async function run(globalFlags: string[], subArgs: string[]): Promise<number | undefined> {
    const p = new Command();
    p.exitOverride();
    p.option('--json');
    p.option('--quiet');
    p.option('--verbose');
    p.addCommand(createCheckHarnessStrengthCommand());
    const argv = ['check-harness-strength', ...globalFlags, ...subArgs];
    try {
      await p.parseAsync(argv, { from: 'user' });
    } catch (e) {
      if (e !== exitSentinel) throw e;
    }
    return exitSpy.mock.calls.at(-1)?.[0] as number | undefined;
  }

  it('preAction rejects an invalid severity with ExitCode.ERROR', async () => {
    const code = await run([], ['--severity', 'bogus']);
    expect(code).toBe(ExitCode.ERROR);
  });

  it('preAction rejects an invalid mode with ExitCode.ERROR', async () => {
    const code = await run([], ['--mode', 'nonsense']);
    expect(code).toBe(ExitCode.ERROR);
  });

  it('TEXT mode on the weak fixture prints header/findings/coverage and gates (exit 1)', async () => {
    process.chdir(WEAK);
    const code = await run([], []);
    const out = logs.join('\n');
    expect(out).toContain('harness strength');
    expect(out).toContain('findings');
    expect(out).toContain('coverage');
    expect(out).toContain('not evaluated');
    expect(code).toBe(ExitCode.VALIDATION_FAILED);
  });

  it('JSON mode emits a parseable AuditResult and gates (exit 1)', async () => {
    process.chdir(WEAK);
    const code = await run(['--json'], []);
    const parsed = JSON.parse(logs.join('\n'));
    expect(typeof parsed.score).toBe('number');
    expect(parsed.mode).toBeDefined();
    expect(code).toBe(ExitCode.VALIDATION_FAILED);
  });

  it('--report-only forces exit 0 even with surviving findings (JSON path)', async () => {
    process.chdir(WEAK);
    const code = await run(['--json'], ['--report-only']);
    expect(code).toBe(ExitCode.SUCCESS);
  });

  it('QUIET mode suppresses the skipped-pattern listing but still gates (exit 1)', async () => {
    process.chdir(WEAK);
    const code = await run(['--quiet'], []);
    expect(logs.join('\n')).not.toContain('not evaluated');
    expect(code).toBe(ExitCode.VALIDATION_FAILED);
  });

  it('VERBOSE mode renders and gates on the weak fixture (exit 1)', async () => {
    process.chdir(WEAK);
    const code = await run(['--verbose'], []);
    expect(code).toBe(ExitCode.VALIDATION_FAILED);
  });

  it('passes the gate (exit 0) on the clean harness fixture in TEXT mode', async () => {
    process.chdir(CLEAN_HARNESS);
    const code = await run([], []);
    expect(code).toBe(ExitCode.SUCCESS);
  });

  it('honors the --adopter shortcut (resolvedMode) on the clean fixture', async () => {
    process.chdir(CLEAN_HARNESS);
    const code = await run([], ['--adopter']);
    expect(code).toBe(ExitCode.SUCCESS);
  });

  it('honors an explicit --mode adopter on the clean fixture', async () => {
    process.chdir(CLEAN_HARNESS);
    const code = await run([], ['--mode', 'adopter']);
    expect(code).toBe(ExitCode.SUCCESS);
  });

  it('honors the --toolkit shortcut against the weak fixture', async () => {
    process.chdir(WEAK);
    const code = await run([], ['--toolkit']);
    expect([ExitCode.SUCCESS, ExitCode.VALIDATION_FAILED]).toContain(code);
  });
});
