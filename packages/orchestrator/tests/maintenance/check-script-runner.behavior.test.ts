import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { CheckScriptDefinition } from '@harness-engineering/types';
import { CheckScriptRunner } from '../../src/maintenance/check-script-runner';

/**
 * Behavior characterization of CheckScriptRunner.run — the AS-IS mapping from a
 * script's real stdout/stderr/exit-code to a CheckScriptResult. Uses real
 * executable shell scripts (no shell -c; execFile spawns them directly) so the
 * exit-code and process-output handling is exercised end-to-end rather than
 * mocked. POSIX-only (skipped on win32; the runner shells out to /bin/sh).
 */

const describeUnix = process.platform === 'win32' ? describe.skip : describe;

let tmpDir: string;

/** Write an executable /bin/sh script into tmpDir and return its absolute path. */
function writeScript(name: string, body: string): string {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  fs.chmodSync(p, 0o755);
  return p;
}

function spec(over: Partial<CheckScriptDefinition> & { path: string }): CheckScriptDefinition {
  return over as CheckScriptDefinition;
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-script-runner-'));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describeUnix('CheckScriptRunner.run — structured JSON envelope', () => {
  it('maps status:ok to passed=true, findings=0, structured populated', async () => {
    const p = writeScript('ok.sh', `echo 'noise line'\necho '{"status":"ok"}'`);
    const runner = new CheckScriptRunner(tmpDir);
    const res = await runner.run(spec({ path: p }));
    expect(res.passed).toBe(true);
    expect(res.findings).toBe(0);
    expect(res.structured?.status).toBe('ok');
    // output is the RAW stdout, including the non-envelope line.
    expect(res.output).toContain('noise line');
    expect(res.output).toContain('{"status":"ok"}');
    expect(res.stderr).toBe('');
  });

  it('maps status:findings with wakeAgent=true to passed=false (dispatch signal)', async () => {
    const p = writeScript(
      'findings-wake.sh',
      `echo '{"status":"findings","findings":4,"wakeAgent":true,"message":"m"}'`
    );
    const res = await new CheckScriptRunner(tmpDir).run(spec({ path: p }));
    expect(res.passed).toBe(false);
    expect(res.findings).toBe(4);
    expect(res.structured?.wakeAgent).toBe(true);
    expect(res.structured?.message).toBe('m');
  });

  it('defaults wakeAgent from findings>0 when omitted (findings>0 => passed=false)', async () => {
    const p = writeScript('findings-nowake.sh', `echo '{"status":"findings","findings":3}'`);
    const res = await new CheckScriptRunner(tmpDir).run(spec({ path: p }));
    expect(res.passed).toBe(false);
    expect(res.findings).toBe(3);
  });

  it('status:findings with explicit findings=0 => wake=false => passed=true', async () => {
    const p = writeScript('findings-zero.sh', `echo '{"status":"findings","findings":0}'`);
    const res = await new CheckScriptRunner(tmpDir).run(spec({ path: p }));
    expect(res.passed).toBe(true);
    expect(res.findings).toBe(0);
  });

  it('status:findings with no findings count defaults findings to 1 and passed=false', async () => {
    const p = writeScript('findings-bare.sh', `echo '{"status":"findings"}'`);
    const res = await new CheckScriptRunner(tmpDir).run(spec({ path: p }));
    expect(res.findings).toBe(1);
    expect(res.passed).toBe(false);
  });

  it('explicit wakeAgent=false overrides positive findings => passed=true', async () => {
    const p = writeScript(
      'findings-suppress.sh',
      `echo '{"status":"findings","findings":5,"wakeAgent":false}'`
    );
    const res = await new CheckScriptRunner(tmpDir).run(spec({ path: p }));
    expect(res.passed).toBe(true);
    expect(res.findings).toBe(5);
  });

  it('maps status:skip to passed=true, findings=0', async () => {
    const p = writeScript('skip.sh', `echo '{"status":"skip","message":"nothing to do"}'`);
    const res = await new CheckScriptRunner(tmpDir).run(spec({ path: p }));
    expect(res.passed).toBe(true);
    expect(res.findings).toBe(0);
    expect(res.structured?.status).toBe('skip');
  });

  it('maps status:error to passed=false, findings>=1 even when exit code is 0', async () => {
    const p = writeScript('error.sh', `echo '{"status":"error","message":"boom"}'\nexit 0`);
    const res = await new CheckScriptRunner(tmpDir).run(spec({ path: p }));
    expect(res.passed).toBe(false);
    expect(res.findings).toBe(1);
    expect(res.structured?.status).toBe('error');
    expect(res.structured?.message).toBe('boom');
  });

  it('structured envelope wins over a non-zero exit code (exit 1 + status:ok => passed=true)', async () => {
    const p = writeScript('ok-but-fail.sh', `echo '{"status":"ok"}'\nexit 1`);
    const res = await new CheckScriptRunner(tmpDir).run(spec({ path: p }));
    expect(res.passed).toBe(true);
    expect(res.findings).toBe(0);
    expect(res.structured?.status).toBe('ok');
  });

  it('captures stderr alongside a structured stdout envelope', async () => {
    const p = writeScript('ok-stderr.sh', `echo 'a warning' 1>&2\necho '{"status":"ok"}'`);
    const res = await new CheckScriptRunner(tmpDir).run(spec({ path: p }));
    expect(res.structured?.status).toBe('ok');
    expect(res.stderr).toContain('a warning');
  });
});

