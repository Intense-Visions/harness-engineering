import { describe, it, expect } from 'vitest';
import {
  mapSecuritySeverity,
  computeOverallSeverity,
  computeScanExitCode,
  mapInjectionFindings,
  isDuplicateFinding,
  mapSecurityFindings,
  type ScanConfigFinding,
  type ScanConfigFileResult,
} from './scan-config-shared';
import type { InjectionFinding } from './injection-patterns';
import type { SecurityFinding } from './types';

// Characterization tests for the shared scan-config utilities. These pin the
// current severity-mapping, aggregation, exit-code, and de-duplication
// behavior exactly as it ships today (F3a: current behavior is the contract).

describe('mapSecuritySeverity', () => {
  it("maps 'error' to high", () => {
    expect(mapSecuritySeverity('error')).toBe('high');
  });

  it("maps 'warning' to medium", () => {
    expect(mapSecuritySeverity('warning')).toBe('medium');
  });

  it("maps 'info' to low", () => {
    expect(mapSecuritySeverity('info')).toBe('low');
  });

  it('maps any unrecognized severity to low (default branch)', () => {
    expect(mapSecuritySeverity('catastrophic')).toBe('low');
    expect(mapSecuritySeverity('')).toBe('low');
  });
});

function finding(severity: ScanConfigFinding['severity']): ScanConfigFinding {
  return { ruleId: 'R-1', severity, message: 'm', match: 'x' };
}

// Assert a single-element result and return that element narrowed, so tests can
// read its fields without tripping noUncheckedIndexedAccess.
function only<T>(arr: T[]): T {
  expect(arr).toHaveLength(1);
  return arr[0] as T;
}

// Build a complete SecurityFinding so fixtures satisfy every required field;
// each test overrides only the properties the behavior under test depends on.
function sec(overrides: Partial<SecurityFinding>): SecurityFinding {
  return {
    ruleId: 'SEC-A-1',
    ruleName: 'rule',
    category: 'injection' as SecurityFinding['category'],
    severity: 'error' as SecurityFinding['severity'],
    confidence: 'high' as SecurityFinding['confidence'],
    file: 'f.ts',
    line: 1,
    match: 'code',
    context: 'ctx',
    message: 'msg',
    remediation: 'fix it',
    ...overrides,
  };
}

describe('computeOverallSeverity', () => {
  it("returns 'clean' when there are no findings", () => {
    expect(computeOverallSeverity([])).toBe('clean');
  });

  it("returns 'high' when any finding is high, regardless of order", () => {
    expect(computeOverallSeverity([finding('low'), finding('high'), finding('medium')])).toBe(
      'high'
    );
  });

  it("returns 'medium' when the worst finding is medium", () => {
    expect(computeOverallSeverity([finding('low'), finding('medium')])).toBe('medium');
  });

  it("returns 'low' when every finding is low", () => {
    expect(computeOverallSeverity([finding('low'), finding('low')])).toBe('low');
  });
});

function fileResult(overallSeverity: ScanConfigFileResult['overallSeverity']): ScanConfigFileResult {
  return { file: 'f.ts', findings: [], overallSeverity };
}

describe('computeScanExitCode', () => {
  it('returns 0 for no results', () => {
    expect(computeScanExitCode([])).toBe(0);
  });

  it('returns 0 when all files are clean or low', () => {
    expect(computeScanExitCode([fileResult('clean'), fileResult('low')])).toBe(0);
  });

  it('returns 2 when any file is high (high dominates medium)', () => {
    expect(computeScanExitCode([fileResult('medium'), fileResult('high')])).toBe(2);
  });

  it('returns 1 when the worst file is medium', () => {
    expect(computeScanExitCode([fileResult('low'), fileResult('medium')])).toBe(1);
  });
});

describe('mapInjectionFindings', () => {
  it('maps injection findings into scan-config findings with a derived message', () => {
    const injection: InjectionFinding[] = [
      { ruleId: 'INJ-ENC-001', severity: 'high', match: 'base64…', line: 12 } as InjectionFinding,
    ];

    const mapped = only(mapInjectionFindings(injection));

    expect(mapped).toEqual({
      ruleId: 'INJ-ENC-001',
      severity: 'high',
      message: 'Injection pattern detected: INJ-ENC-001',
      match: 'base64…',
      line: 12,
    });
  });

  it('omits the line field entirely when the injection finding has no line', () => {
    const injection: InjectionFinding[] = [{ ruleId: 'INJ-X', severity: 'medium', match: 'm' }];

    const mapped = only(mapInjectionFindings(injection));

    expect('line' in mapped).toBe(false);
    expect(mapped.severity).toBe('medium');
  });

  it('returns an empty array for no injection findings', () => {
    expect(mapInjectionFindings([])).toEqual([]);
  });
});

describe('isDuplicateFinding', () => {
  const existing: ScanConfigFinding[] = [
    { ruleId: 'SEC-INJ-001', severity: 'high', message: 'm', match: 'trimmed', line: 5 },
  ];

  it('treats a finding as duplicate when line, trimmed match, and rule prefix all agree', () => {
    // Same line, match equal after trim, and prefix 'SEC' === 'SEC'.
    const candidate = sec({ ruleId: 'SEC-OTHER-999', match: '  trimmed  ', line: 5 });

    expect(isDuplicateFinding(existing, candidate)).toBe(true);
  });

  it('is not a duplicate when the rule-id prefix differs', () => {
    const candidate = sec({ ruleId: 'INJ-INJ-001', match: 'trimmed', line: 5 });

    expect(isDuplicateFinding(existing, candidate)).toBe(false);
  });

  it('is not a duplicate when the line differs', () => {
    const candidate = sec({ ruleId: 'SEC-INJ-001', match: 'trimmed', line: 6 });

    expect(isDuplicateFinding(existing, candidate)).toBe(false);
  });

  it('is never a duplicate against an empty existing set', () => {
    const candidate = sec({ ruleId: 'SEC-INJ-001', match: 'trimmed', line: 5 });

    expect(isDuplicateFinding([], candidate)).toBe(false);
  });
});

describe('mapSecurityFindings', () => {
  it('maps non-duplicate security findings and re-maps their severity', () => {
    const secFindings = [
      sec({ ruleId: 'SEC-A-1', severity: 'error', message: 'boom', match: 'code', line: 3 }),
    ];

    const result = mapSecurityFindings(secFindings, []);

    expect(result).toEqual([
      { ruleId: 'SEC-A-1', severity: 'high', message: 'boom', match: 'code', line: 3 },
    ]);
  });

  it('drops findings that duplicate one already present', () => {
    const existing: ScanConfigFinding[] = [
      { ruleId: 'SEC-A-1', severity: 'high', message: 'boom', match: 'code', line: 3 },
    ];
    const secFindings = [
      sec({ ruleId: 'SEC-B-2', severity: 'warning', message: 'dup', match: 'code', line: 3 }),
    ];

    // Same line + match + 'SEC' prefix => duplicate => filtered out.
    expect(mapSecurityFindings(secFindings, existing)).toEqual([]);
  });

  it("re-maps 'info' severity to low on a passed-through finding", () => {
    const secFindings = [sec({ ruleId: 'SEC-C-3', severity: 'info', message: 'note', line: 8 })];

    const mapped = only(mapSecurityFindings(secFindings, []));

    expect(mapped.severity).toBe('low');
    expect(mapped.line).toBe(8);
  });
});
