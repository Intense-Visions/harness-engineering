import { describe, it, expect } from 'vitest';
import { runCheckHarnessStrength } from '../../src/commands/check-harness-strength';
import * as path from 'path';

const WEAK = path.join(__dirname, '../fixtures/harness-strength-weak');
const CLEAN = path.join(__dirname, '../fixtures/valid-project');
const CLEAN_HARNESS = path.join(__dirname, '../fixtures/harness-strength-clean');

describe('runCheckHarnessStrength', () => {
  it('returns a structured AuditResult with score, tier, and summary', () => {
    const r = runCheckHarnessStrength(WEAK, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(typeof r.value.audit.score).toBe('number');
    expect(['solid', 'at-risk', 'theatre']).toContain(r.value.audit.tier);
    expect(r.value.audit.summary).toHaveProperty('errors');
    expect(r.value.audit.summary).toHaveProperty('rulesRun');
  });

  it('is invalid (gate trips) when an error-severity finding survives the threshold', () => {
    const r = runCheckHarnessStrength(WEAK, { severity: 'error' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.audit.summary.errors).toBeGreaterThan(0);
    expect(r.value.valid).toBe(false);
    expect(r.value.filtered.some((f) => f.severity === 'error')).toBe(true);
  });

  it('filters findings by severity threshold (display set narrows as threshold rises)', () => {
    const all = runCheckHarnessStrength(WEAK, { severity: 'info' });
    const errs = runCheckHarnessStrength(WEAK, { severity: 'error' });
    expect(all.ok && errs.ok).toBe(true);
    if (!all.ok || !errs.ok) return;
    expect(errs.value.filtered.length).toBeLessThanOrEqual(all.value.filtered.length);
    for (const f of errs.value.filtered) expect(f.severity).toBe('error');
  });

  it('honors explicit mode selection', () => {
    const r = runCheckHarnessStrength(WEAK, { mode: 'adopter' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.audit.mode).toBe('adopter');
  });

  it('auto-detects mode when none is given (clean fixture -> adopter)', () => {
    const r = runCheckHarnessStrength(CLEAN, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(['adopter', 'toolkit']).toContain(r.value.audit.mode);
  });

  it('passes the gate (valid, exit-0 path) on a genuinely clean harness fixture (CHS-S1)', () => {
    const r = runCheckHarnessStrength(CLEAN_HARNESS, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.audit.mode).toBe('adopter');
    expect(r.value.audit.findings).toEqual([]);
    expect(r.value.audit.score).toBe(100);
    expect(r.value.audit.tier).toBe('solid');
    expect(r.value.valid).toBe(true);
    expect(r.value.filtered.length).toBe(0);
  });

  it('is deterministic across two runs on the clean fixture', () => {
    const a = runCheckHarnessStrength(CLEAN_HARNESS, {});
    const b = runCheckHarnessStrength(CLEAN_HARNESS, {});
    expect(a).toEqual(b);
  });

  it('flags the weak fixture: STRENGTH-004 fires, score < 100, gate trips at error', () => {
    const r = runCheckHarnessStrength(WEAK, { severity: 'error' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.audit.findings.map((f) => f.id)).toContain('STRENGTH-004');
    // Single STRENGTH-004 error => score 86 (100 - 14), still in the solid band
    // (boundary: 85 solid / 84 at-risk). The locked contract is "flags + gate trips",
    // not a specific tier: a lone error keeps the score above the at-risk cutoff.
    expect(r.value.audit.score).toBeLessThan(100);
    // Gate trips on the surviving error regardless of tier.
    expect(r.value.valid).toBe(false);
    expect(r.value.audit.summary.errors).toBeGreaterThan(0);
  });
});

describe('runCheckHarnessStrength live-repo dogfood (loose smoke)', () => {
  // Repo root from this test file: packages/cli/tests/commands -> up 4.
  const REPO_ROOT = path.resolve(__dirname, '../../../..');

  it('flags the live harness in toolkit mode without asserting the exact finding set', () => {
    const r = runCheckHarnessStrength(REPO_ROOT, { mode: 'toolkit' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.audit.mode).toBe('toolkit');
    // Loose: the repo is not yet fully hardened, so it must not score a clean 100.
    expect(r.value.audit.score).toBeLessThan(100);
    const ids = r.value.audit.findings.map((f) => f.id);
    // Durable anchors: both fire on .husky/pre-commit (002 auto-baseline, 003 skip-list).
    expect(ids).toContain('STRENGTH-002');
    expect(ids).toContain('STRENGTH-003');
    // STRENGTH-006 must fire on .github/workflows/ci.yml: the refresh-baselines job
    // auto-approves + auto-merges a baseline PR with a PAT and no review gate
    // (roadmap #531). The auto commands live inside a `run: |` block, which an
    // earlier FP-guard regression failed to detect; this locks the canonical case.
    expect(ids).toContain('STRENGTH-006');
    const f006 = r.value.audit.findings.find((f) => f.id === 'STRENGTH-006');
    expect(f006?.file).toBe('.github/workflows/ci.yml');
  });
});