describeUnix('CheckScriptRunner.run — heuristic fallback (no envelope)', () => {
  it('parses a finding count from plain stdout => findings>0 => passed=false', async () => {
    const p = writeScript('heur-count.sh', `echo 'Detected 5 issues in the tree'`);
    const res = await new CheckScriptRunner(tmpDir).run(spec({ path: p }));
    expect(res.structured).toBeNull();
    expect(res.findings).toBe(5);
    expect(res.passed).toBe(false);
  });

  it('plain clean output with exit 0 => findings=0 => passed=true', async () => {
    const p = writeScript('heur-clean.sh', `echo 'everything looks fine'`);
    const res = await new CheckScriptRunner(tmpDir).run(spec({ path: p }));
    expect(res.structured).toBeNull();
    expect(res.findings).toBe(0);
    expect(res.passed).toBe(true);
  });

  it('non-zero exit with no count => exitedAbnormally => findings=1, passed=false', async () => {
    const p = writeScript('heur-fail.sh', `echo 'ran but broke'\nexit 2`);
    const res = await new CheckScriptRunner(tmpDir).run(spec({ path: p }));
    expect(res.structured).toBeNull();
    expect(res.findings).toBe(1);
    expect(res.passed).toBe(false);
  });

  it('reads a finding count out of stderr (combined stdout+stderr)', async () => {
    const p = writeScript('heur-stderr.sh', `echo '2 errors found' 1>&2\nexit 1`);
    const res = await new CheckScriptRunner(tmpDir).run(spec({ path: p }));
    expect(res.structured).toBeNull();
    expect(res.findings).toBe(2);
    expect(res.passed).toBe(false);
    expect(res.stderr).toContain('2 errors found');
  });

  it('a parsed count of 0 with a clean exit still passes', async () => {
    const p = writeScript('heur-zero.sh', `echo '0 issues found'`);
    const res = await new CheckScriptRunner(tmpDir).run(spec({ path: p }));
    expect(res.findings).toBe(0);
    expect(res.passed).toBe(true);
  });
});

describeUnix('CheckScriptRunner.run — parseStdoutJson flag', () => {
  it('parseStdoutJson=false ignores a valid envelope and falls back to heuristic', async () => {
    const p = writeScript('json-off.sh', `echo '{"status":"findings","findings":9}'`);
    const res = await new CheckScriptRunner(tmpDir).run(spec({ path: p, parseStdoutJson: false }));
    // envelope ignored -> structured null; the JSON text has no "<n> findings"
    // pattern, so the heuristic sees 0 findings and a clean exit.
    expect(res.structured).toBeNull();
    expect(res.findings).toBe(0);
    expect(res.passed).toBe(true);
  });

  it('parseStdoutJson=true (default) honors the envelope', async () => {
    const p = writeScript('json-on.sh', `echo '{"status":"findings","findings":9}'`);
    const res = await new CheckScriptRunner(tmpDir).run(spec({ path: p, parseStdoutJson: true }));
    expect(res.structured?.status).toBe('findings');
    expect(res.findings).toBe(9);
  });
});

describeUnix('CheckScriptRunner.run — path resolution, args, cwd override', () => {
  it('resolves a project-root-relative path against the runner cwd', async () => {
    writeScript('relative.sh', `echo '{"status":"ok"}'`);
    const runner = new CheckScriptRunner(tmpDir);
    const res = await runner.run(spec({ path: 'relative.sh' }));
    expect(res.structured?.status).toBe('ok');
    expect(res.passed).toBe(true);
  });

  it('the per-call cwd argument overrides the constructor cwd for relative paths', async () => {
    writeScript('relative2.sh', `echo '{"status":"ok"}'`);
    // Constructor cwd is bogus; the call-site cwd is the real tmpDir.
    const runner = new CheckScriptRunner(path.join(os.tmpdir(), 'does-not-exist-xyz'));
    const res = await runner.run(spec({ path: 'relative2.sh' }), tmpDir);
    expect(res.structured?.status).toBe('ok');
  });

  it('passes args verbatim to the executable', async () => {
    const p = writeScript('echo-args.sh', `echo "arg1=$1 arg2=$2"\necho '{"status":"ok"}'`);
    const res = await new CheckScriptRunner(tmpDir).run(
      spec({ path: p, args: ['alpha', 'beta gamma'] })
    );
    expect(res.output).toContain('arg1=alpha arg2=beta gamma');
    expect(res.structured?.status).toBe('ok');
  });
});

describeUnix('CheckScriptRunner.run — spawn failure & timeout', () => {
  it('a missing executable is caught => findings=1, passed=false, empty streams', async () => {
    const missing = path.join(tmpDir, 'nope-does-not-exist.sh');
    const res = await new CheckScriptRunner(tmpDir).run(spec({ path: missing }));
    expect(res.structured).toBeNull();
    expect(res.findings).toBe(1);
    expect(res.passed).toBe(false);
    expect(res.output).toBe('');
  });

  it('a timeout kills the script and is treated as an abnormal exit', async () => {
    const p = writeScript('slow.sh', `sleep 5\necho '{"status":"ok"}'`);
    const res = await new CheckScriptRunner(tmpDir).run(spec({ path: p, timeoutMs: 150 }));
    // Killed before printing the envelope => no structured, abnormal => findings=1.
    expect(res.structured).toBeNull();
    expect(res.findings).toBe(1);
    expect(res.passed).toBe(false);
  });
});
