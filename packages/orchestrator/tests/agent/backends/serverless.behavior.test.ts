import { describe, it, expect, vi } from 'vitest';
import { EventEmitter, PassThrough } from 'node:stream';
import { OciServerlessBackend } from '../../../src/agent/backends/serverless.js';

// --- Fake child-process plumbing ----------------------------------------

interface FakeChild extends EventEmitter {
  stdin: PassThrough | { write: (chunk: string) => void; end: () => void };
  stdout: PassThrough;
  stderr: PassThrough;
  exitCode: number | null;
  kill: (signal?: NodeJS.Signals | number) => boolean;
}

function makeFakeChild(): FakeChild {
  const e = new EventEmitter() as FakeChild;
  e.stdin = new PassThrough();
  e.stdout = new PassThrough();
  e.stderr = new PassThrough();
  e.exitCode = null;
  e.kill = vi.fn().mockReturnValue(true);
  return e;
}

type Handler = (child: FakeChild, args: string[]) => void;

function makeSpawnImpl(handlers: Handler[]) {
  const calls: { binary: string; args: string[] }[] = [];
  let idx = 0;
  const impl = ((binary: string, args: readonly string[] = []) => {
    calls.push({ binary, args: [...args] });
    const child = makeFakeChild();
    const handler = handlers[idx++] ?? (() => undefined);
    setTimeout(() => handler(child, [...args]), 0);
    return child as unknown as ReturnType<typeof import('node:child_process').spawn>;
  }) as unknown as typeof import('node:child_process').spawn;
  return { calls, impl };
}

/** Drives an AgentEvent async generator to completion. */
async function drain(
  gen: AsyncGenerator<unknown, unknown, void>
): Promise<{ events: unknown[]; result: unknown }> {
  const events: unknown[] = [];
  let r = await gen.next();
  while (!r.done) {
    events.push(r.value);
    r = await gen.next();
  }
  return { events, result: r.value };
}

/** Cold-start a backend and return the resulting session. */
async function startWith(spawnImpl: typeof import('node:child_process').spawn, config = {}) {
  const b = new OciServerlessBackend({ image: 'agent:1', spawnImpl, ...config });
  const start = await b.startSession({ workspacePath: '/tmp', permissionMode: 'full' });
  return { b, start };
}

const oneShotOk =
  (stdout: string): Handler =>
  (child) => {
    if (stdout) child.stdout.write(stdout);
    child.exitCode = 0;
    child.emit('close', 0);
  };

// --- construction ---------------------------------------------------------

describe('OciServerlessBackend — image validation', () => {
  it('throws when image is empty', () => {
    expect(() => new OciServerlessBackend({ image: '' })).toThrowError(/`image` is required/);
  });

  it('exposes a stable backend name', () => {
    const b = new OciServerlessBackend({ image: 'agent:1' });
    expect(b.name).toBe('serverless:oci');
  });

  it('accepts a plain image with no metacharacters', () => {
    expect(() => new OciServerlessBackend({ image: 'registry.io/agent:2.0' })).not.toThrow();
  });
});

// --- runtime selection ----------------------------------------------------

describe('OciServerlessBackend — runtime selection', () => {
  it("uses 'podman' as the spawn binary when configured", async () => {
    const { impl, calls } = makeSpawnImpl([oneShotOk('cid\n')]);
    const { start } = await startWith(impl, { runtime: 'podman' });
    expect(start.ok).toBe(true);
    expect(calls[0]?.binary).toBe('podman');
  });

  it("defaults to 'docker' as the spawn binary", async () => {
    const { impl, calls } = makeSpawnImpl([oneShotOk('cid\n')]);
    await startWith(impl);
    expect(calls[0]?.binary).toBe('docker');
  });
});

// --- coldStart edge cases -------------------------------------------------

