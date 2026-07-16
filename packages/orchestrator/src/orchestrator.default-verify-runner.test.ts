import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { defaultLocalVerifyRunner, changedWorkspacePackages } from './orchestrator.js';

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
