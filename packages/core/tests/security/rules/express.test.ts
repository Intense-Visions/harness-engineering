import { describe, it, expect } from 'vitest';
import { expressRules } from '../../../src/security/rules/stack/express';

describe('Express stack rules', () => {
  it('all rules have stack: ["express"] and correct id prefix', () => {
    expect(expressRules.length).toBeGreaterThan(0);
    for (const rule of expressRules) {
      expect(rule.stack).toContain('express');
      expect(rule.id).toMatch(/^SEC-EXPRESS-/);
    }
  });

  describe('SEC-EXPRESS-001 — Missing Helmet', () => {
    const rule = expressRules.find((r) => r.id === 'SEC-EXPRESS-001')!;

    it('has correct metadata', () => {
      expect(rule.severity).toBe('info');
      expect(rule.confidence).toBe('low');
      expect(rule.references).toContain('CWE-693');
      expect(rule.fileGlob).toBe('**/app.{ts,js}');
    });

    it('detects const app = express()', () => {
      expect(rule.patterns.some((p) => p.test('const app = express()'))).toBe(true);
    });

    it('detects let app = express()', () => {
      expect(rule.patterns.some((p) => p.test('let app = express()'))).toBe(true);
    });

    it('detects var app = express()', () => {
      expect(rule.patterns.some((p) => p.test('var app = express()'))).toBe(true);
    });

    it('does not flag createApp()', () => {
      expect(rule.patterns.some((p) => p.test('const app = createApp()'))).toBe(false);
    });

    it('does not flag express.Router()', () => {
      expect(rule.patterns.some((p) => p.test('const router = express.Router()'))).toBe(false);
    });
  });

  describe('SEC-EXPRESS-002 — Unprotected Route with Body Parsing', () => {
    const rule = expressRules.find((r) => r.id === 'SEC-EXPRESS-002')!;

    it('has correct metadata', () => {
      expect(rule.severity).toBe('info');
      expect(rule.confidence).toBe('low');
      expect(rule.references).toContain('CWE-770');
    });

    it('detects app.post with req handler', () => {
      expect(rule.patterns.some((p) => p.test("app.post('/api/users', req, res)"))).toBe(true);
    });

    it('detects app.put with request handler', () => {
      expect(rule.patterns.some((p) => p.test("app.put('/api/data', request)"))).toBe(true);
    });

    it('detects app.patch with req handler', () => {
      expect(rule.patterns.some((p) => p.test("app.patch('/api/item', req, res)"))).toBe(true);
    });

    it('does not flag app.get routes', () => {
      expect(rule.patterns.some((p) => p.test("app.get('/api/users', req, res)"))).toBe(false);
    });

    it('does not flag app.delete routes', () => {
      expect(rule.patterns.some((p) => p.test("app.delete('/api/users', req, res)"))).toBe(false);
    });
  });
});
