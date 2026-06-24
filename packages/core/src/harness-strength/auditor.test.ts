import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { HarnessStrengthAuditor } from './auditor';
import { isOk } from '../shared/result';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'hs-auditor-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeHusky(text: string): void {
  mkdirSync(join(root, '.husky'), { recursive: true });
  writeFileSync(join(root, '.husky', 'pre-commit'), text);
}

describe('HarnessStrengthAuditor.audit', () => {
  it('returns Ok with a clean result for a bare directory', () => {
    const result = new HarnessStrengthAuditor().audit(root, {});
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    const v = result.value;
    expect(v.mode).toBe('adopter');
    expect(v.findings).toEqual([]);
    expect(v.score).toBe(100);
    expect(v.tier).toBe('solid');
    // Bare dir: every rule's required input is absent => none evaluable.
    expect(v.summary.rulesRun).toBe(0);
    expect(v.summary.rulesPassing).toBe(0);
  });

  it('detects STRENGTH-001 at default severity (error)', () => {
    writeHusky('#!/bin/sh\n# never blocks\nexit 0\n');
    const result = new HarnessStrengthAuditor().audit(root, {});
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    const v = result.value;
    const ids = v.findings.map((f) => f.id);
    expect(ids).toContain('STRENGTH-001');
    const s001 = v.findings.find((f) => f.id === 'STRENGTH-001')!;
    expect(s001.severity).toBe('error');
    expect(v.summary.errors).toBeGreaterThanOrEqual(1);
    expect(v.score).toBeLessThan(100);
  });

  it('applies a config severity override to a finding', () => {
    writeHusky('#!/bin/sh\n# never blocks\nexit 0\n');
    writeFileSync(
      join(root, 'harness.config.json'),
      JSON.stringify({ audit: { harnessStrength: { severities: { 'STRENGTH-001': 'warning' } } } })
    );
    const result = new HarnessStrengthAuditor().audit(root, {});
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    const v = result.value;
    const s001 = v.findings.find((f) => f.id === 'STRENGTH-001')!;
    expect(s001.severity).toBe('warning');
    expect(v.summary.warnings).toBeGreaterThanOrEqual(1);
  });
});

