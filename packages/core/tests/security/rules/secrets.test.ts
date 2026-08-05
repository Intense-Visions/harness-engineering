import { describe, it, expect } from 'vitest';
import { secretRules } from '../../../src/security/rules/secrets';
import { SecurityScanner } from '../../../src/security/scanner';

describe('Secret detection rules', () => {
  it('exports multiple rules', () => {
    expect(secretRules.length).toBeGreaterThan(0);
    for (const rule of secretRules) {
      expect(rule.id).toMatch(/^SEC-SEC-/);
      expect(rule.category).toBe('secrets');
      expect(rule.confidence).toBe('high');
      expect(rule.severity).toBe('error');
    }
  });

  it('detects AWS access key patterns', () => {
    const rule = secretRules.find((r) => r.id === 'SEC-SEC-001');
    expect(rule).toBeDefined();
    const testLine = 'const key = "AKIAIOSFODNN7EXAMPLE";';
    expect(rule!.patterns.some((p) => p.test(testLine))).toBe(true);
  });

  it('detects generic API key assignments', () => {
    const rule = secretRules.find((r) => r.id === 'SEC-SEC-002');
    expect(rule).toBeDefined();
    const testLine = 'const API_KEY = "sk-live-abc123def456";';
    expect(rule!.patterns.some((p) => p.test(testLine))).toBe(true);
  });

  it('detects private key headers', () => {
    const rule = secretRules.find((r) => r.id === 'SEC-SEC-003');
    expect(rule).toBeDefined();
    const testLine = '"-----BEGIN RSA PRIVATE KEY-----"';
    expect(rule!.patterns.some((p) => p.test(testLine))).toBe(true);
  });

  it('does not flag env variable reads', () => {
    const rule = secretRules.find((r) => r.id === 'SEC-SEC-002');
    const envRead = 'const key = process.env.API_KEY;';
    expect(rule!.patterns.some((p) => p.test(envRead))).toBe(false);
  });
});

// The scanner suppresses secret findings whose value is a variable/expression
// reference rather than a literal — the SEC-SEC-002 pattern still matches the
// assignment shape, but a runtime-resolved reference is not a hardcoded leak.
describe('SecurityScanner secret reference suppression', () => {
  const scanner = new SecurityScanner();

  function scan(line: string, file = 'deploy/run.sh') {
    return scanner.scanContent(line, file).filter((f) => f.category === 'secrets');
  }

  it('does not flag a CI expression assigned to a token', () => {
    expect(scan('TOKEN: "${{ secrets.BASELINE_AUTOAPPROVE_PAT }}"')).toHaveLength(0);
  });

  it('does not flag a shell $VAR assigned to a token', () => {
    expect(scan('GH_TOKEN="$AUTOAPPROVE_PAT" gh pr review --approve')).toHaveLength(0);
  });

  it('does not flag a ${VAR} brace reference assigned to a token', () => {
    expect(scan('export API_KEY="${DEPLOY_API_KEY}"')).toHaveLength(0);
  });

  it('STILL flags a genuine hardcoded literal', () => {
    expect(scan('const API_KEY = "sk-live-abc123def456ghi789";').length).toBeGreaterThan(0);
  });

  it('STILL flags a literal with a variable-only prefix', () => {
    expect(scan('export API_KEY="${PREFIX}sk-live-abc123def456"').length).toBeGreaterThan(0);
  });
});
