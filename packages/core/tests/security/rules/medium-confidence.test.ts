import { describe, it, expect } from 'vitest';
import { pathTraversalRules } from '../../../src/security/rules/path-traversal';
import { networkRules } from '../../../src/security/rules/network';
import { deserializationRules } from '../../../src/security/rules/deserialization';

describe('Path traversal rules', () => {
  it('detects ../ in file operations', () => {
    const rule = pathTraversalRules.find((r) => r.id === 'SEC-PTH-001');
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe('warning');
    expect(rule!.patterns.some((p) => p.test('readFile(dir + "/../" + file)'))).toBe(true);
  });
});

describe('Network rules', () => {
  it('detects CORS wildcard origin', () => {
    const rule = networkRules.find((r) => r.id === 'SEC-NET-001');
    expect(rule).toBeDefined();
    expect(rule!.patterns.some((p) => p.test("origin: '*'"))).toBe(true);
    expect(rule!.patterns.some((p) => p.test('origin: "*"'))).toBe(true);
  });

  it('detects disabled TLS verification', () => {
    const rule = networkRules.find((r) => r.id === 'SEC-NET-002');
    expect(rule).toBeDefined();
    expect(rule!.patterns.some((p) => p.test('rejectUnauthorized: false'))).toBe(true);
  });

  it('detects hardcoded http:// URLs', () => {
    const rule = networkRules.find((r) => r.id === 'SEC-NET-003');
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe('info');
    expect(rule!.patterns.some((p) => p.test("fetch('http://api.example.com')"))).toBe(true);
    // localhost should not be flagged
    expect(rule!.patterns.some((p) => p.test("fetch('http://localhost:3000')"))).toBe(false);
  });
});

describe('Deserialization rules', () => {
  it('detects JSON.parse on request body without schema', () => {
    const rule = deserializationRules.find((r) => r.id === 'SEC-DES-001');
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe('warning');
  });
});
