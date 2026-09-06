/**
 * Shared driver for the two design CLI command layers
 * (`align-design-system`, `design-pipeline`).
 *
 * Both commands are thin action handlers that (a) build an engine input from
 * commander options, (b) render to stdout/stderr, and (c) terminate the
 * process. Exercising that layer honestly needs three things this module
 * supplies:
 *
 *  - a REAL parent `Command` carrying the global flags, because both actions
 *    read `cmd.optsWithGlobals()` — an orphan subcommand would resolve `--json`
 *    and `--cwd` to `undefined` and quietly skip half the branches;
 *  - a `process.exit` stub that THROWS. `process.exit` never returns in
 *    production, so a stub that returns normally would let the align action
 *    fall through from `exit(ERROR)` into `exit(SUCCESS)` and report an exit
 *    code the real CLI can never produce;
 *  - stdout/stderr capture that preserves embedded newlines, since the
 *    renderers emit multi-line strings from a single `console.log`.
 */

import { Command } from 'commander';
import { vi, type MockInstance } from 'vitest';

/** Thrown by the `process.exit` stub so control flow stops where the real one would. */
export class ProcessExitSignal extends Error {
  constructor(readonly code: number | undefined) {
    super(`process.exit(${String(code)})`);
    this.name = 'ProcessExitSignal';
  }
}

// Built from the ESC char code so no control byte appears literally in source.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

function stripAnsi(text: string): string {
  return text.replace(ANSI, '');
}

/** The observable result of driving a command to completion. */
export interface CommandRun {
  /** Code passed to the FIRST `process.exit` call, or `undefined` if never called. */
  exitCode: number | undefined;
  /** Everything written to stdout, ANSI-stripped, joined by newline. */
  stdout: string;
  /** Everything written to stderr, ANSI-stripped, joined by newline. */
  stderr: string;
  /** stdout split into individual physical lines (embedded `\n` expanded). */
  stdoutLines: string[];
}

interface Captured {
  log: MockInstance;
  error: MockInstance;
  exit: MockInstance;
  out: string[];
  err: string[];
}

function capture(): Captured {
  const out: string[] = [];
  const err: string[] = [];
  const log = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    out.push(args.map((a) => (typeof a === 'string' ? a : String(a))).join(' '));
  });
  const error = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    err.push(args.map((a) => (typeof a === 'string' ? a : String(a))).join(' '));
  });
  const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new ProcessExitSignal(code);
  }) as never);
  return { log, error, exit, out, err };
}

/**
 * Mount `sub` under a parent that declares the global flags the real
 * `harness` root command declares, then run it with `argv`.
 *
 * `argv` is the SUBCOMMAND's argv — the subcommand name is prepended here.
 * Global flags must precede it, exactly as on the real CLI:
 *   `run(cmd, ['--json'], ['--dry-run'])`
 */
export async function runCommand(
  sub: Command,
  globalArgv: string[],
  subArgv: string[]
): Promise<CommandRun> {
  const parent = new Command('harness')
    .option('--json', 'JSON output')
    .option('--quiet', 'quiet output')
    .option('--verbose', 'verbose output')
    .option('--cwd <path>', 'working directory');
  parent.addCommand(sub);
  // exitOverride on BOTH: without it a commander parse error (typo'd flag,
  // missing argument) calls process.exit, which the stub below turns into a
  // ProcessExitSignal — indistinguishable from the action's own exit. A
  // malformed test argv would then read as a legitimate exit-code assertion.
  parent.exitOverride();
  sub.exitOverride();
  const silence = { writeOut: () => {}, writeErr: () => {} };
  parent.configureOutput(silence);
  sub.configureOutput(silence);

  const cap = capture();
  let exitCode: number | undefined;
  try {
    await parent.parseAsync([...globalArgv, sub.name(), ...subArgv], { from: 'user' });
  } catch (err) {
    if (!(err instanceof ProcessExitSignal)) throw err;
    exitCode = err.code;
  } finally {
    cap.log.mockRestore();
    cap.error.mockRestore();
    cap.exit.mockRestore();
  }

  const stdout = stripAnsi(cap.out.join('\n'));
  return {
    exitCode,
    stdout,
    stderr: stripAnsi(cap.err.join('\n')),
    stdoutLines: stdout.split('\n'),
  };
}

/** Assert stdout parses as JSON and return it. Fails loudly with the raw text otherwise. */
export function parseJsonStdout(run: CommandRun): unknown {
  try {
    return JSON.parse(run.stdout);
  } catch {
    throw new Error(`stdout was not valid JSON:\n${run.stdout}`);
  }
}
