import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// #2059 — the package manifest advertises BOTH a CommonJS (`require`) and an ESM
// (`import`) entry. Before the fix the CJS entry could not be loaded at all:
// `ink` (the deprecated TUI renderer) was required at module top level, and ink
// pulls in `yoga-wasm-web`, whose top-level `await` makes `require()` throw
// ERR_REQUIRE_ASYNC_MODULE on Node 22. These tests load the BUILT artifacts the
// manifest points at, in a fresh `node` process, exactly as a consumer would —
// importing from src/ here would pass with the defect present.
//
// `turbo test` depends on `build`, so dist/ is fresh in CI and on pre-push. When
// dist/ is missing the test FAILS rather than skips: a skip would read as a pass.

const pkgDir = path.resolve(__dirname, '../..');
const manifest = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8')) as {
  main: string;
  exports: { '.': { require: string; import: string } };
};

function runNode(args: string[]) {
  return spawnSync(process.execPath, args, { cwd: pkgDir, encoding: 'utf8', timeout: 60_000 });
}

function assertBuilt(rel: string): string {
  const abs = path.join(pkgDir, rel);
  if (!existsSync(abs)) {
    throw new Error(
      `${rel} is missing — run \`pnpm --filter @harness-engineering/orchestrator build\` first`
    );
  }
  return abs;
}

describe('published entry points (#2059)', () => {
  it('main and exports.require name the same CommonJS file', () => {
    expect(manifest.exports['.'].require).toBe(manifest.main);
  });

  it('the CommonJS entry can be require()d and exposes the public surface', () => {
    const cjs = assertBuilt(manifest.exports['.'].require);
    const r = runNode([
      '-e',
      `const m = require(${JSON.stringify(cjs)});` +
        `process.stdout.write(JSON.stringify({ orchestrator: typeof m.Orchestrator, launchTUI: typeof m.launchTUI }));`,
    ]);
    expect(r.stderr).not.toContain('ERR_REQUIRE_ASYNC_MODULE');
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ orchestrator: 'function', launchTUI: 'function' });
  });

  it('the ESM entry can still be import()ed and exposes the public surface', () => {
    const esm = assertBuilt(manifest.exports['.'].import);
    const r = runNode([
      '--input-type=module',
      '-e',
      `const m = await import(${JSON.stringify(pathToFileURL(esm).href)});` +
        `process.stdout.write(JSON.stringify({ orchestrator: typeof m.Orchestrator, launchTUI: typeof m.launchTUI }));`,
    ]);
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ orchestrator: 'function', launchTUI: 'function' });
  });
});