describe('OciServerlessBackend — coldStart edge cases', () => {
  it('returns Err when the runtime prints an empty container id', async () => {
    const { impl } = makeSpawnImpl([oneShotOk('   \n')]);
    const { start } = await startWith(impl);
    expect(start.ok).toBe(false);
    if (!start.ok) expect(start.error.message).toMatch(/empty container id/);
  });

  it('takes only the first whitespace-delimited token as the container id', async () => {
    const { impl } = makeSpawnImpl([
      oneShotOk('abc123 trailing junk\n'),
      oneShotOk(''), // teardown stop
    ]);
    const { b, start } = await startWith(impl);
    expect(start.ok).toBe(true);
    // stopSession runs `stop <id>`; the parsed id must flow through cleanly.
    if (start.ok) {
      const stop = await b.stopSession(start.value);
      expect(stop.ok).toBe(true);
    }
  });

  it("propagates a failed pre-pull when pullPolicy is 'always'", async () => {
    const { impl, calls } = makeSpawnImpl([
      (child) => {
        child.stderr.write('pull denied\n');
        child.exitCode = 1;
        child.emit('close', 1);
      },
    ]);
    const b = new OciServerlessBackend({ image: 'agent:1', pullPolicy: 'always', spawnImpl: impl });
    const start = await b.startSession({ workspacePath: '/tmp', permissionMode: 'full' });
    expect(start.ok).toBe(false);
    // run is never attempted after a failed pull.
    expect(calls.find((c) => c.args[0] === 'run')).toBeUndefined();
    if (!start.ok) expect(start.error.category).toBe('response_error');
  });

  it('assigns a session id namespaced to the backend', async () => {
    const { impl } = makeSpawnImpl([oneShotOk('cid\n')]);
    const { start } = await startWith(impl);
    expect(start.ok).toBe(true);
    if (start.ok) {
      expect(start.value.sessionId).toMatch(/^serverless:oci-session-/);
      expect(start.value.backendName).toBe('serverless:oci');
      expect(start.value.workspacePath).toBe('/tmp');
    }
  });
});

// --- runOneShot failure paths (via startSession) --------------------------

describe('OciServerlessBackend — spawn failure paths', () => {
  it('maps a synchronous spawn throw to agent_not_found', async () => {
    const impl = (() => {
      throw new Error('spawn docker ENOENT');
    }) as unknown as typeof import('node:child_process').spawn;
    const b = new OciServerlessBackend({ image: 'agent:1', spawnImpl: impl });
    const start = await b.startSession({ workspacePath: '/tmp', permissionMode: 'full' });
    expect(start.ok).toBe(false);
    if (!start.ok) {
      expect(start.error.category).toBe('agent_not_found');
      expect(start.error.message).toMatch(/ENOENT/);
    }
  });

  it("maps a child 'error' event to agent_not_found", async () => {
    const { impl } = makeSpawnImpl([
      (child) => {
        child.emit('error', new Error('boom-runtime'));
      },
    ]);
    const b = new OciServerlessBackend({ image: 'agent:1', spawnImpl: impl });
    const start = await b.startSession({ workspacePath: '/tmp', permissionMode: 'full' });
    expect(start.ok).toBe(false);
    if (!start.ok) {
      expect(start.error.category).toBe('agent_not_found');
      expect(start.error.message).toBe('boom-runtime');
    }
  });
});

// --- runTurn: no handle ---------------------------------------------------

describe('OciServerlessBackend — runTurn without a live handle', () => {
  it('returns a failure TurnResult when the session is unknown', async () => {
    const b = new OciServerlessBackend({ image: 'agent:1' });
    const fakeSession = {
      sessionId: 'ghost-123',
      workspacePath: '/tmp',
      backendName: 'serverless:oci',
      startedAt: new Date().toISOString(),
    };
    const { events, result } = await drain(
      b.runTurn(fakeSession, { sessionId: 'ghost-123', prompt: 'hi', isContinuation: false })
    );
    expect(events).toHaveLength(0);
    const r = result as { success: boolean; error?: string; usage: unknown };
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/no serverless handle for session ghost-123/);
    expect(r.usage).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
  });
});

