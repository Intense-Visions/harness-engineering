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
  args: string[],
  env?: NodeJS.ProcessEnv
): { status: number; stdout: string; stderr: string } {
  // Spawn via process.execPath + the .js entry (NOT the .bin shim — win32-safe).
  const res = spawnSync(process.execPath, [BIN, 'comprehend', ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60_000,
    ...(env ? { env } : {}),
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

// --- #1697: `comprehend --all` lands already-prettier-formatted shards ---------
// A bulk (`--all`, non-`--stage`) run must apply the SAME write-time prettier
// formatting the `--stage`/hook path applies, so shards land prettier-stable and
// don't "dribble" against an adopter's own prettier-on-markdown lint-staged /
// pre-commit — which reflows the serializer's double-quoted YAML frontmatter to
// single quotes (repo `singleQuote: true`) and trips the whole-tree `format:check`.
describe.skipIf(!HAS_BIN)('harness comprehend --all — write-time shard formatting (#1697)', () => {
  let proj: string;

  beforeAll(() => {
    proj = mkdtempSync(path.join(tmpdir(), 'comprehend-fmt-'));
    mkdirSync(path.join(proj, 'math'), { recursive: true });
    writeFileSync(
      path.join(proj, 'math', 'add.ts'),
      `/** Adds two numbers. */\nexport function add(a: number, b: number): number {\n  return a + b;\n}\n`
    );
    writeFileSync(path.join(proj, 'math', 'index.ts'), `export { add } from './add';\n`);
    // A realistic adopter: prettier-on-markdown (singleQuote) with NO `.prettierignore`
    // entry for the comprehension substrate — exactly who this bug bites.
    writeFileSync(
      path.join(proj, '.prettierrc.json'),
      JSON.stringify({ singleQuote: true }, null, 2)
    );
  });

  afterAll(() => {
    if (proj) rmSync(proj, { recursive: true, force: true });
  });

  it('a shard written via the bulk --all path is already prettier-stable (no format:check drift)', async () => {
    const r = comprehend(proj, ['--all', '--static']);
    expect(r.status).toBe(0);

    const unitPath = path.join(proj, UNIT);
    const onDisk = readFileSync(unitPath, 'utf8');

    // `format:check` equivalent: re-running prettier over the freshly-written shard
    // must be a NO-OP. Before the fix the shard carried double-quoted YAML frontmatter
    // that prettier (singleQuote) reflows → a guaranteed diff → dribble on every commit.
    const prettier = await import('prettier');
    const config = await prettier.resolveConfig(unitPath);
    const formatted = await prettier.format(onDisk, { ...config, filepath: unitPath });
    expect(formatted).toBe(onDisk);
  });
});

// Deterministic SEMANTIC E2E — fake the LLM at the REAL boundary. We drop a fake
// `claude` on PATH that emits a canned structured_output envelope, so the FULL
// pipeline runs for real (D8 resolver → ClaudeCliAnalysisProvider spawn → parse →
// semantic serialize → serve) with zero network. This is the "with-LLM" pair to
// the "without" (`--static`) above. POSIX-only: a fake executable on PATH is
// reliable on posix; the static smoke covers win32.
const POSIX = process.platform !== 'win32';

describe.skipIf(!HAS_BIN || !POSIX)('harness comprehend — E2E semantic with a faked LLM', () => {
  let proj: string;
  let binDir: string;

  function scaffold(): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'comprehend-fake-'));
    mkdirSync(path.join(dir, 'math'), { recursive: true });
    writeFileSync(
      path.join(dir, 'math', 'add.ts'),
      `/** Adds two numbers. */\nexport function add(a: number, b: number): number {\n  return a + b;\n}\n`
    );
    writeFileSync(path.join(dir, 'math', 'index.ts'), `export { add } from './add';\n`);
    return dir;
  }

  // A fake `claude`. Emits a valid structured_output envelope; when FAKE_CHATTY_ONCE
  // points at a counter file, the FIRST invocation instead returns prose with no
  // structured_output — the exact shape that broke us live — so the provider's
  // corrective retry is exercised end-to-end (not just in unit mocks).
  function writeFakeClaude(dir: string): void {
    const script = `#!/usr/bin/env node
const fs = require('node:fs');
const ctrl = process.env.FAKE_CHATTY_ONCE;
let chatty = false;
if (ctrl) {
  const n = fs.existsSync(ctrl) ? (parseInt(fs.readFileSync(ctrl, 'utf8'), 10) || 0) : 0;
  fs.writeFileSync(ctrl, String(n + 1));
  chatty = n === 0;
}
const good = { type: 'result', result: 'done', structured_output: { summary: 'FAKE_SUMMARY: adds two numbers; pure and total.', invariants: ['add(a,b) returns a+b', 'no side effects'] }, usage: { input_tokens: 10, output_tokens: 5 }, model: 'fake-claude' };
const prose = { type: 'result', result: "I've already called the StructuredOutput tool in my response above.", usage: { input_tokens: 5, output_tokens: 2 }, model: 'fake-claude' };
process.stdout.write(JSON.stringify(chatty ? prose : good));
`;
    writeFileSync(path.join(dir, 'claude'), script, { mode: 0o755 });
  }

  beforeAll(() => {
    proj = scaffold();
    binDir = mkdtempSync(path.join(tmpdir(), 'fake-bin-'));
    writeFakeClaude(binDir);
  });

  afterAll(() => {
    if (proj) rmSync(proj, { recursive: true, force: true });
    if (binDir) rmSync(binDir, { recursive: true, force: true });
  });

  // Env that steers the D8 resolver onto the claude-CLI path and finds our fake:
  // no Anthropic key, no local endpoint, fake `claude` first on PATH.
  function fakeEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    const e = { ...process.env, ...extra };
    delete e.ANTHROPIC_API_KEY;
    delete e.HARNESS_ANALYSIS_BASE_URL;
    e.PATH = `${binDir}${path.delimiter}${process.env.PATH ?? ''}`;
    return e;
  }

  it('produces a semantic:present unit with the (faked) summary + invariants', () => {
    const r = comprehend(proj, ['--all'], fakeEnv());
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/1 semantic/);
    const unit = readFileSync(path.join(proj, UNIT), 'utf8');
    expect(unit).toContain('semantic: present');
    expect(unit).toContain('model: "fake-claude"');
    expect(unit).toContain('## Summary');
    expect(unit).toContain('FAKE_SUMMARY');
    expect(unit).toContain('## Invariants');
    expect(unit).toContain('add(a,b) returns a+b');
    // The freshly compiled semantic unit still serves (hash equality holds).
    expect(comprehend(proj, ['--check'], fakeEnv()).status).toBe(0);
  });

  it('recovers end-to-end from a chatty first reply (the live bug, now guarded)', () => {
    const fresh = scaffold();
    const counter = path.join(binDir, 'chatty-counter');
    try {
      const r = comprehend(fresh, ['--all'], fakeEnv({ FAKE_CHATTY_ONCE: counter }));
      expect(r.status).toBe(0);
      // First claude reply was prose (no structured_output); the corrective retry
      // recovered → the unit is semantic:present, NOT degraded to absent.
      expect(r.stdout).toMatch(/1 semantic/);
      const unit = readFileSync(path.join(fresh, UNIT), 'utf8');
      expect(unit).toContain('semantic: present');
      expect(unit).toContain('FAKE_SUMMARY');
    } finally {
      rmSync(fresh, { recursive: true, force: true });
      rmSync(counter, { force: true });
    }
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
