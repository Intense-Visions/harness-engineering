import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PassThrough } from 'node:stream';

import { guardChildStdin, runProcess } from './helpers';

// #2356: `scan` (and the usage fallback) never read stdin, so the child can exit
// before the parent's stdin write flushes. The pending write then fails with a
// closed-pipe error (EPIPE on POSIX; ECONNRESET/EOF on win32). With no 'error'
// listener on child.stdin that error escapes as an uncaught exception and vitest
// reds a run whose every test passed.
//
// 8 MiB cannot fit in any OS pipe buffer, so when the child exits without reading
// the write is still pending and can only complete with a closed-pipe error. That
// makes the trigger deterministic rather than a race against the child's exit.
const BIG = 'x'.repeat(8 * 1024 * 1024);

describe('runProcess — child exits without draining stdin (#2356)', () => {
  const uncaught: Error[] = [];
  const onUncaught = (e: Error): void => {
    uncaught.push(e);
  };

  beforeEach(() => {
    uncaught.length = 0;
    process.prependListener('uncaughtException', onUncaught);
  });

  afterEach(() => {
    process.removeListener('uncaughtException', onUncaught);
  });

  // The child's 'close' can win the race against the stdin error emission; give
  // the destroyed socket's error time to land before asserting on `uncaught`.
  const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 200));

  it('positive control: the undrained write really does fail with a closed-pipe error', async () => {
    const { spawn } = await import('node:child_process');
    const child = spawn(process.execPath, ['-e', 'process.exit(0)'], {
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    const code = await new Promise<string | undefined>((resolve) => {
      child.stdin.on('error', (e: NodeJS.ErrnoException) => resolve(e.code));
      child.stdin.end(BIG, (err?: NodeJS.ErrnoException | null) =>
        resolve(err ? err.code : undefined)
      );
    });
    expect(['EPIPE', 'ECONNRESET', 'EOF']).toContain(code);
  });

  it('resolves with the exit code and output, and raises no uncaught exception', async () => {
    const result = await runProcess(
      process.execPath,
      ['-e', 'process.stdout.write("early"); process.exit(0)'],
      process.env,
      BIG
    );
    await settle();
    expect(uncaught.map(String)).toEqual([]);
    expect(result).toEqual({ stdout: 'early', stderr: '', code: 0 });
  });

  it('still reports a non-zero exit — the exit status decides, not the pipe', async () => {
    const result = await runProcess(process.execPath, ['-e', 'process.exit(3)'], process.env, BIG);
    await settle();
    expect(uncaught.map(String)).toEqual([]);
    expect(result.code).toBe(3);
  });
});

describe('guardChildStdin — only a closed pipe is tolerated (#2356)', () => {
  it.each(['EPIPE', 'ECONNRESET', 'EOF', 'ERR_STREAM_DESTROYED'])('ignores %s', (code) => {
    const stdin = new PassThrough();
    const forwarded: Error[] = [];
    guardChildStdin(stdin, (e) => forwarded.push(e));
    stdin.emit('error', Object.assign(new Error(code), { code }));
    expect(forwarded).toEqual([]);
  });

  it('forwards any other stdin error so the run still fails', () => {
    const stdin = new PassThrough();
    const forwarded: Error[] = [];
    guardChildStdin(stdin, (e) => forwarded.push(e));
    const boom = Object.assign(new Error('stdin exploded'), { code: 'EACCES' });
    stdin.emit('error', boom);
    expect(forwarded).toEqual([boom]);
  });
});
