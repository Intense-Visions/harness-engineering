import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { EventEmitter, PassThrough } from 'node:stream';
import { execPath } from 'node:process';
import { SshBackend } from '../../../src/agent/backends/ssh.js';
import { OciServerlessBackend } from '../../../src/agent/backends/serverless.js';

// #2298: a child that exits without draining stdin fails the pending write with
// a closed-pipe error, which — without an 'error' listener — is an uncaught
// exception in the orchestrator. These tests drive the REAL spawn (the running
// node binary via `-e`) through the backends' spawnImpl seam. The prompt is
// 8 MiB, larger than any OS pipe buffer, so the write is still pending when the
// child exits and can only end in a closed-pipe error: deterministic.
const BIG = 'x'.repeat(8 * 1024 * 1024);

/** A spawnImpl that ignores the requested binary and runs `node -e <script>`. */
const nodeSpawn = (pick: (args: readonly string[]) => string) =>
  ((_bin: string, args: readonly string[] = [], opts: object = {}) =>
    spawn(execPath, ['-e', pick(args)], opts)) as unknown as typeof spawn;

async function captureUncaught<T>(
  run: () => Promise<T>
): Promise<{ value: T; uncaught: string[] }> {
  const uncaught: string[] = [];
  const onUncaught = (e: Error): void => {
    uncaught.push(String(e));
  };
  process.prependListener('uncaughtException', onUncaught);
  try {
    const value = await run();
    // The exit can land before the stdin error callback; let it surface.
    await new Promise((r) => setTimeout(r, 200));
    return { value, uncaught };
  } finally {
    process.removeListener('uncaughtException', onUncaught);
  }
}

async function drain<R>(gen: AsyncGenerator<unknown, R, void>): Promise<R> {
  let r = await gen.next();
  while (!r.done) r = await gen.next();
  return r.value;
}

describe('SshBackend — remote agent exits without draining stdin (#2298)', () => {
  it('fails the turn with the CHILD exit status and raises no uncaught EPIPE', async () => {
    const b = new SshBackend({
      host: 'gpu.lab',
      remoteCommand: 'agent',
      spawnImpl: nodeSpawn(() => 'process.exit(3)'),
    });
    const session = (await b.startSession({ workspacePath: '/tmp', permissionMode: 'full' }))
      .value!;
    const { value, uncaught } = await captureUncaught(() =>
      drain(
        b.runTurn(session, { sessionId: session.sessionId, prompt: BIG, isContinuation: false })
      )
    );
    expect(uncaught).toEqual([]);
    expect(value.success).toBe(false);
    expect(value.error).toMatch(/exited with code 3/);
  });
});

describe('OciServerlessBackend — container agent exits without draining stdin (#2298)', () => {
  it('fails the turn with the CHILD exit status and raises no uncaught EPIPE', async () => {
    const b = new OciServerlessBackend({
      image: 'agent:1',
      // `run` (cold start) prints a container id; `exec` is the agent that dies early.
      spawnImpl: nodeSpawn((args) =>
        args[0] === 'exec' ? 'process.exit(3)' : 'process.stdout.write("cid\\n")'
      ),
    });
    const start = await b.startSession({ workspacePath: '/tmp', permissionMode: 'full' });
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const { value, uncaught } = await captureUncaught(() =>
      drain(
        b.runTurn(start.value, {
          sessionId: start.value.sessionId,
          prompt: BIG,
          isContinuation: false,
        })
      )
    );
    expect(uncaught).toEqual([]);
    expect(value.success).toBe(false);
    expect(value.error).toMatch(/exited with code 3/);
  });
});

describe('SshBackend — a stdin error that is NOT a closed pipe fails the turn', () => {
  it('surfaces the stdin error even when the child exits 0 (never silenced)', async () => {
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      exitCode: null as number | null,
      kill: () => true,
    });
    const impl = (() => child) as unknown as typeof spawn;
    const b = new SshBackend({ host: 'gpu.lab', remoteCommand: 'agent', spawnImpl: impl });
    const session = (await b.startSession({ workspacePath: '/tmp', permissionMode: 'full' }))
      .value!;
    setTimeout(() => {
      child.stdin.emit('error', Object.assign(new Error('stdin exploded'), { code: 'EACCES' }));
      child.stdout.end();
      child.exitCode = 0;
      child.emit('close', 0);
    }, 0);
    const result = await drain(
      b.runTurn(session, { sessionId: session.sessionId, prompt: 'hi', isContinuation: false })
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('failed writing ssh stdin: stdin exploded');
  });
});
