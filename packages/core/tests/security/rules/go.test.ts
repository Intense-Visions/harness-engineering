import { describe, it, expect } from 'vitest';
import { goRules } from '../../../src/security/rules/stack/go';

describe('Go stack rules', () => {
  it('all rules have stack: ["go"] and correct id prefix', () => {
    expect(goRules).toHaveLength(2);
    for (const rule of goRules) {
      expect(rule.stack).toContain('go');
      expect(rule.id).toMatch(/^SEC-GO-/);
    }
  });

  describe('SEC-GO-001 — Unsafe Pointer Usage', () => {
    const rule = goRules.find((r) => r.id === 'SEC-GO-001')!;

    it('has correct metadata', () => {
      expect(rule.severity).toBe('warning');
      expect(rule.confidence).toBe('medium');
      expect(rule.references).toContain('CWE-119');
      expect(rule.category).toBe('injection');
    });

    it('detects unsafe.Pointer cast', () => {
      expect(rule.patterns.some((p) => p.test('p := unsafe.Pointer(&x)'))).toBe(true);
    });

    it('detects unsafe.Pointer in type conversion', () => {
      expect(rule.patterns.some((p) => p.test('(*int)(unsafe.Pointer(p))'))).toBe(true);
    });

    it('does not flag safe pointer usage', () => {
      expect(rule.patterns.some((p) => p.test('var p *int = &x'))).toBe(false);
    });

    it('does not flag the word "unsafe" in a comment', () => {
      expect(rule.patterns.some((p) => p.test('// this is unsafe but ok'))).toBe(false);
    });
  });

  describe('SEC-GO-002 — Format String Injection', () => {
    const rule = goRules.find((r) => r.id === 'SEC-GO-002')!;

    it('has correct metadata', () => {
      expect(rule.severity).toBe('warning');
      expect(rule.confidence).toBe('medium');
      expect(rule.references).toContain('CWE-134');
    });

    it('detects fmt.Sprintf with variable format string', () => {
      expect(rule.patterns.some((p) => p.test('fmt.Sprintf(userFmt)'))).toBe(true);
    });

    it('detects fmt.Sprintf with variable (different name)', () => {
      expect(rule.patterns.some((p) => p.test('fmt.Sprintf(formatStr)'))).toBe(true);
    });

    it('does not flag fmt.Sprintf with literal format string', () => {
      expect(rule.patterns.some((p) => p.test('fmt.Sprintf("%s", name)'))).toBe(false);
    });

    it('does not flag fmt.Println', () => {
      expect(rule.patterns.some((p) => p.test('fmt.Println(msg)'))).toBe(false);
    });
  });
});
