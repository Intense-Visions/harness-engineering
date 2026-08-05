import { describe, it, expect } from 'vitest';
import { SECURITY_SCAN_EXTENSIONS, SECURITY_SCAN_GLOB } from '@harness-engineering/core';
import { runCheckSecurity } from '../../src/commands/check-security';
import * as path from 'path';

const CLEAN_FIXTURES = path.join(__dirname, '../fixtures/valid-project');
const INSECURE_FIXTURES = path.join(__dirname, '../fixtures/security-findings');
// Fixture that contains ONLY an info-severity finding (SEC-NET-003 http:// URL).
const INFO_ONLY_FIXTURES = path.join(__dirname, '../fixtures/security-info-only');
// ESM/CJS-only project (#1084) and a project with no scannable source at all.
const ESM_FIXTURES = path.join(__dirname, '../fixtures/security-esm');
const NO_SOURCE_FIXTURES = path.join(__dirname, '../fixtures/security-no-source');

/** Extensions the scan surface must always include — see #1084. */
const REQUIRED_SCAN_EXTENSIONS = [
  'ts',
  'tsx',
  'mts',
  'cts',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'py',
] as const;

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

  // Regression for #1084: the scan glob omitted .mjs/.cjs, so an ESM-only project's
  // entire source surface went unread and the gate passed because it matched
  // nothing — green-because-empty, indistinguishable from green-because-clean.
  describe('scan surface covers ESM/CJS-explicit extensions (#1084)', () => {
    it('finds a secret in a .mjs module', async () => {
      const result = await runCheckSecurity(ESM_FIXTURES, { severity: 'error' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.findings.some((f) => f.file.endsWith('.mjs'))).toBe(true);
      expect(result.value.valid).toBe(false);
    });

    it('finds a secret in a .cjs module', async () => {
      const result = await runCheckSecurity(ESM_FIXTURES, { severity: 'error' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.findings.some((f) => f.file.endsWith('.cjs'))).toBe(true);
    });

    it('scans more than zero files in an ESM-only project', async () => {
      const result = await runCheckSecurity(ESM_FIXTURES, { severity: 'error' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.stats.filesScanned).toBeGreaterThan(0);
      expect(result.value.scannedNothing).toBe(false);
    });

    it('pins the extension list so a future edit cannot silently drop one', () => {
      // The extension list IS the security boundary; assert it explicitly rather
      // than trusting that whoever edits it re-runs the behavioural tests above.
      for (const ext of REQUIRED_SCAN_EXTENSIONS) {
        expect(SECURITY_SCAN_EXTENSIONS).toContain(ext);
      }
      expect(SECURITY_SCAN_GLOB).toContain('mjs');
    });
  });

  // A scan that read nothing abstained; it did not pass.
  describe('zero-file scan is an abstention, not a pass (#1084)', () => {
    it('flags scannedNothing when no file matched', async () => {
      const result = await runCheckSecurity(NO_SOURCE_FIXTURES, { severity: 'error' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.stats.filesScanned).toBe(0);
      expect(result.value.scannedNothing).toBe(true);
    });

    it('stays non-blocking by default, so an upgrade cannot redden legitimate repos', async () => {
      const result = await runCheckSecurity(NO_SOURCE_FIXTURES, { severity: 'error' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.valid).toBe(true);
    });

    it('fails under --fail-on-empty', async () => {
      const result = await runCheckSecurity(NO_SOURCE_FIXTURES, {
        severity: 'error',
        failOnEmpty: true,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.valid).toBe(false);
    });

    it('--fail-on-empty does not fail a scan that did read files and found nothing', async () => {
      const result = await runCheckSecurity(CLEAN_FIXTURES, {
        severity: 'error',
        failOnEmpty: true,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.stats.filesScanned).toBeGreaterThan(0);
      expect(result.value.valid).toBe(true);
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