describe('HarnessStrengthAuditor integration (determinism + not-evaluable)', () => {
  // pre-commit fires STRENGTH-002 (auto-baseline in a failure branch) and
  // STRENGTH-003 (6-category skip, no justification). It does NOT fire
  // STRENGTH-001 because it has gates (`if !`, `||`, `then`) and an `exit 1`.
  const PRECOMMIT = `if ! node harness ci check --skip entropy,docs,perf,security,deps,phase-gate 2>&1 | tee /tmp/log; then
  if grep -q "REGRESSION" /tmp/log; then
    npx harness check-arch --update-baseline >/dev/null 2>&1
    git add .harness/arch/baselines.json
  else
    exit 1
  fi
fi
npx lint-staged
`;

  // config fires STRENGTH-004 (layers + empty thresholds) and STRENGTH-005 (basic tier).
  const CONFIG = JSON.stringify({
    layers: [{ name: 'a' }],
    architecture: { thresholds: {} },
    template: { level: 'basic' },
  });

  function buildFixture(): string {
    const dir = mkdtempSync(join(tmpdir(), 'hs-integration-'));
    mkdirSync(join(dir, '.husky'), { recursive: true });
    writeFileSync(join(dir, '.husky', 'pre-commit'), PRECOMMIT);
    writeFileSync(join(dir, 'harness.config.json'), CONFIG);
    return dir;
  }

  it('produces the expected deterministic AuditResult', () => {
    const dir = buildFixture();
    try {
      const result = new HarnessStrengthAuditor().audit(dir, {});
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      const v = result.value;

      expect(v.mode).toBe('adopter');
      expect(v.findings.map((f) => f.id).sort()).toEqual([
        'STRENGTH-002',
        'STRENGTH-003',
        'STRENGTH-004',
        'STRENGTH-005',
      ]);

      // Score: 100 - (error 14 + warning 6 + error 14 + warning 6) = 60 => at-risk
      expect(v.score).toBe(60);
      expect(v.tier).toBe('at-risk');

      // Evaluable on this fixture: 001 (hookFiles present), 002, 003 (preCommit),
      // 004, 005 (config). NOT 006 (no workflows), NOT 007 (no snapshot).
      expect(v.summary.rulesRun).toBe(5);
      // 001 ran and passed (no finding); the other 4 fired.
      expect(v.summary.rulesPassing).toBe(1);
      expect(v.summary.errors).toBe(2);
      expect(v.summary.warnings).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('excludes not-evaluable rules (006 no workflows, 007 no snapshot) from rulesRun', () => {
    const dir = buildFixture();
    try {
      const result = new HarnessStrengthAuditor().audit(dir, {});
      if (!isOk(result)) throw new Error('expected Ok');
      const ids = result.value.findings.map((f) => f.id);
      expect(ids).not.toContain('STRENGTH-006');
      expect(ids).not.toContain('STRENGTH-007');
      // 006 and 007 are excluded from rulesRun (not counted as passes).
      expect(result.value.summary.rulesRun).toBe(5);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is deterministic across two runs on the same directory', () => {
    const dir = buildFixture();
    try {
      const auditor = new HarnessStrengthAuditor();
      const run1 = auditor.audit(dir, {});
      const run2 = auditor.audit(dir, {});
      expect(run1).toEqual(run2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('HarnessStrengthAuditor root-relative file invariant', () => {
  // Fixture triggers the three rules that source their file from directory
  // scans: STRENGTH-001 (non-blocking hook), STRENGTH-004 (layers + empty
  // thresholds), STRENGTH-006 (PAT-gated auto-approve workflow, no review).
  const AUTOAPPROVE_WF = `name: auto-approve baseline
on: pull_request
jobs:
  approve:
    runs-on: ubuntu-latest
    steps:
      - uses: hmarr/auto-approve-action@v3
        with:
          token: \${{ secrets.BASELINE_AUTOAPPROVE_PAT }}
      - run: gh pr merge --auto
`;
  const CONFIG = JSON.stringify({
    layers: [{ name: 'a' }],
    architecture: { thresholds: {} },
  });

  function buildFixture(): string {
    const dir = mkdtempSync(join(tmpdir(), 'hs-relpath-'));
    mkdirSync(join(dir, '.husky'), { recursive: true });
    writeFileSync(join(dir, '.husky', 'pre-commit'), '#!/bin/sh\n# never blocks\nexit 0\n');
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(dir, '.github', 'workflows', 'auto.yml'), AUTOAPPROVE_WF);
    writeFileSync(join(dir, 'harness.config.json'), CONFIG);
    return dir;
  }

  it('emits only root-relative finding.file paths (no absolute / home-dir leak)', () => {
    const dir = buildFixture();
    try {
      const result = new HarnessStrengthAuditor().audit(dir, {});
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      const v = result.value;
      const ids = v.findings.map((f) => f.id).sort();
      // The three directory-scan-sourced rules all fired on this fixture.
      expect(ids).toContain('STRENGTH-001');
      expect(ids).toContain('STRENGTH-004');
      expect(ids).toContain('STRENGTH-006');
      // Invariant: every finding.file is root-relative.
      for (const f of v.findings) {
        expect(isAbsolute(f.file)).toBe(false);
        expect(f.file.startsWith(dir)).toBe(false);
      }
      // Spot-check the exact relative paths.
      expect(v.findings.find((f) => f.id === 'STRENGTH-001')?.file).toBe('.husky/pre-commit');
      expect(v.findings.find((f) => f.id === 'STRENGTH-006')?.file).toBe(
        '.github/workflows/auto.yml'
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('HarnessStrengthAuditor clean harness (passing gate path)', () => {
  // layers defined + populated thresholds, nothing else => no rule fires.
  const CLEAN = JSON.stringify({
    version: 1,
    layers: [{ name: 'a' }],
    architecture: { thresholds: { maxFanIn: 12 } },
  });

  function buildClean(): string {
    const dir = mkdtempSync(join(tmpdir(), 'hs-clean-'));
    writeFileSync(join(dir, 'harness.config.json'), CLEAN);
    return dir;
  }

  it('scores 100/solid with zero findings when layers have populated thresholds', () => {
    const dir = buildClean();
    try {
      const result = new HarnessStrengthAuditor().audit(dir, {});
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      const v = result.value;
      expect(v.findings).toEqual([]);
      expect(v.score).toBe(100);
      expect(v.tier).toBe('solid');
      expect(v.summary.errors).toBe(0);
      expect(v.summary.warnings).toBe(0);
      // STRENGTH-004 evaluable (config present) and passes; others not evaluable.
      expect(v.summary.rulesPassing).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is deterministic across two runs on the clean fixture', () => {
    const dir = buildClean();
    try {
      const auditor = new HarnessStrengthAuditor();
      expect(auditor.audit(dir, {})).toEqual(auditor.audit(dir, {}));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
