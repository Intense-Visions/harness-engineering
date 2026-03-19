import { describe, it, expect } from 'vitest';
import type {
  SecurityCategory,
  SecuritySeverity,
  SecurityConfidence,
  SecurityRule,
  SecurityFinding,
  ScanResult,
  SecurityConfig,
} from '../../src/security/types';

describe('Security types', () => {
  it('SecurityRule has required fields', () => {
    const rule: SecurityRule = {
      id: 'SEC-INJ-001',
      name: 'SQL String Concatenation',
      category: 'injection',
      severity: 'error',
      confidence: 'high',
      patterns: [/query\(.*\+/],
      message: 'Avoid SQL string concatenation',
      remediation: 'Use parameterized queries',
    };
    expect(rule.id).toBe('SEC-INJ-001');
    expect(rule.category).toBe('injection');
    expect(rule.confidence).toBe('high');
  });

  it('SecurityFinding references a rule', () => {
    const finding: SecurityFinding = {
      ruleId: 'SEC-INJ-001',
      ruleName: 'SQL String Concatenation',
      category: 'injection',
      severity: 'error',
      confidence: 'high',
      file: 'src/db.ts',
      line: 10,
      match: 'query("SELECT * FROM users WHERE id=" + id)',
      context: '  const result = query("SELECT * FROM users WHERE id=" + id);',
      message: 'Avoid SQL string concatenation',
      remediation: 'Use parameterized queries',
    };
    expect(finding.ruleId).toBe('SEC-INJ-001');
    expect(finding.file).toBe('src/db.ts');
    expect(finding.line).toBe(10);
  });

  it('ScanResult tracks coverage level', () => {
    const result: ScanResult = {
      findings: [],
      scannedFiles: 10,
      rulesApplied: 25,
      externalToolsUsed: [],
      coverage: 'baseline',
    };
    expect(result.coverage).toBe('baseline');
    expect(result.findings).toHaveLength(0);
  });

  it('SecurityConfig supports rule overrides and strict mode', () => {
    const config: SecurityConfig = {
      enabled: true,
      strict: true,
      rules: { 'SEC-NET-001': 'off', 'SEC-INJ-*': 'error' },
      exclude: ['**/*.test.ts'],
    };
    expect(config.strict).toBe(true);
    expect(config.rules?.['SEC-NET-001']).toBe('off');
  });
});
