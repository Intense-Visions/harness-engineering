// Tier C — CLI smoke E2E (per-PR, CI-safe). The canonical minimal example the
// framework doc (docs/guides/e2e-testing.md) references: invoke the REAL built
// `harness` binary as a subprocess against a REAL scaffolded temp git repo and
// assert on-disk output + honest exit codes — all through the shared E2E helpers.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { runHarness, scaffoldProject, initGitRepo, cleanup, skipUnlessBin } from './support';

const UNIT = '.harness/comprehension/math/_module.md';

const PROJECT = {
  'math/add.ts':
    '/** Adds two numbers. */\nexport function add(a: number, b: number): number {\n  return a + b;\n}\n',
  'math/index.ts': "export { add } from './add';\n",
};

describe.skipIf(skipUnlessBin)('harness CLI — Tier C smoke (static, no LLM)', () => {
  let proj: string;

  beforeAll(() => {
    proj = scaffoldProject(PROJECT, 'e2e-cli-smoke-');
    initGitRepo(proj);
  });

  afterAll(() => cleanup(proj));

  it('compiles a static-only unit and exits 0', () => {
    const r = runHarness(['comprehend', '--all', '--static'], { cwd: proj });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Compiled 1 module\(s\)/);
    expect(r.stdout).toMatch(/static-only/);

    const unit = path.join(proj, UNIT);
    expect(existsSync(unit)).toBe(true);
    const body = readFileSync(unit, 'utf8');
    expect(body).toContain('semantic: absent'); // no LLM ran
    expect(body).toContain('## Interface Contract');
    expect(body).toContain('add'); // exported symbol captured
  });

  it('--check on the fresh tree is token-free and exits 0', () => {
    const r = runHarness(['comprehend', '--check'], { cwd: proj });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/source-fresh/);
  });
});