// --- runTurn: streaming happy path ----------------------------------------

describe('OciServerlessBackend — runTurn event streaming', () => {
  it('yields parsed events, captures usage, and reports success on exit 0', async () => {
    const { impl, calls } = makeSpawnImpl([
      oneShotOk('container-xyz\n'), // coldStart
      (child) => {
        child.stdout.write('{"type":"text","content":"hello"}\n');
        child.stdout.write(
          '{"type":"result","usage":{"inputTokens":10,"outputTokens":5,"totalTokens":15}}\n'
        );
        child.stdout.end();
        child.exitCode = 0;
      },
    ]);
    const { b, start } = await startWith(impl);
    expect(start.ok).toBe(true);
    if (!start.ok) return;

    const { events, result } = await drain(
      b.runTurn(start.value, {
        sessionId: start.value.sessionId,
        prompt: 'do work',
        isContinuation: false,
      })
    );
    const evs = events as Array<{ type: string; content?: unknown; sessionId?: string }>;
    expect(evs.map((e) => e.type)).toEqual(['text', 'result']);
    expect(evs[0]?.content).toBe('hello');
    expect(evs[0]?.sessionId).toBe(start.value.sessionId);

    const r = result as { success: boolean; usage: unknown; error?: string };
    expect(r.success).toBe(true);
    expect(r.error).toBeUndefined();
    expect(r.usage).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });

    // exec argv is the second spawn call.
    expect(calls[1]?.args).toEqual(['exec', '-i', 'container-xyz', '/agent']);
  });

  it('marks the turn failed and captures the message on an error event', async () => {
    const { impl } = makeSpawnImpl([
      oneShotOk('cid\n'),
      (child) => {
        child.stdout.write('{"type":"text","content":"partial"}\n');
        child.stdout.write('{"type":"error","content":"model refused"}\n');
        child.stdout.end();
        child.exitCode = 0;
      },
    ]);
    const { b, start } = await startWith(impl);
    if (!start.ok) return;
    const { events, result } = await drain(
      b.runTurn(start.value, {
        sessionId: start.value.sessionId,
        prompt: 'x',
        isContinuation: false,
      })
    );
    expect((events as Array<{ type: string }>).map((e) => e.type)).toEqual(['text', 'error']);
    const r = result as { success: boolean; error?: string };
    expect(r.success).toBe(false);
    expect(r.error).toBe('model refused');
  });

  it('reports a synthetic error when the exec exits non-zero with no error event', async () => {
    const { impl } = makeSpawnImpl([
      oneShotOk('cid\n'),
      (child) => {
        child.stdout.write('{"type":"text","content":"ok"}\n');
        child.stdout.end();
        child.exitCode = 3;
        child.emit('close', 3);
      },
    ]);
    const { b, start } = await startWith(impl);
    if (!start.ok) return;
    const { result } = await drain(
      b.runTurn(start.value, {
        sessionId: start.value.sessionId,
        prompt: 'x',
        isContinuation: false,
      })
    );
    const r = result as { success: boolean; error?: string };
    expect(r.success).toBe(false);
    expect(r.error).toBe('runtime exec exited with code 3');
  });

  it('ignores unparseable, empty, non-object, and typeless NDJSON lines', async () => {
    const { impl } = makeSpawnImpl([
      oneShotOk('cid\n'),
      (child) => {
        child.stdout.write('not-json\n');
        child.stdout.write('\n');
        child.stdout.write('   \n');
        child.stdout.write('123\n'); // valid JSON, not an object
        child.stdout.write('{"no":"type"}\n'); // object without a string type
        child.stdout.write('{"type":"kept"}\n');
        child.stdout.end();
        child.exitCode = 0;
      },
    ]);
    const { b, start } = await startWith(impl);
    if (!start.ok) return;
    const { events, result } = await drain(
      b.runTurn(start.value, {
        sessionId: start.value.sessionId,
        prompt: 'x',
        isContinuation: false,
      })
    );
    expect((events as Array<{ type: string }>).map((e) => e.type)).toEqual(['kept']);
    expect((result as { success: boolean }).success).toBe(true);
  });

  it('carries subtype and drops malformed usage on parsed events', async () => {
    const { impl } = makeSpawnImpl([
      oneShotOk('cid\n'),
      (child) => {
        // usage missing totalTokens -> rejected by isUsage, default usage retained.
        child.stdout.write(
          '{"type":"tool","subtype":"call","usage":{"inputTokens":1,"outputTokens":2}}\n'
        );
        child.stdout.end();
        child.exitCode = 0;
      },
    ]);
    const { b, start } = await startWith(impl);
    if (!start.ok) return;
    const { events, result } = await drain(
      b.runTurn(start.value, {
        sessionId: start.value.sessionId,
        prompt: 'x',
        isContinuation: false,
      })
    );
    const ev = (events as Array<{ subtype?: string; usage?: unknown }>)[0];
    expect(ev?.subtype).toBe('call');
    expect(ev?.usage).toBeUndefined();
    expect((result as { usage: unknown }).usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });
  });

  it('reassembles events split across chunk boundaries and flushes a trailing partial line', async () => {
    const { impl } = makeSpawnImpl([
      oneShotOk('cid\n'),
      (child) => {
        child.stdout.write('{"type":"a"}\n{"type":');
        child.stdout.write('"b"}\n');
        child.stdout.write('{"type":"c"}'); // no trailing newline -> flushed at stream end
        child.stdout.end();
        child.exitCode = 0;
      },
    ]);
    const { b, start } = await startWith(impl);
    if (!start.ok) return;
    const { events } = await drain(
      b.runTurn(start.value, {
        sessionId: start.value.sessionId,
        prompt: 'x',
        isContinuation: false,
      })
    );
    expect((events as Array<{ type: string }>).map((e) => e.type)).toEqual(['a', 'b', 'c']);
  });
});

