import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { runCompoundScanCandidatesCommand } from '../../src/commands/compound/scan-candidates';

function gitInit(cwd: string) {
  execSync('git init -q && git config user.email "t@t" && git config user.name "T"', {
    cwd,
    shell: '/bin/bash',
  });
}
function commitFile(cwd: string, file: string, content: string, msg: string) {
  writeFileSync(join(cwd, file), content);
  execSync(`git add . && git commit -q -m "${msg}"`, { cwd, shell: '/bin/bash' });
}

describe('harness compound scan-candidates', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'compound-scan-'));
    gitInit(tmp);
    writeFileSync(
      join(tmp, 'harness.config.json'),
      JSON.stringify({ version: 1, name: 'test', layers: [], forbiddenImports: [] }, null, 2)
    );
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('writes a candidate file with undocumented fixes and returns success', async () => {
    commitFile(tmp, 'a.ts', 'a', 'fix: handle null in parser');
    commitFile(tmp, 'b.ts', 'b', 'fix(orchestrator): retry budget');
    commitFile(tmp, 'c.ts', 'c', 'fix: button contrast');

    const status = await runCompoundScanCandidatesCommand({
      cwd: tmp,
      lookback: '30d',
      configPath: join(tmp, 'harness.config.json'),
      outputPath: join(tmp, 'docs/solutions/.candidates/auto.md'),
      solutionsDir: join(tmp, 'docs/solutions'),
      nonInteractive: true,
    });
    expect(status.status).toBe('success');
    expect(status.candidatesFound).toBeGreaterThanOrEqual(3);
    expect(status.path).toBeDefined();
    const out = readFileSync(status.path!, 'utf-8');
    expect(out).toContain('## Undocumented fixes');
    expect(out).toContain('Run: `/harness:compound');
  });

  it('returns no-issues when every fix is documented', async () => {
    commitFile(tmp, 'a.ts', 'a', 'fix: handle null in parser');
    // Seed a documented solution that overlaps the fix.
    const dir = join(tmp, 'docs/solutions/bug-track/logic-errors');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'null-parser.md'),
      `---\nmodule: x\ntags: []\nproblem_type: x\nlast_updated: '2026-05-05'\ntrack: bug-track\ncategory: logic-errors\n---\n\n# Handle null parser\n`
    );

    const status = await runCompoundScanCandidatesCommand({
      cwd: tmp,
      lookback: '30d',
      configPath: join(tmp, 'harness.config.json'),
      outputPath: join(tmp, 'docs/solutions/.candidates/auto.md'),
      solutionsDir: join(tmp, 'docs/solutions'),
      nonInteractive: true,
    });
    expect(status.status).toBe('no-issues');
    expect(status.candidatesFound).toBe(0);
  });

  it('uses default 7d lookback when not provided', async () => {
    commitFile(tmp, 'a.ts', 'a', 'fix: recent thing');
    const status = await runCompoundScanCandidatesCommand({
      cwd: tmp,
      configPath: join(tmp, 'harness.config.json'),
      outputPath: join(tmp, 'docs/solutions/.candidates/auto.md'),
      solutionsDir: join(tmp, 'docs/solutions'),
      nonInteractive: true,
    });
    expect(status.lookback).toBe('7d');
  });

  // End-to-end: build a fixture repo with a mix of commit types, seed an
  // existing solution doc that overlaps one of the fixes, and assert the report
  // surfaces only the genuinely undocumented fixes with the right category
  // suggestions. This is the integration smoke test for Phase 5 — the JSON
  // status contract here is the public surface that Phase 6's
  // compound-candidates maintenance task wires its `checkCommand` to.
  it('end-to-end: surfaces only undocumented fixes with correct categories', async () => {
    commitFile(tmp, 'a.ts', 'a', 'feat: ship feature');
    commitFile(tmp, 'b.ts', 'b', 'chore: bump dep');
    commitFile(tmp, 'c.ts', 'c', 'fix: flaky pulse runner test');
    commitFile(tmp, 'd.ts', 'd', 'fix(perf): slow startup latency');
    commitFile(tmp, 'e.ts', 'e', 'fix(orchestrator): handle stalled lease');

    // Seed a documented solution overlapping the test-related fix only.
    const docDir = join(tmp, 'docs/solutions/bug-track/test-failures');
    mkdirSync(docDir, { recursive: true });
    writeFileSync(
      join(docDir, 'already-doc.md'),
      `---\nmodule: x\ntags: []\nproblem_type: x\nlast_updated: '2026-05-05'\ntrack: bug-track\ncategory: test-failures\n---\n\n# Flaky pulse runner test\n`
    );

    const status = await runCompoundScanCandidatesCommand({
      cwd: tmp,
      lookback: '30d',
      configPath: join(tmp, 'harness.config.json'),
      outputPath: join(tmp, 'docs/solutions/.candidates/auto.md'),
      solutionsDir: join(tmp, 'docs/solutions'),
      nonInteractive: true,
    });

    expect(status.status).toBe('success');
    expect(status.candidatesFound).toBe(2);
    expect(status.lookback).toBe('30d');

    const out = readFileSync(status.path!, 'utf-8');
    expect(out).toContain('Suggested category: bug-track/performance-issues');
    expect(out).toContain('Suggested category: bug-track/integration-issues');
    // The flaky test fix is suppressed because it overlaps the seeded doc.
    expect(out).not.toContain('flaky pulse runner test');
  });
});
