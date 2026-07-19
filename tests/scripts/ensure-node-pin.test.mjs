/**
 * Regression test for #910: git hooks ran their gates with whatever `node` was
 * first on the ambient PATH instead of the repo's pinned toolchain, so
 * better-sqlite3 (built against the pin) failed with an opaque ABI mismatch
 * deep inside the test gate on machines whose default node differs from the pin.
 *
 * .husky/ensure-node-pin.sh (sourced by .husky/pre-commit and .husky/pre-push)
 * now resolves the pin, and either continues (pin already active), activates the
 * pin via an available version manager, or fails fast with an actionable message.
 *
 * These tests source the helper with a controlled PATH containing stub `node`
 * and `mise` binaries so the "active version" and "version-manager availability"
 * are injected deterministically. Run with: node --test tests/scripts/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENSURE = join(HERE, '..', '..', '.husky', 'ensure-node-pin.sh');

/** Write an executable POSIX script. */
function writeExec(path, body) {
  writeFileSync(path, body, 'utf8');
  chmodSync(path, 0o755);
}

/**
 * Build an isolated sandbox: a repo root (with .nvmrc / package.json as
 * requested) and a `bin` dir holding a stub `node` (and optionally `mise`) that
 * shadows the real toolchain. Returns paths + a run() that sources the helper.
 */
function makeSandbox({ nvmrc, engines, nodeVersion, mise } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'node-pin-'));
  const bin = join(root, 'bin');
  mkdirSync(bin);
  // Empty NVM_DIR so nvm is never discoverable in these hermetic runs.
  const emptyNvm = join(root, 'no-nvm');
  mkdirSync(emptyNvm);

  if (nvmrc !== undefined) writeFileSync(join(root, '.nvmrc'), nvmrc, 'utf8');
  if (engines !== undefined) {
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'sandbox', engines: { node: engines } }, null, 2),
      'utf8'
    );
  }

  // Stub `node`: prints the injected version for `node --version`.
  writeExec(
    join(bin, 'node'),
    `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "${nodeVersion}"; exit 0; fi\nexit 0\n`
  );

  // Optional stub `mise`: `mise where node@N` prints a fake install dir whose
  // bin/node reports the pinned version, so PATH activation is observable.
  if (mise) {
    const miseNodeDir = join(root, 'mise-node');
    mkdirSync(join(miseNodeDir, 'bin'), { recursive: true });
    writeExec(
      join(miseNodeDir, 'bin', 'node'),
      `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "${mise.installedVersion}"; exit 0; fi\nexit 0\n`
    );
    writeExec(
      join(bin, 'mise'),
      `#!/bin/sh\nif [ "$1" = "where" ]; then printf '%s\\n' "${miseNodeDir}"; exit 0; fi\nexit 0\n`
    );
  }

  const wrapper = join(root, 'run.sh');
  // Mirror how the husky hooks source the helper. On success, prove which node
  // is active afterwards; on fail-fast the helper exits non-zero before this.
  writeExec(wrapper, `#!/bin/sh\nset -e\n. "${ENSURE}"\necho CONTINUED\nnode --version\n`);

  function run() {
    return spawnSync('sh', ['-e', wrapper], {
      encoding: 'utf8',
      env: {
        PATH: `${bin}:/usr/bin:/bin:/usr/local/bin`,
        HARNESS_REPO_ROOT: root,
        NVM_DIR: emptyNvm,
        HOME: emptyNvm,
      },
    });
  }

  return { root, run };
}

test('pin satisfied: active node major matches .nvmrc → continues, no activation', () => {
  const { run } = makeSandbox({ nvmrc: '22\n', nodeVersion: 'v22.9.0' });
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /CONTINUED/);
  assert.match(r.stdout, /v22\.9\.0/);
});

test('mismatch + mise available → activates the pinned toolchain and continues', () => {
  const { run } = makeSandbox({
    nvmrc: '22\n',
    nodeVersion: 'v24.3.0',
    mise: { installedVersion: 'v22.23.1' },
  });
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /CONTINUED/);
  // Proof of activation: after sourcing, `node` resolves to the mise install.
  assert.match(r.stdout, /v22\.23\.1/);
});

test('mismatch + no version manager → fails fast with an actionable message', () => {
  const { run } = makeSandbox({ nvmrc: '22\n', nodeVersion: 'v24.3.0' });
  const r = run();
  assert.notEqual(r.status, 0);
  assert.doesNotMatch(r.stdout, /CONTINUED/); // aborted before the gate
  assert.match(r.stderr, /mismatch/i);
  assert.match(r.stderr, /24/); // names the active version
  assert.match(r.stderr, /22/); // names the required pin
});

test('no .nvmrc: pin falls back to package.json engines floor', () => {
  const { run } = makeSandbox({ engines: '>=22.0.0', nodeVersion: 'v18.0.0' });
  const r = run();
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /22/);
  assert.match(r.stderr, /18/);
});
