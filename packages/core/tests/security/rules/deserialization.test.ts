import { describe, it, expect } from 'vitest';
import { deserializationRules } from '../../../src/security/rules/deserialization';

describe('Deserialization rules', () => {
  describe('SEC-DES-001 — Unvalidated JSON Parse', () => {
    const rule = deserializationRules.find((r) => r.id === 'SEC-DES-001')!;

    it('exists with correct metadata', () => {
      expect(rule).toBeDefined();
      expect(rule.category).toBe('deserialization');
      expect(rule.severity).toBe('warning');
      expect(rule.confidence).toBe('medium');
      expect(rule.references).toContain('CWE-502');
    });

    // True positives: req/request.body
    it('detects JSON.parse(req.body)', () => {
      expect(rule.patterns.some((p) => p.test('JSON.parse(req.body)'))).toBe(true);
    });

    it('detects JSON.parse(request.body)', () => {
      expect(rule.patterns.some((p) => p.test('JSON.parse(request.body)'))).toBe(true);
    });

    it('detects JSON.parse with whitespace', () => {
      expect(rule.patterns.some((p) => p.test('JSON.parse( req.body )'))).toBe(true);
    });

    // True positives: untrusted variable names
    it('detects JSON.parse(event)', () => {
      expect(rule.patterns.some((p) => p.test('JSON.parse(event)'))).toBe(true);
    });

    it('detects JSON.parse(data)', () => {
      expect(rule.patterns.some((p) => p.test('JSON.parse(data)'))).toBe(true);
    });

    it('detects JSON.parse(payload)', () => {
      expect(rule.patterns.some((p) => p.test('JSON.parse(payload)'))).toBe(true);
    });

    it('detects JSON.parse(input)', () => {
      expect(rule.patterns.some((p) => p.test('JSON.parse(input)'))).toBe(true);
    });

    it('detects JSON.parse(body)', () => {
      expect(rule.patterns.some((p) => p.test('JSON.parse(body)'))).toBe(true);
    });

    // True negatives
    it('does not flag JSON.parse with a string literal', () => {
      expect(rule.patterns.some((p) => p.test('JSON.parse(\'{"safe": true}\')'))).toBe(false);
    });

    it('does not flag JSON.stringify', () => {
      expect(rule.patterns.some((p) => p.test('JSON.stringify(data)'))).toBe(false);
    });

    it('does not flag JSON.parse with safe variable names', () => {
      expect(rule.patterns.some((p) => p.test('JSON.parse(configText)'))).toBe(false);
    });
  });
});
