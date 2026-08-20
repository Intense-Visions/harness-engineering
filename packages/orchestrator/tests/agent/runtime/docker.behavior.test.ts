import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
import { DockerRuntime } from '../../../src/agent/runtime/docker';

// Mock child_process. execFile backs dockerExec (start/create/rm/info);
// spawn backs execInContainer's streaming child process.
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
}));

import { execFile, spawn } from 'node:child_process';

/**
 * Build a fake spawned child that mimics node:child_process behavior enough
 * for execInContainer: a real Readable for stdout (readline consumes it) plus
 * an `exitCode` field and an `exit` event.
 */
function makeChild(opts: {
  lines?: string[];
  exitCode?: number | null;
  exitEventCode?: number | null;
}) {
  const { lines = [], exitCode = null, exitEventCode = 0 } = opts;
  const stdout = Readable.from(lines);
  const child: any = {
    stdout,
    exitCode,
    on(event: string, cb: (code: number | null) => void) {
      if (event === 'exit') {
        // Emit after the microtask queue so stream consumption finishes first.
        setImmediate(() => cb(exitEventCode));
      }
      return child;
    },
  };
  return child;
}

/** Drive the async generator to completion, collecting yields and the return. */
async function drain(gen: AsyncGenerator<string, number, void>) {
  const yielded: string[] = [];
  let step = await gen.next();
  while (!step.done) {
    yielded.push(step.value);
    step = await gen.next();
  }
  return { yielded, returned: step.value };
}

const HANDLE = { containerId: 'container-xyz', runtime: 'docker' as const };

