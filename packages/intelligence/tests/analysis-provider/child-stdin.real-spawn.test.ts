import { describe, it, expect } from 'vitest';
import { execPath } from 'node:process';
import { z } from 'zod';
import { GenericCliAnalysisProvider } from '../../src/analysis-provider/generic-cli.js';
import { ClaudeCliAnalysisProvider } from '../../src/analysis-provider/claude-cli.js';
import { isClosedPipeError } from '../../src/analysis-provider/child-stdin.js';

// #2298: a child that exits without draining stdin makes the pending write fail
// with a closed-pipe error. These tests spawn REAL children (the running node
// binary via `-e`, no child_process mock) so the pipe behaviour is the OS's own.
// 8 MiB exceeds every OS pipe buffer, so the write is still pending when the
// child exits and can only end in a closed-pipe error — deterministic, not a race.
const BIG = 'x'.repeat(8 * 1024 * 1024);

async function captureUncaught(
  run: () => Promise<unknown>
): Promise<{ settled: unknown; uncaught: string[] }> {
  const uncaught: string[] = [];
  const onUncaught = (e: Error): void => {
    uncaught.push(String(e));
  };
  process.prependListener('uncaughtException', onUncaught);
  try {
    let settled: unknown;
    try {
      settled = await run();
    } catch (e) {
      settled = e;
    }
    // The child's exit can land before the stdin error callback; let it surface.
    await new Promise((r) => setTimeout(r, 200));
    return { settled, uncaught };
  } finally {
    process.removeListener('uncaughtException', onUncaught);
  }
}

const schema = z.object({ ok: z.boolean() });

describe('GenericCliAnalysisProvider — child exits without draining stdin (#2298)', () => {
  const provider = (script: string) =>
    new GenericCliAnalysisProvider({
      command: execPath,
      argTemplate: () => ({ args: ['-e', script], stdin: BIG }),
    });

  it('non-zero exit rejects with the CHILD status and no uncaught EPIPE', async () => {
    const { settled, uncaught } = await captureUncaught(() =>
      provider('process.exit(3)').analyze({ prompt: 'p', responseSchema: schema })
    );
    expect(uncaught).toEqual([]);
    expect(String(settled)).toMatch(/exited with code 3/);
  });

  it('zero exit still resolves from stdout — the exit status decides, not the pipe', async () => {
    const { settled, uncaught } = await captureUncaught(() =>
      provider('process.stdout.write(JSON.stringify({ ok: true })); process.exit(0)').analyze({
        prompt: 'p',
        responseSchema: schema,
      })
    );
    expect(uncaught).toEqual([]);
    expect(settled).toMatchObject({ result: { ok: true } });
  });
});

describe('ClaudeCliAnalysisProvider stream-json transport — undrained stdin (#2298)', () => {
  // runClaudeStream is the only claude-cli path that writes a payload; drive it
  // directly with a node `-e` "CLI" so the real spawn + pipe are exercised.
  type StreamRunner = { runClaudeStream(args: string[], payload: string): Promise<unknown> };
  const stream = (script: string) =>
    (
      new ClaudeCliAnalysisProvider({ command: execPath }) as unknown as StreamRunner
    ).runClaudeStream(['-e', script], BIG);

  it('non-zero exit rejects with the CHILD status and no uncaught EPIPE', async () => {
    const { settled, uncaught } = await captureUncaught(() => stream('process.exit(3)'));
    expect(uncaught).toEqual([]);
    expect(String(settled)).toMatch(/exited with code 3/);
  });
});

describe('isClosedPipeError', () => {
  it('classifies the closed-pipe codes as benign and anything else as a real failure', () => {
    const err = (code: string) => Object.assign(new Error(code), { code });
    for (const c of ['EPIPE', 'ECONNRESET', 'EOF', 'ERR_STREAM_DESTROYED']) {
      expect(isClosedPipeError(err(c))).toBe(true);
    }
    for (const c of ['EACCES', 'EBADF', 'ENOMEM']) {
      expect(isClosedPipeError(err(c))).toBe(false);
    }
    expect(isClosedPipeError(new Error('no code'))).toBe(false);
  });
});
