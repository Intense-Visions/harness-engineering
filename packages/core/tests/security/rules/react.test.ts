import { describe, it, expect } from 'vitest';
import { reactRules } from '../../../src/security/rules/stack/react';

describe('React stack rules', () => {
  it('all rules have stack: ["react"] and correct id prefix', () => {
    expect(reactRules).toHaveLength(1);
    for (const rule of reactRules) {
      expect(rule.stack).toContain('react');
      expect(rule.id).toMatch(/^SEC-REACT-/);
    }
  });

  describe('SEC-REACT-001 — Sensitive Data in Client Storage', () => {
    const rule = reactRules.find((r) => r.id === 'SEC-REACT-001')!;

    it('has correct metadata', () => {
      expect(rule.severity).toBe('warning');
      expect(rule.confidence).toBe('medium');
      expect(rule.references).toContain('CWE-922');
      expect(rule.category).toBe('secrets');
    });

    // localStorage true positives
    it('detects localStorage.setItem with token', () => {
      expect(rule.patterns.some((p) => p.test("localStorage.setItem('token', jwt)"))).toBe(true);
    });

    it('detects localStorage.setItem with jwt', () => {
      expect(rule.patterns.some((p) => p.test("localStorage.setItem('jwt', value)"))).toBe(true);
    });

    it('detects localStorage.setItem with auth', () => {
      expect(rule.patterns.some((p) => p.test("localStorage.setItem('auth', data)"))).toBe(true);
    });

    it('detects localStorage.setItem with session', () => {
      expect(rule.patterns.some((p) => p.test("localStorage.setItem('session', sid)"))).toBe(true);
    });

    it('detects localStorage.setItem with password', () => {
      expect(rule.patterns.some((p) => p.test("localStorage.setItem('password', pw)"))).toBe(true);
    });

    it('detects localStorage.setItem with secret', () => {
      expect(rule.patterns.some((p) => p.test("localStorage.setItem('secret', s)"))).toBe(true);
    });

    it('detects localStorage.setItem with key', () => {
      expect(rule.patterns.some((p) => p.test("localStorage.setItem('key', k)"))).toBe(true);
    });

    it('detects localStorage.setItem with credential', () => {
      expect(rule.patterns.some((p) => p.test("localStorage.setItem('credential', cred)"))).toBe(
        true
      );
    });

    it('is case insensitive for key names', () => {
      expect(rule.patterns.some((p) => p.test("localStorage.setItem('TOKEN', jwt)"))).toBe(true);
    });

    // sessionStorage true positives
    it('detects sessionStorage.setItem with token', () => {
      expect(rule.patterns.some((p) => p.test("sessionStorage.setItem('token', jwt)"))).toBe(true);
    });

    it('detects sessionStorage.setItem with password', () => {
      expect(rule.patterns.some((p) => p.test("sessionStorage.setItem('password', pw)"))).toBe(
        true
      );
    });

    // True negatives
    it('does not flag localStorage.setItem with safe keys', () => {
      expect(rule.patterns.some((p) => p.test("localStorage.setItem('theme', 'dark')"))).toBe(
        false
      );
    });

    it('does not flag localStorage.setItem with preference keys', () => {
      expect(rule.patterns.some((p) => p.test("localStorage.setItem('language', 'en')"))).toBe(
        false
      );
    });

    it('does not flag localStorage.getItem', () => {
      expect(rule.patterns.some((p) => p.test("localStorage.getItem('token')"))).toBe(false);
    });
  });
});
