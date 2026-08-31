// Tier A — deterministic real-boundary E2E (per-PR, CI-safe) + a Tier B gated
// stub. The canonical example of replaying REAL external-tool behavior from a
// CAPTURED fixture: a fake `claude` on PATH emits the #1558 narration envelope on
// its first call, and the provider's corrective retry must recover end-to-end.
// The boundary under test (the claude-CLI spawn) is NEVER mocked — the full
// pipeline runs for real with zero network. POSIX-only (a fake executable on PATH
// is reliable on posix; cli-smoke.e2e covers win32 via the static path).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  runHarness,
  scaffoldProject,
  cleanup,
  loadClaudeEnvelope,
  withFakeClaude,
  removeFakeClaude,
  fakeProviderEnv,
  skipUnlessBinPosix,
  skipTierB,
} from './support';

const UNIT = '.harness/comprehension/math/_module.md';

const PROJECT = {
  'math/add.ts':
    '/** Adds two numbers. */\nexport function add(a: number, b: number): number {\n  return a + b;\n}\n',
  'math/index.ts': "export { add } from './add';\n",
};

describe.skipIf(skipUnlessBinPosix)(
  'harness comprehend — Tier A real-boundary (faked claude from a captured fixture)',
  () => {
    let fakeDir: string;
    let proj: string;

    beforeAll(() => {
      // The fake emits the #1558 prose (no structured_output) on call #1, then the
      // schema-conforming envelope — both loaded from the on-disk fixtures. The
      // counter is a unique temp path the fake increments across invocations.
      fakeDir = withFakeClaude(loadClaudeEnvelope('structured-output'), {
        chattyOnce: {
          chattyEnvelope: loadClaudeEnvelope('chatty-narration'),
          counterFile: path.join(tmpdir(), `harness-e2e-chatty-${process.pid}-${Date.now()}`),
        },
      });
      proj = scaffoldProject(PROJECT, 'e2e-boundary-');
    });

    afterAll(() => {
      cleanup(proj);
      removeFakeClaude(fakeDir);
    });

    it('recovers end-to-end from a chatty first reply (the #1558 bug, now guarded)', () => {
      const env = fakeProviderEnv(fakeDir, { HARNESS_COMPREHENSION_MAIN_PASS: '1' });
      const r = runHarness(['comprehend', '--all'], { cwd: proj, env });
      expect(r.status).toBe(0);
      // First reply was prose; the corrective retry recovered → semantic present,
      // NOT degraded to absent.
      expect(r.stdout).toMatch(/1 semantic/);
      const unit = readFileSync(path.join(proj, UNIT), 'utf8');
      expect(unit).toContain('semantic: present');
      expect(unit).toContain('FAKE_SUMMARY');
      expect(unit).toContain('model: "fake-claude"');
    });
  }
);

// Tier B — gated live smoke (nightly / dogfood). Off by default; runs only under
// HARNESS_E2E_LIVE=1 against a REAL provider. Asserts the degradation-safe
// invariant end-to-end: with semantics ON, the run always produces a valid,
// source-fresh unit whether or not the LLM actually resolved. The nightly lane in
// main-health.yml sets the flag AND asserts this suite's gate is reachable.
describe.skipIf(skipTierB)('harness comprehend — Tier B live (degradation-safe)', () => {
  let proj: string;

  beforeAll(() => {
    proj = scaffoldProject(PROJECT, 'e2e-live-');
  });

  afterAll(() => cleanup(proj));

  it('produces a valid, source-fresh unit whether the LLM resolves or degrades', () => {
    const r = runHarness(['comprehend', '--all'], {
      cwd: proj,
      env: { ...process.env, HARNESS_COMPREHENSION_MAIN_PASS: '1' },
    });
    expect(r.status).toBe(0);
    const unit = readFileSync(path.join(proj, UNIT), 'utf8');
    expect(unit).toMatch(/semantic: (present|absent)/);
    expect(runHarness(['comprehend', '--check'], { cwd: proj }).status).toBe(0);
  });
});
