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

  it('detects prototype[] access', () => {
    const rule = nodeRules.find((r) => r.id === 'SEC-NODE-001')!;
    expect(rule.patterns.some((p) => p.test('obj.prototype[key] = val'))).toBe(true);
  });

  it('detects Object.assign with query input', () => {
    const rule = nodeRules.find((r) => r.id === 'SEC-NODE-001')!;
    expect(rule.patterns.some((p) => p.test('Object.assign(target, query)'))).toBe(true);
  });

  it('detects NoSQL injection with $gt operator', () => {
    const rule = nodeRules.find((r) => r.id === 'SEC-NODE-002')!;
    expect(rule).toBeDefined();
    expect(rule.patterns.some((p) => p.test('db.find({ age: { $gt: input } })'))).toBe(true);
  });

  it('detects NoSQL injection with $ne operator', () => {
    const rule = nodeRules.find((r) => r.id === 'SEC-NODE-002')!;
    expect(rule.patterns.some((p) => p.test('users.find({ password: { $ne: "" } })'))).toBe(true);
  });

  it('detects NoSQL injection with $regex operator', () => {
    const rule = nodeRules.find((r) => r.id === 'SEC-NODE-002')!;
    expect(rule.patterns.some((p) => p.test('col.find({ name: { $regex: userInput } })'))).toBe(
      true
    );
  });

  it('detects NoSQL injection with $where operator', () => {
    const rule = nodeRules.find((r) => r.id === 'SEC-NODE-002')!;
    expect(rule.patterns.some((p) => p.test('db.find({ $where: "this.a > " + input })'))).toBe(
      true
    );
  });

  it('detects find with req.body directly', () => {
    const rule = nodeRules.find((r) => r.id === 'SEC-NODE-002')!;
    expect(rule.patterns.some((p) => p.test('users.find(req.body)'))).toBe(true);
  });

  it('detects find with req.query directly', () => {
    const rule = nodeRules.find((r) => r.id === 'SEC-NODE-002')!;
    expect(rule.patterns.some((p) => p.test('db.find(request.query)'))).toBe(true);
  });

  it('does not flag find with static query', () => {
    const rule = nodeRules.find((r) => r.id === 'SEC-NODE-002')!;
    expect(rule.patterns.some((p) => p.test('users.find({ active: true })'))).toBe(false);
  });

  it('has correct metadata for NoSQL injection', () => {
    const rule = nodeRules.find((r) => r.id === 'SEC-NODE-002')!;
    expect(rule.severity).toBe('warning');
    expect(rule.confidence).toBe('medium');
    expect(rule.references).toContain('CWE-943');
  });
});

describe('Express rules', () => {
  it('all have stack: ["express"]', () => {
    for (const rule of expressRules) {
      expect(rule.stack).toContain('express');
      expect(rule.id).toMatch(/^SEC-EXPRESS-/);
    }
  });

  it('detects Express app initialization for missing helmet', () => {
    const rule = expressRules.find((r) => r.id === 'SEC-EXPRESS-001')!;
    expect(rule.patterns.some((p) => p.test('const app = express()'))).toBe(true);
  });

  it('does not flag non-express assignments', () => {
    const rule = expressRules.find((r) => r.id === 'SEC-EXPRESS-001')!;
    expect(rule.patterns.some((p) => p.test('const app = createApp()'))).toBe(false);
  });

  it('detects unprotected POST route', () => {
    const rule = expressRules.find((r) => r.id === 'SEC-EXPRESS-002')!;
    expect(rule.patterns.some((p) => p.test("app.post('/api/users', req, res)"))).toBe(true);
  });

  it('detects unprotected PUT route', () => {
    const rule = expressRules.find((r) => r.id === 'SEC-EXPRESS-002')!;
    expect(rule.patterns.some((p) => p.test("app.put('/api/data', request)"))).toBe(true);
  });

  it('detects unprotected PATCH route', () => {
    const rule = expressRules.find((r) => r.id === 'SEC-EXPRESS-002')!;
    expect(rule.patterns.some((p) => p.test("app.patch('/api/item', req, res)"))).toBe(true);
  });

  it('does not flag GET routes', () => {
    const rule = expressRules.find((r) => r.id === 'SEC-EXPRESS-002')!;
    expect(rule.patterns.some((p) => p.test("app.get('/api/users', req, res)"))).toBe(false);
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

  it('detects unsafe.Pointer usage', () => {
    const rule = goRules.find((r) => r.id === 'SEC-GO-001')!;
    expect(rule.patterns.some((p) => p.test('p := unsafe.Pointer(&x)'))).toBe(true);
  });

  it('does not flag safe pointer usage', () => {
    const rule = goRules.find((r) => r.id === 'SEC-GO-001')!;
    expect(rule.patterns.some((p) => p.test('var p *int = &x'))).toBe(false);
  });

  it('detects format string injection with variable format', () => {
    const rule = goRules.find((r) => r.id === 'SEC-GO-002')!;
    expect(rule.patterns.some((p) => p.test('fmt.Sprintf(userFmt)'))).toBe(true);
  });

  it('does not flag literal format strings', () => {
    const rule = goRules.find((r) => r.id === 'SEC-GO-002')!;
    expect(rule.patterns.some((p) => p.test('fmt.Sprintf("%s", name)'))).toBe(false);
  });

  it('has correct metadata for unsafe pointer', () => {
    const rule = goRules.find((r) => r.id === 'SEC-GO-001')!;
    expect(rule.severity).toBe('warning');
    expect(rule.confidence).toBe('medium');
    expect(rule.references).toContain('CWE-119');
  });

  it('has correct metadata for format string injection', () => {
    const rule = goRules.find((r) => r.id === 'SEC-GO-002')!;
    expect(rule.severity).toBe('warning');
    expect(rule.references).toContain('CWE-134');
  });
});
