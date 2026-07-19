import { describe, it, expect } from 'vitest';
import { runCheckSecurity } from '../../src/commands/check-security';
import * as path from 'path';

const CLEAN_FIXTURES = path.join(__dirname, '../fixtures/valid-project');
const INSECURE_FIXTURES = path.join(__dirname, '../fixtures/security-findings');
// Fixture that contains ONLY an info-severity finding (SEC-NET-003 http:// URL).
const INFO_ONLY_FIXTURES = path.join(__dirname, '../fixtures/security-info-only');

describe('runCheckSecurity', () => {
  it('returns valid:true when no findings exist', async () => {
    const result = await runCheckSecurity(CLEAN_FIXTURES, {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
      expect(result.value.findings).toEqual([]);
      expect(result.value.stats.errorCount).toBe(0);
    }
  });

  it('detects security findings in insecure fixtures', async () => {
    const result = await runCheckSecurity(INSECURE_FIXTURES, { severity: 'info' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.findings.length).toBeGreaterThan(0);
      expect(result.value.stats.filesScanned).toBeGreaterThan(0);
    }
  });

  it('filters findings by severity threshold', async () => {
    // Get all findings first to confirm some exist below error level
    const allResult = await runCheckSecurity(INSECURE_FIXTURES, { severity: 'info' });
    expect(allResult.ok).toBe(true);
    if (!allResult.ok) return;
    const allCount = allResult.value.findings.length;
    expect(allCount).toBeGreaterThan(0);

    // Filter to error only — should return fewer or equal findings
    const errorResult = await runCheckSecurity(INSECURE_FIXTURES, { severity: 'error' });
    expect(errorResult.ok).toBe(true);
    if (!errorResult.ok) return;

    // Every returned finding must be error severity
    for (const f of errorResult.value.findings) {
      expect(f.severity).toBe('error');
    }

    // Error-only count should be <= all findings count
    expect(errorResult.value.findings.length).toBeLessThanOrEqual(allCount);
  });

  // Regression for #915: `--severity` must bound the VERDICT, not just the report.
  describe('severity bounds the pass/fail verdict (#915)', () => {
    it('does NOT fail --severity error on a new info-only finding', async () => {
      const result = await runCheckSecurity(INFO_ONLY_FIXTURES, { severity: 'error' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // The info finding is below the requested threshold, so the gate passes.
      expect(result.value.stats.infoCount).toBe(0);
      expect(result.value.findings).toEqual([]);
      expect(result.value.valid).toBe(true);
    });

    it('DOES fail --severity error on a new error finding', async () => {
      const result = await runCheckSecurity(INSECURE_FIXTURES, { severity: 'error' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.stats.errorCount).toBeGreaterThan(0);
      expect(result.value.valid).toBe(false);
    });

    it('fails when the requested severity is at-or-below the finding severity', async () => {
      // Guard: `--severity info` must actually gate on the info finding.
      // Before the fix the verdict was hardcoded to error, so this passed
      // incorrectly (valid:true) even though an info finding was present.
      const result = await runCheckSecurity(INFO_ONLY_FIXTURES, { severity: 'info' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.stats.infoCount).toBeGreaterThan(0);
      expect(result.value.valid).toBe(false);
    });
  });

  it('returns stats with correct shape', async () => {
    const result = await runCheckSecurity(CLEAN_FIXTURES, {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stats).toHaveProperty('filesScanned');
      expect(result.value.stats).toHaveProperty('rulesApplied');
      expect(result.value.stats).toHaveProperty('errorCount');
      expect(result.value.stats).toHaveProperty('warningCount');
      expect(result.value.stats).toHaveProperty('infoCount');
    }
  });
});