describe('DockerRuntime.execInContainer (behavior characterization)', () => {
  let runtime: DockerRuntime;

  beforeEach(() => {
    vi.clearAllMocks();
    runtime = new DockerRuntime();
    // Default: docker start (via execFile) succeeds.
    vi.mocked(execFile).mockImplementation((_cmd: any, _args: any, cb: any) => {
      cb(null, '', '');
      return {} as any;
    });
  });

  it('yields each stdout line in order and returns the exit code from the exit event', async () => {
    vi.mocked(spawn).mockReturnValue(
      makeChild({ lines: ['first line\nsecond line\nthird line\n'], exitEventCode: 0 })
    );

    const { yielded, returned } = await drain(runtime.execInContainer(HANDLE, ['echo', 'hi']));

    expect(yielded).toEqual(['first line', 'second line', 'third line']);
    expect(returned).toBe(0);
  });

  it('returns a non-zero exit code surfaced by the exit event', async () => {
    vi.mocked(spawn).mockReturnValue(makeChild({ lines: ['boom\n'], exitEventCode: 2 }));

    const { yielded, returned } = await drain(runtime.execInContainer(HANDLE, ['false']));

    expect(yielded).toEqual(['boom']);
    expect(returned).toBe(2);
  });

  it('coerces a null exit-event code to 1 (current AS-IS fallback)', async () => {
    vi.mocked(spawn).mockReturnValue(makeChild({ lines: [], exitEventCode: null }));

    const { yielded, returned } = await drain(runtime.execInContainer(HANDLE, ['noop']));

    expect(yielded).toEqual([]);
    expect(returned).toBe(1);
  });

  it('resolves immediately from child.exitCode when already set (no exit event needed)', async () => {
    // exitCode already known -> code path that does NOT wait on the exit event.
    const child = makeChild({ lines: ['done\n'], exitCode: 0 });
    // Guard: if code incorrectly registered an exit listener, it would throw here.
    child.on = () => {
      throw new Error('should not register exit listener when exitCode is known');
    };
    vi.mocked(spawn).mockReturnValue(child);

    const { yielded, returned } = await drain(runtime.execInContainer(HANDLE, ['true']));

    expect(yielded).toEqual(['done']);
    expect(returned).toBe(0);
  });

  it('starts the container before exec and builds base exec args with containerId then cmd', async () => {
    vi.mocked(spawn).mockReturnValue(makeChild({ lines: [], exitEventCode: 0 }));

    await drain(runtime.execInContainer(HANDLE, ['ls', '-la']));

    // docker start ran via execFile
    expect(execFile).toHaveBeenCalledWith(
      'docker',
      ['start', 'container-xyz'],
      expect.any(Function)
    );

    // exec args: ['exec', <containerId>, ...cmd] with no cwd/env flags
    const spawnArgs = vi.mocked(spawn).mock.calls[0]![1] as string[];
    expect(spawnArgs[0]).toBe('exec');
    expect(spawnArgs).toEqual(['exec', 'container-xyz', 'ls', '-la']);
    expect(vi.mocked(spawn).mock.calls[0]![0]).toBe('docker');
  });

  it('injects -w cwd and --env pairs into exec args when opts provided', async () => {
    vi.mocked(spawn).mockReturnValue(makeChild({ lines: [], exitEventCode: 0 }));

    await drain(
      runtime.execInContainer(HANDLE, ['env'], {
        cwd: '/workspace/sub',
        env: { FOO: 'bar', BAZ: 'qux' },
      })
    );

    const spawnArgs = vi.mocked(spawn).mock.calls[0]![1] as string[];

    // cwd flag
    const wIdx = spawnArgs.indexOf('-w');
    expect(wIdx).toBeGreaterThan(-1);
    expect(spawnArgs[wIdx + 1]).toBe('/workspace/sub');

    // env pairs
    expect(spawnArgs).toContain('--env');
    expect(spawnArgs).toContain('FOO=bar');
    expect(spawnArgs).toContain('BAZ=qux');

    // command + containerId still present, cmd last
    expect(spawnArgs).toContain('container-xyz');
    expect(spawnArgs[spawnArgs.length - 1]).toBe('env');
  });

  it('swallows a docker start failure and still execs, streams, and returns the exit code', async () => {
    // start fails (container already running / transient) -> caught and ignored.
    vi.mocked(execFile).mockImplementation((_cmd: any, _args: any, cb: any) => {
      cb(new Error('container already started'));
      return {} as any;
    });
    vi.mocked(spawn).mockReturnValue(makeChild({ lines: ['still ran\n'], exitEventCode: 0 }));

    const { yielded, returned } = await drain(runtime.execInContainer(HANDLE, ['echo', 'x']));

    expect(yielded).toEqual(['still ran']);
    expect(returned).toBe(0);
    // exec still spawned despite start error
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});

describe('DockerRuntime.createContainer (additional flag characterization)', () => {
  let runtime: DockerRuntime;

  beforeEach(() => {
    vi.clearAllMocks();
    runtime = new DockerRuntime();
  });

  it('appends `sleep infinity` and the image last-before-command in create args', async () => {
    vi.mocked(execFile).mockImplementation((_cmd: any, _args: any, cb: any) => {
      cb(null, 'newid\n', '');
      return {} as any;
    });

    const result = await runtime.createContainer({
      image: 'alpine:3.20',
      workspacePath: '/ws',
      readOnly: false,
      user: '0:0',
      network: 'none',
      env: {},
    });

    expect(result.ok).toBe(true);
    const args = vi.mocked(execFile).mock.calls[0]![1] as string[];
    // image immediately precedes the keep-alive command
    const imageIdx = args.indexOf('alpine:3.20');
    expect(imageIdx).toBeGreaterThan(-1);
    expect(args[imageIdx + 1]).toBe('sleep');
    expect(args[imageIdx + 2]).toBe('infinity');
    // trimmed container id returned
    if (result.ok) expect(result.value.containerId).toBe('newid');
  });

  it('emits an --env pair for every env entry', async () => {
    vi.mocked(execFile).mockImplementation((_cmd: any, _args: any, cb: any) => {
      cb(null, 'id2\n', '');
      return {} as any;
    });

    await runtime.createContainer({
      image: 'node:22-slim',
      workspacePath: '/ws',
      readOnly: true,
      user: '1000:1000',
      network: 'host',
      env: { A: '1', B: '2' },
    });

    const args = vi.mocked(execFile).mock.calls[0]![1] as string[];
    expect(args).toContain('A=1');
    expect(args).toContain('B=2');
    const envCount = args.filter((a) => a === '--env').length;
    expect(envCount).toBe(2);
  });
});
