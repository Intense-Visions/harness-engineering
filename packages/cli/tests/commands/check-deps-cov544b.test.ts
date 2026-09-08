import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as path from 'path';
import { createCheckDepsCommand } from '../../src/commands/check-deps';
import { logger } from '../../src/output/logger';

/**
 * Coverage for the `check-deps` commander action (`runCheckDepsAction`) — the
 * output-mode branches, the error/exit paths, and the findings-json contract —
 * which the existing sibling test (pure `runCheckDeps` only) never drives.
 */
describe('check-deps command action (cov544b)', () => {
  const fixtures = path.join(__dirname, '../fixtures');
  const noLayers = path.join(fixtures, 'deps-no-layers');
  const firstPartyCycle = path.join(fixtures, 'deps-first-party-cycle');
  const emptyLayers = path.join(fixtures, 'deps-empty-layers');

  let logs: string[];
  let errs: string[];
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let loggerErrSpy: ReturnType<typeof vi.spyOn>;
  let exitCode: number | null;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logs = [];
    errs = [];
    logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      logs.push(a.map(String).join(' '));
    });
    errSpy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      errs.push(a.map(String).join(' '));
    });
    loggerErrSpy = vi.spyOn(logger, 'error').mockImplementation((m: string) => {
      errs.push(m);
    });
    exitCode = null;
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((c?: number) => {
      exitCode = c ?? 0;
      throw new Error(`__exit__:${exitCode}`);
    }) as never);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    loggerErrSpy.mockRestore();
    exitSpy.mockRestore();
  });

  async function run(globals: string[], configDir: string | null, localAfter: string[] = []) {
    // The action does not thread a `cwd` into runCheckDeps, so rootDir is
    // resolved against process.cwd(); point it at the fixture so discovery
    // (and therefore cycle detection) actually sees the fixture's modules.
    const cwdSpy = configDir ? vi.spyOn(process, 'cwd').mockReturnValue(configDir) : null;
    const program = new Command();
    program.option('--config <path>');
    program.option('--json');
    program.option('--verbose');
    program.option('--quiet');
    program.addCommand(createCheckDepsCommand());
    const args = [...globals];
    if (configDir) args.push('--config', path.join(configDir, 'harness.config.json'));
    args.push('check-deps', ...localAfter);
    try {
      await program.parseAsync(args, { from: 'user' });
    } catch (e) {
      if (!(e instanceof Error) || !e.message.startsWith('__exit__')) throw e;
    } finally {
      cwdSpy?.mockRestore();
    }
  }

  it('TEXT mode on a clean project prints the module denominator and exits 0', async () => {
    await run([], noLayers);
    expect(exitCode).toBe(0);
    // No layers => modulesAnalyzed 0, layersConfigured 0, but the denominator
    // line is still printed in human-facing modes.
    expect(logs.join('\n')).toContain('Analyzed 0 module(s) across 0 layer(s).');
  });

  it('VERBOSE mode also prints the denominator line', async () => {
    await run(['--verbose'], noLayers);
    expect(exitCode).toBe(0);
    expect(logs.join('\n')).toContain('Analyzed');
  });

  it('JSON mode does NOT print the human denominator line', async () => {
    await run(['--json'], noLayers);
    expect(exitCode).toBe(0);
    expect(logs.join('\n')).not.toContain('Analyzed 0 module(s)');
  });

  it('QUIET mode on a clean project still exits 0', async () => {
    await run(['--quiet'], noLayers);
    expect(exitCode).toBe(0);
  });

  it('fails (exit 1) and reports a circular dependency issue for a first-party cycle', async () => {
    await run([], firstPartyCycle);
    expect(exitCode).toBe(1);
    expect(logs.join('\n')).toContain('Analyzed');
  });

  it('surfaces the zero-module abstention note as an issue (exit 1)', async () => {
    await run([], emptyLayers);
    expect(exitCode).toBe(1);
    // analysisNote is pushed into issues and rendered
    const out = logs.join('\n');
    expect(out).toMatch(/refusing to report clean/i);
  });

  it('emits the findings-json contract line when --findings-json is set', async () => {
    await run([], firstPartyCycle, ['--findings-json']);
    expect(exitCode).toBe(1);
    const contractLine = logs.find((l) => l.includes('"findings"'));
    expect(contractLine).toBeDefined();
    expect(contractLine).toContain('check-deps');
  });

  it('error path (unresolvable config) logs via logger.error in TEXT mode and exits with the error code', async () => {
    const program = new Command();
    program.option('--config <path>');
    program.addCommand(createCheckDepsCommand());
    try {
      await program.parseAsync(
        ['--config', path.join(fixtures, 'does-not-exist', 'harness.config.json'), 'check-deps'],
        { from: 'user' }
      );
    } catch (e) {
      if (!(e instanceof Error) || !e.message.startsWith('__exit__')) throw e;
    }
    expect(exitCode).toBe(2); // ExitCode.ERROR
    expect(errs.join('\n').length).toBeGreaterThan(0);
  });

  it('error path in JSON mode prints a JSON {error} envelope', async () => {
    const program = new Command();
    program.option('--config <path>');
    program.option('--json');
    program.addCommand(createCheckDepsCommand());
    try {
      await program.parseAsync(
        [
          '--json',
          '--config',
          path.join(fixtures, 'does-not-exist', 'harness.config.json'),
          'check-deps',
        ],
        { from: 'user' }
      );
    } catch (e) {
      if (!(e instanceof Error) || !e.message.startsWith('__exit__')) throw e;
    }
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
});
