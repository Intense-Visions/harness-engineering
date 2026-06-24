import { describe, it, expect } from 'vitest';
import { execPath } from 'node:process';
import { defaultExecFile } from '../../../src/review/ci/orchestrator';

// SUG-4: exercise the REAL defaultExecFile — the only place the child-process
// hazards live (every other test mocks the seam). Hermetic: the "binary" is the
// running node executable driven by `-e` scripts. No network, no real LLM CLI.
const node = (script: string): { command: string; args: string[] } => ({
  command: execPath,
  args: ['-e', script],
});

const baseOpts = { stdin: '', env: process.env };

describe('defaultExecFile — real child-process safety', () => {
  it('exit 0 → resolves with captured stdout', async () => {
    const { command, args } = node('process.stdout.write("hello-out")');
    const { stdout } = await defaultExecFile(command, args, baseOpts);
    expect(stdout).toBe('hello-out');
  });

  it('non-zero exit → rejects', async () => {
    const { command, args } = node('process.exit(3)');
    await expect(defaultExecFile(command, args, baseOpts)).rejects.toThrow(/exited with code 3/);
  });

  it('code===null (process killed) → rejects', async () => {
    // A script that kills itself with SIGKILL: close fires with code===null.
    const { command, args } = node('process.kill(process.pid, "SIGKILL")');
    await expect(defaultExecFile(command, args, baseOpts)).rejects.toThrow(/exited with code/);
  });

  it('timeout → SIGTERM-kills the hung child and rejects (code===null path)', async () => {
    // Hang forever; a low timeout must kill + reject, never block the test.
    const { command, args } = node('setInterval(() => {}, 1000)');
    await expect(defaultExecFile(command, args, { ...baseOpts, timeoutMs: 150 })).rejects.toThrow(
      /exited with code/
    );
  });

  it('stdout exceeds cap → kills child and rejects with a clear "output exceeded" error', async () => {
    // Emit ~200 bytes against a 50-byte cap.
    const { command, args } = node(
      'process.stdout.write("x".repeat(200)); setInterval(() => {}, 1000)'
    );
    await expect(
      defaultExecFile(command, args, { ...baseOpts, maxStdoutBytes: 50 })
    ).rejects.toThrow(/output exceeded 50 bytes/);
  });

  it('stderr tail surfaced in the rejection error on non-zero exit', async () => {
    const { command, args } = node('process.stderr.write("BOOM-stderr-detail"); process.exit(2)');
    await expect(defaultExecFile(command, args, baseOpts)).rejects.toThrow(/BOOM-stderr-detail/);
  });

  it('piped stdin reaches the child', async () => {
    const { command, args } = node(
      'let s = ""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => process.stdout.write("got:" + s))'
    );
    const { stdout } = await defaultExecFile(command, args, {
      ...baseOpts,
      stdin: 'PIPED',
    });
    expect(stdout).toBe('got:PIPED');
  });
});

describe('defaultExecFile — requiredRunnerFailed classification contract', () => {
  // The orchestrator's catch-branch sets requiredRunnerFailed=true whenever the seam
  // REJECTS (proven end-to-end in orchestrator.test.ts SC3). These real-seam cases
  // confirm timeout/oversize/non-zero/killed all REJECT, so each is classified as a
  // runner failure → exitCode 1, never a silent green pass.
  it('every failure mode rejects (the precondition for requiredRunnerFailed)', async () => {
    const cases: Array<[string, { timeoutMs?: number; maxStdoutBytes?: number }]> = [
      ['process.exit(1)', {}], // non-zero
      ['process.kill(process.pid, "SIGKILL")', {}], // code===null (killed)
      ['setInterval(() => {}, 1000)', { timeoutMs: 150 }], // timeout
      [
        'process.stdout.write("y".repeat(100)); setInterval(() => {}, 1000)',
        { maxStdoutBytes: 10 },
      ], // oversize
    ];
    for (const [script, extra] of cases) {
      const { command, args } = node(script);
      await expect(defaultExecFile(command, args, { ...baseOpts, ...extra })).rejects.toThrow();
    }
  });
});
