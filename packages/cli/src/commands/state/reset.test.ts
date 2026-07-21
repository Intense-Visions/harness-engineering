import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import { createResetCommand } from './reset';
import { ExitCode } from '../../utils/errors';

/**
 * Unit contract for `harness state reset`. Pins the CURRENT behavior of the
 * command: confirmation gating (prompt unless `--yes`), routing the reset
 * through `eventSourcing.resetEventLog` with the resolved project path and the
 * chosen stream, and the SUCCESS/ERROR exit codes for the cancel, ok, and
 * failure paths.
 *
 * Fully hermetic: `readline` (the interactive prompt), the core event-sourcing
 * reset, `process.exit`, and console are all stubbed, so there is no real
 * stdin/stdout, filesystem, subprocess, or process exit. Only pure
 * `path.resolve` runs for real -- it is the resolution behavior under test.
 */

const hoisted = vi.hoisted(() => ({
  resetEventLogMock: vi.fn(),
  closeMock: vi.fn(),
  // Mutable so each test can script the prompt answer without re-mocking.
  promptAnswer: { value: 'n' },
}));

vi.mock('@harness-engineering/core', () => ({
  eventSourcing: { resetEventLog: hoisted.resetEventLogMock },
}));

vi.mock('readline', () => ({
  createInterface: () => ({
    question: (_query: string, cb: (answer: string) => void) => cb(hoisted.promptAnswer.value),
    close: hoisted.closeMock,
  }),
}));

/** Sentinel thrown by the mocked `process.exit` so control-flow halts like real exit. */
class ProcessExitError extends Error {
  constructor(public readonly code: number) {
    super(`process.exit(${code})`);
  }
}

let exitSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

/** Drive the command and surface the exit code raised by the stubbed `process.exit`. */
async function run(argv: string[]): Promise<number> {
  const cmd = createResetCommand();
  try {
    await cmd.parseAsync(argv, { from: 'user' });
  } catch (err) {
    if (err instanceof ProcessExitError) return err.code;
    throw err;
  }
  throw new Error('reset command returned without calling process.exit');
}

beforeEach(() => {
  hoisted.resetEventLogMock.mockReset();
  hoisted.closeMock.mockReset();
  hoisted.promptAnswer.value = 'n';
  hoisted.resetEventLogMock.mockResolvedValue({ ok: true, value: undefined });

  exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null) => {
    throw new ProcessExitError(typeof code === 'number' ? code : 0);
  });
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  exitSpy.mockRestore();
  logSpy.mockRestore();
  errorSpy.mockRestore();
});

describe('state reset command', () => {
  it('resets without prompting and exits SUCCESS when --yes is given', async () => {
    const code = await run(['--yes']);

    expect(code).toBe(ExitCode.SUCCESS);
    expect(hoisted.resetEventLogMock).toHaveBeenCalledTimes(1);
    // Default --path '.' resolves against cwd; derive from the same source of truth.
    expect(hoisted.resetEventLogMock).toHaveBeenCalledWith(path.resolve('.'), {
      stream: undefined,
    });
  });

  it('resolves --path and forwards --stream to resetEventLog', async () => {
    const code = await run(['--yes', '--path', 'some/project', '--stream', 'feature-x']);

    expect(code).toBe(ExitCode.SUCCESS);
    expect(hoisted.resetEventLogMock).toHaveBeenCalledWith(path.resolve('some/project'), {
      stream: 'feature-x',
    });
  });

  it('proceeds with the reset when the confirmation prompt is answered yes', async () => {
    hoisted.promptAnswer.value = 'y';

    const code = await run([]);

    expect(code).toBe(ExitCode.SUCCESS);
    expect(hoisted.resetEventLogMock).toHaveBeenCalledTimes(1);
    // Prompt was shown and the readline interface was closed.
    expect(hoisted.closeMock).toHaveBeenCalledTimes(1);
  });

  it('accepts a full "yes" answer as confirmation', async () => {
    hoisted.promptAnswer.value = 'YES';

    const code = await run([]);

    expect(code).toBe(ExitCode.SUCCESS);
    expect(hoisted.resetEventLogMock).toHaveBeenCalledTimes(1);
  });

  it('cancels without resetting when the prompt is declined', async () => {
    hoisted.promptAnswer.value = 'n';

    const code = await run([]);

    expect(code).toBe(ExitCode.SUCCESS);
    expect(hoisted.resetEventLogMock).not.toHaveBeenCalled();
    expect(hoisted.closeMock).toHaveBeenCalledTimes(1);
  });

  it('exits ERROR and does not claim success when resetEventLog fails', async () => {
    hoisted.resetEventLogMock.mockResolvedValue({
      ok: false,
      error: new Error('event log is locked'),
    });

    const code = await run(['--yes']);

    expect(code).toBe(ExitCode.ERROR);
    // The failure was surfaced to stderr, not the success channel.
    expect(errorSpy).toHaveBeenCalled();
  });
});
