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

  it('detects ../ in writeFileSync', () => {
    const rule = pathTraversalRules.find((r) => r.id === 'SEC-PTH-001')!;
    expect(rule.patterns.some((p) => p.test('writeFileSync("../../etc/passwd", data)'))).toBe(
      true
    );
  });

  it('detects ../ in createReadStream', () => {
    const rule = pathTraversalRules.find((r) => r.id === 'SEC-PTH-001')!;
    expect(rule.patterns.some((p) => p.test('createReadStream(dir + "/../secret")'))).toBe(true);
  });

  it('detects string concatenation in readFile', () => {
    const rule = pathTraversalRules.find((r) => r.id === 'SEC-PTH-001')!;
    expect(rule.patterns.some((p) => p.test('readFile(basePath + userInput)'))).toBe(true);
  });

  it('detects string concatenation in writeFileSync', () => {
    const rule = pathTraversalRules.find((r) => r.id === 'SEC-PTH-001')!;
    expect(rule.patterns.some((p) => p.test('writeFileSync(dir + filename, data)'))).toBe(true);
  });

  it('does not flag safe path.join usage', () => {
    const rule = pathTraversalRules.find((r) => r.id === 'SEC-PTH-001')!;
    expect(rule.patterns.some((p) => p.test('readFile(path.join(dir, file))'))).toBe(false);
  });

  it('has correct metadata', () => {
    const rule = pathTraversalRules.find((r) => r.id === 'SEC-PTH-001')!;
    expect(rule.confidence).toBe('medium');
    expect(rule.references).toContain('CWE-22');
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

  it('detects JSON.parse(req.body)', () => {
    const rule = deserializationRules.find((r) => r.id === 'SEC-DES-001')!;
    expect(rule.patterns.some((p) => p.test('const data = JSON.parse(req.body)'))).toBe(true);
  });

  it('detects JSON.parse(request.body)', () => {
    const rule = deserializationRules.find((r) => r.id === 'SEC-DES-001')!;
    expect(rule.patterns.some((p) => p.test('JSON.parse(request.body)'))).toBe(true);
  });

  it('detects JSON.parse(event)', () => {
    const rule = deserializationRules.find((r) => r.id === 'SEC-DES-001')!;
    expect(rule.patterns.some((p) => p.test('const obj = JSON.parse(event.body)'))).toBe(true);
  });

  it('detects JSON.parse(data)', () => {
    const rule = deserializationRules.find((r) => r.id === 'SEC-DES-001')!;
    expect(rule.patterns.some((p) => p.test('JSON.parse(data)'))).toBe(true);
  });

  it('detects JSON.parse(payload)', () => {
    const rule = deserializationRules.find((r) => r.id === 'SEC-DES-001')!;
    expect(rule.patterns.some((p) => p.test('JSON.parse(payload)'))).toBe(true);
  });

  it('detects JSON.parse(input)', () => {
    const rule = deserializationRules.find((r) => r.id === 'SEC-DES-001')!;
    expect(rule.patterns.some((p) => p.test('JSON.parse(input)'))).toBe(true);
  });

  it('does not flag JSON.parse with literal', () => {
    const rule = deserializationRules.find((r) => r.id === 'SEC-DES-001')!;
    expect(rule.patterns.some((p) => p.test(`JSON.parse('{"a":1}')`))).toBe(false);
  });

  it('has correct metadata', () => {
    const rule = deserializationRules.find((r) => r.id === 'SEC-DES-001')!;
    expect(rule.confidence).toBe('medium');
    expect(rule.references).toContain('CWE-502');
  });
});
