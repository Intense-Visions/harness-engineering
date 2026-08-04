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
  it('reports a bare directory as incomplete, not solid (#1013)', () => {
    const result = new HarnessStrengthAuditor().audit(root, {});
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    const v = result.value;
    expect(v.mode).toBe('adopter');
    expect(v.findings).toEqual([]);
    expect(v.score).toBe(100);
    // Bare dir: every rule's required input is absent => none evaluable. A clean
    // score across ZERO evaluated patterns must not read as a full `solid` pass.
    expect(v.tier).toBe('incomplete');
    expect(v.summary.rulesRun).toBe(0);
    expect(v.summary.rulesPassing).toBe(0);
    // Coverage is fully surfaced: every applicable pattern is named as skipped.
    expect(v.summary.rulesApplicable).toBeGreaterThan(0);
    expect(v.summary.skipped).toHaveLength(v.summary.rulesApplicable);
    for (const s of v.summary.skipped) {
      expect(s.id).toMatch(/^STRENGTH-/);
      expect(s.gearPiece.length).toBeGreaterThan(0);
      expect(s.reason).toContain('not evaluable');
    }
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

  it('reports config-only coverage as incomplete, not solid (#1013)', () => {
    const dir = buildClean();
    try {
      const result = new HarnessStrengthAuditor().audit(dir, {});
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      const v = result.value;
      expect(v.findings).toEqual([]);
      expect(v.score).toBe(100);
      expect(v.summary.errors).toBe(0);
      expect(v.summary.warnings).toBe(0);
      // Config present => STRENGTH-004/005 evaluable and pass; the hook-,
      // workflow-, and snapshot-based patterns abstain. A clean score across
      // only some patterns is `incomplete`, not `solid` (#1013).
      expect(v.summary.rulesPassing).toBeGreaterThanOrEqual(1);
      expect(v.summary.skipped.length).toBeGreaterThan(0);
      expect(v.summary.rulesRun).toBeLessThan(v.summary.rulesApplicable);
      expect(v.tier).toBe('incomplete');
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

describe('HarnessStrengthAuditor full coverage (#1013)', () => {
  // Every applicable adopter pattern has its required input present and benign,
  // so all evaluate AND pass — the only path on which `solid` is earned.
  const PRECOMMIT = '#!/bin/sh\nif ! npx harness ci check; then\n  exit 1\nfi\nnpx lint-staged\n';
  const CONFIG = JSON.stringify({
    version: 1,
    layers: [{ name: 'a' }],
    architecture: { thresholds: { maxFanIn: 12 } },
  });
  const BENIGN_WF =
    'name: CI\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n';
  // Honest snapshot: `lint` has no contradicting signal, so STRENGTH-007 passes.
  const SNAPSHOT = JSON.stringify({ checks: { lint: { passed: true } }, signals: [] });

  function buildFull(): string {
    const dir = mkdtempSync(join(tmpdir(), 'hs-full-'));
    mkdirSync(join(dir, '.husky'), { recursive: true });
    writeFileSync(join(dir, '.husky', 'pre-commit'), PRECOMMIT);
    writeFileSync(join(dir, 'harness.config.json'), CONFIG);
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(dir, '.github', 'workflows', 'ci.yml'), BENIGN_WF);
    mkdirSync(join(dir, '.harness'), { recursive: true });
    writeFileSync(join(dir, '.harness', 'health-snapshot.json'), SNAPSHOT);
    return dir;
  }

  it('earns solid only when every applicable pattern is evaluated and clean', () => {
    const dir = buildFull();
    try {
      const result = new HarnessStrengthAuditor().audit(dir, {});
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      const v = result.value;
      expect(v.findings).toEqual([]);
      expect(v.score).toBe(100);
      // Full coverage: nothing abstained, so the `incomplete` cap does not apply.
      expect(v.summary.skipped).toEqual([]);
      expect(v.summary.rulesRun).toBe(v.summary.rulesApplicable);
      expect(v.tier).toBe('solid');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