// --- runTurn: stdin write failure -----------------------------------------

describe('OciServerlessBackend — runTurn stdin failure', () => {
  it('returns a turn failure when writing the prompt to stdin throws', async () => {
    const calls: string[][] = [];
    const impl = ((binary: string, args: readonly string[] = []) => {
      calls.push([...args]);
      const child = makeFakeChild();
      if (args[0] === 'exec') {
        child.stdin = {
          write: () => {
            throw new Error('EPIPE on stdin');
          },
          end: () => undefined,
        };
      } else {
        setTimeout(() => {
          child.stdout.write('cid\n');
          child.exitCode = 0;
          child.emit('close', 0);
        }, 0);
      }
      return child as unknown as ReturnType<typeof import('node:child_process').spawn>;
    }) as unknown as typeof import('node:child_process').spawn;

    const b = new OciServerlessBackend({ image: 'agent:1', spawnImpl: impl });
    const start = await b.startSession({ workspacePath: '/tmp', permissionMode: 'full' });
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const { events, result } = await drain(
      b.runTurn(start.value, {
        sessionId: start.value.sessionId,
        prompt: 'x',
        isContinuation: false,
      })
    );
    expect(events).toHaveLength(0);
    const r = result as { success: boolean; error?: string };
    expect(r.success).toBe(false);
    expect(r.error).toBe('EPIPE on stdin');
  });
});

// --- runTurn: per-turn timeout --------------------------------------------

