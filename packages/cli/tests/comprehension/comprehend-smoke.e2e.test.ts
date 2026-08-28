// End-to-end SMOKE test for the compiled comprehension substrate.
//
// Unlike the unit tests (which inject IO/providers), this drives the REAL built
// `harness comprehend` binary as a subprocess against a REAL scaffolded git repo
// and asserts the REAL on-disk behavior + exit codes. This is the layer that has
// historically hidden bugs (real CLI wiring, real file IO, real hash round-trip),
// so it exercises them for real — the deterministic `--static` path needs no LLM
// and is CI-safe. A gated live variant (HARNESS_E2E_LIVE=1) exercises the
// provider path; it is skipped by default.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// The built CLI entrypoint (turbo builds it before `test:coverage`). When absent
// (someone ran the test without building), skip rather than fail — this is a
// smoke test over the built artifact, not the source.
const BIN = path.resolve(process.cwd(), 'dist/bin/harness.js');
const HAS_BIN = existsSync(BIN);

function comprehend(
  cwd: string,
  args: string[]
): { status: number; stdout: string; stderr: string } {
  // Spawn via process.execPath + the .js entry (NOT the .bin shim — win32-safe).
  const res = spawnSync(process.execPath, [BIN, 'comprehend', ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

const UNIT = '.harness/comprehension/math/_module.md';

describe.skipIf(!HAS_BIN)('harness comprehend — E2E smoke (static, no LLM)', () => {
  let proj: string;

  beforeAll(() => {
    proj = mkdtempSync(path.join(tmpdir(), 'comprehend-smoke-'));
    mkdirSync(path.join(proj, 'math'), { recursive: true });
    writeFileSync(
      path.join(proj, 'math', 'add.ts'),
      `/** Adds two numbers. */\nexport function add(a: number, b: number): number {\n  return a + b;\n}\n`
    );
    writeFileSync(path.join(proj, 'math', 'index.ts'), `export { add } from './add';\n`);
    // A real git repo (realistic; also lets --changed derive a surface if extended).
    const git = (a: string[]) => spawnSync('git', a, { cwd: proj, encoding: 'utf8' });
    git(['init', '-q']);
    git(['config', 'user.email', 'e2e@test']);
    git(['config', 'user.name', 'e2e']);
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'init']);
  });

  afterAll(() => {
    if (proj) rmSync(proj, { recursive: true, force: true });
  });

  it('compiles a static-only unit with valid provenance + interface contract', () => {
    const r = comprehend(proj, ['--all', '--static']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Compiled 1 module\(s\)/);
    expect(r.stdout).toMatch(/static-only/);

    const unitPath = path.join(proj, UNIT);
    expect(existsSync(unitPath)).toBe(true);
    const unit = readFileSync(unitPath, 'utf8');
    // No LLM ran → semantic absent; static half present; full-length source hash.
    expect(unit).toContain('semantic: absent');
    expect(unit).toContain('## Interface Contract');
    expect(unit).toContain('add'); // the exported symbol is captured
    expect(unit).toMatch(/sourceHash: "[0-9a-f]{64}"/); // full SHA-256, not truncated
  });

  it('--check passes on a freshly compiled tree (token-free, exit 0)', () => {
    const r = comprehend(proj, ['--check']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/source-fresh/);
  });

  it('--stats reports served-vs-raw savings', () => {
    const r = comprehend(proj, ['--stats']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/saved.*%/);
  });

  it('is deterministic: a second static run produces a byte-identical unit (no churn)', () => {
    const before = readFileSync(path.join(proj, UNIT));
    const r = comprehend(proj, ['--all', '--static']);
    expect(r.status).toBe(0);
    // skip-if-fresh: the unchanged module is not recompiled/rewritten.
    expect(r.stdout).toMatch(/fresh \(skipped\)/);
    const after = readFileSync(path.join(proj, UNIT));
    expect(after.equals(before)).toBe(true);
  });

  it('detects a source change: --check goes stale (non-zero), recompile clears it', () => {
    // Mutate the module's source → the committed unit is now source-stale.
    writeFileSync(
      path.join(proj, 'math', 'add.ts'),
      `/** Adds two numbers (now validated). */\nexport function add(a: number, b: number): number {\n  if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('non-finite');\n  return a + b;\n}\n`
    );
    const stale = comprehend(proj, ['--check']);
    expect(stale.status).not.toBe(0); // VALIDATION_FAILED — never served silently
    expect(stale.stdout + stale.stderr).toMatch(/stale/i);

    // Recompile → the compile→serve hash equality is restored end-to-end.
    const recompile = comprehend(proj, ['--all', '--static']);
    expect(recompile.status).toBe(0);
    const fresh = comprehend(proj, ['--check']);
    expect(fresh.status).toBe(0);
    expect(fresh.stdout).toMatch(/source-fresh/);
  });
});

// Gated LIVE variant — exercises the real provider (semantic) path. Off by default
// (needs a working provider + spends tokens); run with HARNESS_E2E_LIVE=1. Asserts
// the degradation-safe invariant end-to-end: with semantics ON, the run always
// produces a valid, source-fresh unit whether or not the LLM actually resolved.
describe.skipIf(!HAS_BIN || !process.env.HARNESS_E2E_LIVE)(
  'harness comprehend — E2E live (semantic path, degradation-safe)',
  () => {
    let proj: string;

    beforeAll(() => {
      proj = mkdtempSync(path.join(tmpdir(), 'comprehend-live-'));
      mkdirSync(path.join(proj, 'math'), { recursive: true });
      writeFileSync(
        path.join(proj, 'math', 'add.ts'),
        `/** Adds two numbers. */\nexport function add(a: number, b: number): number {\n  return a + b;\n}\n`
      );
      writeFileSync(path.join(proj, 'math', 'index.ts'), `export { add } from './add';\n`);
    });

    afterAll(() => {
      if (proj) rmSync(proj, { recursive: true, force: true });
    });

    it('produces a valid, source-fresh unit whether the LLM resolves or degrades', () => {
      const r = comprehend(proj, ['--all']); // semantics ON (no --static)
      expect(r.status).toBe(0);
      const unit = readFileSync(path.join(proj, UNIT), 'utf8');
      expect(unit).toMatch(/semantic: (present|absent)/); // either outcome is valid
      // Whatever was produced must serve fresh (compile→serve hash equality holds).
      const check = comprehend(proj, ['--check']);
      expect(check.status).toBe(0);
    });
  }
);
