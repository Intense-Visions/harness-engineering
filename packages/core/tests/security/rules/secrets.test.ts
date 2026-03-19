import { describe, it, expect } from 'vitest';
import { secretRules } from '../../../src/security/rules/secrets';

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