describe('OciServerlessBackend — runTurn timeout', () => {
  it('SIGTERM-kills the exec child when the per-turn timeout elapses', async () => {
    const killed: FakeChild[] = [];
    const { impl } = makeSpawnImpl([
      oneShotOk('cid\n'),
      (child) => {
        // Never end stdout on its own; the timeout must intervene.
        child.kill = vi.fn(() => {
          killed.push(child);
          child.exitCode = 137;
          child.stdout.end(); // let readLines drain so the generator can finish
          return true;
        });
      },
    ]);
    const b = new OciServerlessBackend({ image: 'agent:1', spawnImpl: impl, timeoutMs: 20 });
    const start = await b.startSession({ workspacePath: '/tmp', permissionMode: 'full' });
    if (!start.ok) return;
    const { result } = await drain(
      b.runTurn(start.value, {
        sessionId: start.value.sessionId,
        prompt: 'x',
        isContinuation: false,
      })
    );
    expect(killed).toHaveLength(1);
    expect(killed[0]?.kill).toHaveBeenCalledWith('SIGTERM');
    const r = result as { success: boolean; error?: string };
    expect(r.success).toBe(false);
    expect(r.error).toBe('runtime exec exited with code 137');
  });
});

// --- stopSession / teardown -----------------------------------------------

describe('OciServerlessBackend — stopSession', () => {
  it('is a no-op Ok for an unknown session', async () => {
    const b = new OciServerlessBackend({ image: 'agent:1' });
    const res = await b.stopSession({
      sessionId: 'never-started',
      workspacePath: '/tmp',
      backendName: 'serverless:oci',
      startedAt: new Date().toISOString(),
    });
    expect(res.ok).toBe(true);
  });

  it('tears down via `stop <id>` and forgets the handle', async () => {
    const { impl, calls } = makeSpawnImpl([
      oneShotOk('cid-42\n'), // coldStart
      oneShotOk(''), // stop
    ]);
    const { b, start } = await startWith(impl);
    if (!start.ok) return;
    const stop = await b.stopSession(start.value);
    expect(stop.ok).toBe(true);
    expect(calls[1]?.args).toEqual(['stop', 'cid-42']);

    // Second stop finds no handle -> Ok no-op, no extra spawn.
    const again = await b.stopSession(start.value);
    expect(again.ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it('propagates an Err when `stop` exits non-zero', async () => {
    const { impl } = makeSpawnImpl([
      oneShotOk('cid-9\n'),
      (child) => {
        child.stderr.write('no such container\n');
        child.exitCode = 1;
        child.emit('close', 1);
      },
    ]);
    const { b, start } = await startWith(impl);
    if (!start.ok) return;
    const stop = await b.stopSession(start.value);
    expect(stop.ok).toBe(false);
    if (!stop.ok) expect(stop.error.category).toBe('response_error');
  });
});

// --- healthCheck ----------------------------------------------------------

describe('OciServerlessBackend — healthCheck', () => {
  it('returns Ok(void) when the runtime version probe succeeds', async () => {
    const { impl, calls } = makeSpawnImpl([oneShotOk('24.0.0\n')]);
    const b = new OciServerlessBackend({ image: 'agent:1', spawnImpl: impl });
    const res = await b.healthCheck();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toBeUndefined();
    expect(calls[0]?.args).toEqual(['version', '--format', '{{.Server.Version}}']);
  });

  it('returns Err when the runtime version probe fails', async () => {
    const { impl } = makeSpawnImpl([
      (child) => {
        child.stderr.write('cannot connect to daemon\n');
        child.exitCode = 1;
        child.emit('close', 1);
      },
    ]);
    const b = new OciServerlessBackend({ image: 'agent:1', spawnImpl: impl });
    const res = await b.healthCheck();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.category).toBe('response_error');
  });

  it('reports agent_not_found when the runtime binary cannot be spawned', async () => {
    const impl = (() => {
      throw new Error('spawn podman ENOENT');
    }) as unknown as typeof import('node:child_process').spawn;
    const b = new OciServerlessBackend({ image: 'agent:1', runtime: 'podman', spawnImpl: impl });
    const res = await b.healthCheck();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.category).toBe('agent_not_found');
  });
});
