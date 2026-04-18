import { describe, it, expect } from 'vitest';
import { nodeRules } from '../../../src/security/rules/stack/node';

describe('Node.js stack rules', () => {
  it('all rules have stack: ["node"] and correct id prefix', () => {
    expect(nodeRules).toHaveLength(2);
    for (const rule of nodeRules) {
      expect(rule.stack).toContain('node');
      expect(rule.id).toMatch(/^SEC-NODE-/);
    }
  });

  describe('SEC-NODE-001 — Prototype Pollution', () => {
    const rule = nodeRules.find((r) => r.id === 'SEC-NODE-001')!;

    it('has correct metadata', () => {
      expect(rule.severity).toBe('warning');
      expect(rule.confidence).toBe('medium');
      expect(rule.references).toContain('CWE-1321');
      expect(rule.category).toBe('injection');
    });

    it('detects __proto__ access', () => {
      expect(rule.patterns.some((p) => p.test('obj.__proto__.polluted = true'))).toBe(true);
    });

    it('detects constructor bracket access', () => {
      expect(rule.patterns.some((p) => p.test('obj.constructor[key] = val'))).toBe(true);
    });

    it('detects prototype bracket access', () => {
      expect(rule.patterns.some((p) => p.test('obj.prototype[key] = val'))).toBe(true);
    });

    it('detects Object.assign with req.body', () => {
      expect(rule.patterns.some((p) => p.test('Object.assign(target, req.body)'))).toBe(true);
    });

    it('detects Object.assign with request input', () => {
      expect(rule.patterns.some((p) => p.test('Object.assign(obj, request.body)'))).toBe(true);
    });

    it('detects Object.assign with query', () => {
      expect(rule.patterns.some((p) => p.test('Object.assign(target, query)'))).toBe(true);
    });

    it('detects Object.assign with input', () => {
      expect(rule.patterns.some((p) => p.test('Object.assign(config, input)'))).toBe(true);
    });

    it('does not flag normal array bracket access', () => {
      expect(rule.patterns.some((p) => p.test('arr[0] = value'))).toBe(false);
    });

    it('does not flag Object.assign with safe sources', () => {
      expect(rule.patterns.some((p) => p.test('Object.assign(target, defaults)'))).toBe(false);
    });
  });

  describe('SEC-NODE-002 — NoSQL Injection', () => {
    const rule = nodeRules.find((r) => r.id === 'SEC-NODE-002')!;

    it('has correct metadata', () => {
      expect(rule.severity).toBe('warning');
      expect(rule.confidence).toBe('medium');
      expect(rule.references).toContain('CWE-943');
    });

    it('detects $gt operator in find', () => {
      expect(rule.patterns.some((p) => p.test('db.find({ age: { $gt: input } })'))).toBe(true);
    });

    it('detects $ne operator in find', () => {
      expect(rule.patterns.some((p) => p.test('users.find({ password: { $ne: "" } })'))).toBe(true);
    });

    it('detects $regex operator in find', () => {
      expect(rule.patterns.some((p) => p.test('col.find({ name: { $regex: userInput } })'))).toBe(
        true
      );
    });

    it('detects $where operator in find', () => {
      expect(rule.patterns.some((p) => p.test('db.find({ $where: "this.a > " + input })'))).toBe(
        true
      );
    });

    it('detects find with req.body directly', () => {
      expect(rule.patterns.some((p) => p.test('users.find(req.body)'))).toBe(true);
    });

    it('detects find with request.query directly', () => {
      expect(rule.patterns.some((p) => p.test('db.find(request.query)'))).toBe(true);
    });

    it('detects find with req.params directly', () => {
      expect(rule.patterns.some((p) => p.test('users.find(req.params)'))).toBe(true);
    });

    it('does not flag find with static query', () => {
      expect(rule.patterns.some((p) => p.test('users.find({ active: true })'))).toBe(false);
    });

    it('does not flag find with safe variable', () => {
      expect(rule.patterns.some((p) => p.test('users.find(sanitizedQuery)'))).toBe(false);
    });
  });
});
