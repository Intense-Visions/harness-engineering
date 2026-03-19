import { describe, it, expect } from 'vitest';
import { nodeRules } from '../../../src/security/rules/stack/node';
import { expressRules } from '../../../src/security/rules/stack/express';
import { reactRules } from '../../../src/security/rules/stack/react';
import { goRules } from '../../../src/security/rules/stack/go';

describe('Node.js rules', () => {
  it('all have stack: ["node"]', () => {
    for (const rule of nodeRules) {
      expect(rule.stack).toContain('node');
      expect(rule.id).toMatch(/^SEC-NODE-/);
    }
  });

  it('detects prototype pollution indicators', () => {
    const rule = nodeRules.find((r) => r.id === 'SEC-NODE-001');
    expect(rule).toBeDefined();
    expect(rule!.patterns.some((p) => p.test('obj.__proto__.polluted = true'))).toBe(true);
    expect(rule!.patterns.some((p) => p.test('obj.constructor[key] = val'))).toBe(true);
    expect(rule!.patterns.some((p) => p.test('Object.assign(target, req.body)'))).toBe(true);
    // Should NOT match normal bracket access
    expect(rule!.patterns.some((p) => p.test('arr[0] = value'))).toBe(false);
  });
});

describe('Express rules', () => {
  it('all have stack: ["express"]', () => {
    for (const rule of expressRules) {
      expect(rule.stack).toContain('express');
      expect(rule.id).toMatch(/^SEC-EXPRESS-/);
    }
  });
});

describe('React rules', () => {
  it('all have stack: ["react"]', () => {
    for (const rule of reactRules) {
      expect(rule.stack).toContain('react');
      expect(rule.id).toMatch(/^SEC-REACT-/);
    }
  });

  it('detects localStorage for sensitive data', () => {
    const rule = reactRules.find((r) => r.id === 'SEC-REACT-001');
    expect(rule).toBeDefined();
    expect(rule!.patterns.some((p) => p.test("localStorage.setItem('token', jwt)"))).toBe(true);
  });
});

describe('Go rules', () => {
  it('all have stack: ["go"]', () => {
    for (const rule of goRules) {
      expect(rule.stack).toContain('go');
      expect(rule.id).toMatch(/^SEC-GO-/);
    }
  });
});
