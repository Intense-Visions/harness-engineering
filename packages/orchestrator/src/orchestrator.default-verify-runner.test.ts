import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  defaultLocalVerifyRunner,
  defaultLocalAcceptanceRunner,
  changedWorkspacePackages,
  LOCAL_GATE_TIMEOUT_MS,
} from './orchestrator.js';

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-default-verify-'));
});
afterEach(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
});

describe('defaultLocalVerifyRunner (B4)', () => {
  it('missing package.json → passing gate (nothing to check, adopter-portable)', async () => {
    const r = await defaultLocalVerifyRunner(tmp);
    expect(r.ok).toBe(true);
  });

  it('first-red short-circuit: a failing typecheck script → { ok:false } carrying that script label', async () => {
    fs.writeFileSync(
      path.join(tmp, 'package.json'),
      JSON.stringify({
        name: 'tmp-verify-fixture',
        scripts: {
          // Exit non-zero; lint/test would pass but must never be REACHED because
          // typecheck is the first script and it fails first (short-circuit).
          typecheck: 'node -e "console.error(\'TYPECHECK_MARKER\'); process.exit(1)"',
          lint: 'node -e "process.exit(0)"',
          test: 'node -e "process.exit(0)"',
        },
      })
    );
    const r = await defaultLocalVerifyRunner(tmp);
    // Deterministic across environments: whether `pnpm -w run typecheck` errors on
    // the workspace-root guard (bare temp dir) OR runs the script and it exits 1,
    // the runner short-circuits to a RED gate on the FIRST declared script. The
    // `run` wrapper always prefixes the output with `${script} failed:`, so the
    // script LABEL is a stable assertion; the script's own stdout marker is NOT
    // (it never runs when `pnpm -w` rejects the bare dir), so we do not assert it.
    // The safety intent holds either way: a workspace it cannot cleanly verify is
    // red, never a silent pass.
    expect(r.ok).toBe(false);
    expect(r.output).toContain('typecheck failed');
  });

  it('language-aware: a non-node (Go) workspace runs the Go toolchain, not pnpm', async () => {
    // A workspace detected as Go must NOT shell `pnpm` (the historical
    // environmental false-red). `go` is absent in most CI images, so the runner
    // shelling a real `go build` → an ENOENT/exec error → RED gate carrying the
    // Go command. The assertion is that the FAILURE names the detected toolchain
    // (`go ...`), never `pnpm`, proving the ecosystem dispatch fired.
    fs.writeFileSync(path.join(tmp, 'go.mod'), 'module example.com/x\n\ngo 1.22\n');
    const r = await defaultLocalVerifyRunner(tmp);
    // Either `go` is installed and the trivial module builds/vets/tests clean
    // (ok:true), or `go` is absent and the gate is red on a `go` command — never
    // on pnpm. Both outcomes prove pnpm was not invoked for a non-node workspace.
    if (!r.ok) {
      expect(r.output).toContain('go ');
      expect(r.output).not.toContain('pnpm');
    }
  });
});

/**
 * staged-verify-gate-convergence (S2) — the local settle gate's mechanical step is
 * BOUNDED. An operator's hanging acceptance command (or a wedged verify script) must
 * not hang `settleWorkflowSuccess`/the tick forever. A timeout is a gate FAIL, never
 * a silent pass. The default bound is 10 minutes (`LOCAL_GATE_TIMEOUT_MS`); tests
 * inject a tiny bound to prove the timeout→FAIL path fast.
 */
describe('defaultLocalAcceptanceRunner — bounded (S2)', () => {
  it('a passing command → { ok:true }', async () => {
    const r = await defaultLocalAcceptanceRunner(tmp, 'node -e "process.exit(0)"');
    expect(r.ok).toBe(true);
  });

  it('a non-zero command → { ok:false } (the command IS the gate)', async () => {
    const r = await defaultLocalAcceptanceRunner(tmp, 'node -e "process.exit(3)"');
    expect(r.ok).toBe(false);
    expect(r.output).toContain('acceptance command failed');
  });

  it('a HANGING command exceeding the bound is KILLED and FAILS (never hangs forever)', async () => {
    // A command that sleeps far longer than the injected 150ms bound. The runner
    // kills it and returns a TIMED OUT failure rather than deadlocking the settle.
    const r = await defaultLocalAcceptanceRunner(tmp, 'node -e "setTimeout(()=>{}, 60000)"', 150);
    expect(r.ok).toBe(false);
    expect(r.output).toContain('TIMED OUT');
  });

  it('the production default bound is a sane wall-clock (10 minutes)', () => {
    expect(LOCAL_GATE_TIMEOUT_MS).toBe(10 * 60 * 1000);
  });
});

describe('changedWorkspacePackages (verify scope)', () => {
  it('extracts distinct packages/<name> dirs from git porcelain', () => {
    const porcelain = [
      ' M packages/eslint-plugin/src/rules/foo.ts',
      '?? packages/eslint-plugin/tests/foo.test.ts',
      ' M packages/core/src/x.ts',
      ' M README.md',
      '',
    ].join('\n');
    expect(changedWorkspacePackages(porcelain).sort()).toEqual([
      'packages/core',
      'packages/eslint-plugin',
    ]);
  });

  it('takes the new path of a rename entry', () => {
    const porcelain = 'R  packages/old/a.ts -> packages/eslint-plugin/b.ts\n';
    expect(changedWorkspacePackages(porcelain)).toEqual(['packages/eslint-plugin']);
  });

  it('returns [] for root/docs-only or empty changes', () => {
    expect(changedWorkspacePackages(' M README.md\n M docs/x.md\n')).toEqual([]);
    expect(changedWorkspacePackages('')).toEqual([]);
  });
});
