import { describe, it, expect } from 'vitest';
import {
  MAINTENANCE_FINDINGS_CONTRACT_VERSION,
  formatFindingsContract,
  parseFindingsContract,
} from '../src/maintenance-findings';

describe('formatFindingsContract', () => {
  it('emits a single-line JSON envelope with findings, check, and version', () => {
    const line = formatFindingsContract(12, 'check-docs');
    expect(line).not.toContain('\n');
    expect(JSON.parse(line)).toEqual({
      findings: 12,
      check: 'check-docs',
      v: MAINTENANCE_FINDINGS_CONTRACT_VERSION,
    });
  });

  it('omits check when not provided', () => {
    const parsed = JSON.parse(formatFindingsContract(0));
    expect(parsed.findings).toBe(0);
    expect(parsed.check).toBeUndefined();
  });

  it('coerces negative / fractional / non-finite counts to a non-negative integer', () => {
    expect(JSON.parse(formatFindingsContract(-5)).findings).toBe(0);
    expect(JSON.parse(formatFindingsContract(3.9)).findings).toBe(3);
    expect(JSON.parse(formatFindingsContract(Number.NaN)).findings).toBe(0);
  });
});

describe('parseFindingsContract', () => {
  it('round-trips a formatted envelope', () => {
    const parsed = parseFindingsContract(formatFindingsContract(7, 'cleanup'));
    expect(parsed).toEqual({
      findings: 7,
      check: 'cleanup',
      v: MAINTENANCE_FINDINGS_CONTRACT_VERSION,
    });
  });

  it('finds the envelope as a trailing line after human output', () => {
    const output = [
      'Documentation coverage: 62.0%',
      '  - src/foo.ts',
      formatFindingsContract(3, 'check-docs'),
    ].join('\n');
    expect(parseFindingsContract(output)?.findings).toBe(3);
  });

  it('returns null when no envelope line is present (regex-fallback signal)', () => {
    expect(parseFindingsContract('Validation passed\n45 issues found')).toBeNull();
    expect(parseFindingsContract('')).toBeNull();
  });

  it('parses a bare envelope with no check / version fields', () => {
    expect(parseFindingsContract('{"findings":2}')).toEqual({ findings: 2 });
  });

  it('ignores a { … } line that is not valid JSON', () => {
    expect(parseFindingsContract('{not valid json}')).toBeNull();
  });

  it('ignores a multi-line pretty-printed --json blob (fragments are not complete objects)', () => {
    const blob = JSON.stringify({ valid: false, findings: [{ a: 1 }] }, null, 2);
    expect(parseFindingsContract(blob)).toBeNull();
  });

  it('rejects a JSON line whose findings field is not a number', () => {
    expect(parseFindingsContract('{"findings":[1,2,3]}')).toBeNull();
    expect(parseFindingsContract('{"findings":"3"}')).toBeNull();
  });

  it('scans backward and returns the LAST envelope when several are present', () => {
    const output = [formatFindingsContract(1), formatFindingsContract(9)].join('\n');
    expect(parseFindingsContract(output)?.findings).toBe(9);
  });
});
