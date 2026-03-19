import { describe, it, expect } from 'vitest';
import { runCheckSecurity } from '../../src/commands/check-security';
import * as path from 'path';

const CLEAN_FIXTURES = path.join(__dirname, '../fixtures/valid-project');
const INSECURE_FIXTURES = path.join(__dirname, '../fixtures/security-findings');

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
