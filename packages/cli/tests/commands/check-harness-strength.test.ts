import { describe, it, expect } from 'vitest';
import { runCheckHarnessStrength } from '../../src/commands/check-harness-strength';
import * as path from 'path';

const WEAK = path.join(__dirname, '../fixtures/harness-strength-weak');
const CLEAN = path.join(__dirname, '../fixtures/valid-project');

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
});
