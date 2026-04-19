import { describe, it, expect } from 'vitest';
import { xssRules } from '../../../src/security/rules/xss';

describe('XSS rules', () => {
  it('exports 3 rules in the xss category', () => {
    expect(xssRules).toHaveLength(3);
    for (const rule of xssRules) {
      expect(rule.category).toBe('xss');
      expect(rule.id).toMatch(/^SEC-XSS-/);
      expect(rule.severity).toBe('error');
      expect(rule.confidence).toBe('high');
      expect(rule.references).toContain('CWE-79');
    }
  });

  describe('SEC-XSS-001 — innerHTML Assignment', () => {
    const rule = xssRules.find((r) => r.id === 'SEC-XSS-001')!;

    it('detects innerHTML assignment', () => {
      expect(rule.patterns.some((p) => p.test('element.innerHTML = userInput'))).toBe(true);
    });

    it('detects innerHTML with whitespace around equals', () => {
      expect(rule.patterns.some((p) => p.test('el.innerHTML  =  data'))).toBe(true);
    });

    it('does not flag innerHTML reads', () => {
      expect(rule.patterns.some((p) => p.test('const html = element.innerHTML'))).toBe(false);
    });

    it('does not flag textContent assignment', () => {
      expect(rule.patterns.some((p) => p.test('element.textContent = userInput'))).toBe(false);
    });
  });

  describe('SEC-XSS-002 — dangerouslySetInnerHTML', () => {
    const rule = xssRules.find((r) => r.id === 'SEC-XSS-002')!;

    it('detects dangerouslySetInnerHTML in JSX', () => {
      expect(rule.patterns.some((p) => p.test('dangerouslySetInnerHTML={{ __html: data }}'))).toBe(
        true
      );
    });

    it('detects dangerouslySetInnerHTML as a standalone reference', () => {
      expect(rule.patterns.some((p) => p.test('dangerouslySetInnerHTML'))).toBe(true);
    });

    it('does not flag normal JSX props', () => {
      expect(rule.patterns.some((p) => p.test('className="safe"'))).toBe(false);
    });
  });

  describe('SEC-XSS-003 — document.write', () => {
    const rule = xssRules.find((r) => r.id === 'SEC-XSS-003')!;

    it('detects document.write()', () => {
      expect(rule.patterns.some((p) => p.test('document.write(html)'))).toBe(true);
    });

    it('detects document.write with whitespace before paren', () => {
      expect(rule.patterns.some((p) => p.test('document.write (html)'))).toBe(true);
    });

    it('detects document.writeln()', () => {
      expect(rule.patterns.some((p) => p.test('document.writeln(html)'))).toBe(true);
    });

    it('does not flag document.getElementById', () => {
      expect(rule.patterns.some((p) => p.test('document.getElementById("id")'))).toBe(false);
    });

    it('does not flag console.log', () => {
      expect(rule.patterns.some((p) => p.test('console.log("hello")'))).toBe(false);
    });
  });
});
