/**
 * Local test harness for the craft CLI command layer
 * (`packages/cli/src/commands/{copy,test,security,naming,spec}-craft.ts`).
 *
 * Every craft command shares the same shell: a Commander subcommand whose
 * action reads `optsWithGlobals()`, resolves an output mode, delegates to an
 * engine, renders, and terminates the process with a tier-derived exit code.
 * Driving that shell needs three things the tests should not each re-derive:
 *
 *   1. A parent `Command` carrying the global flags (`--json`, `--verbose`,
 *      `--quiet`, `--cwd`) so `optsWithGlobals()` resolves the way it does
 *      under the real `harness` program.
 *   2. `process.exit` turned into a throw, so the exit code becomes an
 *      assertable value instead of killing the vitest worker.
 *   3. Captured stdout/stderr, ANSI-stripped, so assertions read the text a
 *      user would actually see.
 *
 * Deliberately local to tests/commands/ — it encodes the craft command shell,
 * not a repo-wide convention, and must not be promoted into a shared helper
 * without a second consumer family asking for it.
 */

import { Command } from 'commander';
import { vi } from 'vitest';

/** Thrown in place of terminating the worker when the command calls `process.exit`. */
export class ProcessExitCalled extends Error {
  constructor(readonly code: number) {
    super(`process.exit(${code})`);
    this.name = 'ProcessExitCalled';
  }
}

export interface CraftRunResult {
  /**
   * The code passed to `process.exit`, or `undefined` if the action returned
   * without exiting. Every craft command exits on every path, so `undefined`
   * is itself a contract violation worth asserting against.
   */
  exitCode: number | undefined;
  /** ANSI-stripped `console.log` lines, in emission order, newlines split out. */
  stdout: string[];
  /** ANSI-stripped `console.error` lines (where `logger.error` writes). */
  stderr: string[];
  /** stdout re-joined with newlines — convenient for whole-report assertions. */
  stdoutText: string;
  /** stderr re-joined with newlines. */
  stderrText: string;
}

// eslint-disable-next-line no-control-regex -- stripping ANSI SGR sequences requires the ESC literal
const ANSI = /\[[0-9;]*m/g;

function renderConsoleArgs(args: unknown[]): string {
  return args
    .map((a) => (typeof a === 'string' ? a : String(a)))
    .join(' ')
    .replace(ANSI, '');
}

export interface RunCraftCommandOptions {
  /** Global flags placed before the subcommand name, e.g. `['--json']`. */
  globalArgs?: string[];
  /** Subcommand arguments, e.g. `['--max-files', '7']`. */
  args?: string[];
}

/**
 * Run a craft subcommand end-to-end through Commander and report what a user
 * would observe: the exit code, stdout, and stderr.
 *
 * The subcommand is mounted under a parent program that declares the real
 * global flags, so `cmd.optsWithGlobals()` inside the action sees them exactly
 * as it does in production.
 */
export async function runCraftCommand(
  command: Command,
  options: RunCraftCommandOptions = {}
): Promise<CraftRunResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];

  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    stdout.push(...renderConsoleArgs(args).split('\n'));
  });
  const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    stderr.push(...renderConsoleArgs(args).split('\n'));
  });
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new ProcessExitCalled(code ?? 0);
  }) as never);

  const program = new Command('harness')
    .option('--json', 'Output as JSON')
    .option('--quiet', 'Minimal output')
    .option('--verbose', 'Verbose output')
    .option('--cwd <path>', 'Working directory')
    .exitOverride();
  program.addCommand(command);

  const argv = [...(options.globalArgs ?? []), command.name(), ...(options.args ?? [])];

  let exitCode: number | undefined;
  try {
    await program.parseAsync(argv, { from: 'user' });
  } catch (err) {
    if (err instanceof ProcessExitCalled) {
      exitCode = err.code;
    } else {
      throw err;
    }
  } finally {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  }

  return {
    exitCode,
    stdout,
    stderr,
    stdoutText: stdout.join('\n'),
    stderrText: stderr.join('\n'),
  };
}

/**
 * Shared `llmCalls` block. Every craft summary carries the same shape and the
 * printers all render `count` and `costUsd.toFixed(4)`.
 */
export function llmCalls(overrides: Partial<{ count: number; costUsd: number }> = {}): {
  provider: string;
  model: string;
  count: number;
  costUsd: number;
} {
  return {
    provider: 'mock',
    model: 'mock-model',
    count: 4,
    costUsd: 0.1234,
    ...overrides,
  };
}
