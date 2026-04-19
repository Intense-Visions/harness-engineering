import { describe, it, expect } from 'vitest';
import { pathTraversalRules } from '../../../src/security/rules/path-traversal';

describe('Path Traversal rules', () => {
  describe('SEC-PTH-001 — Path Traversal Pattern', () => {
    const rule = pathTraversalRules.find((r) => r.id === 'SEC-PTH-001')!;

    it('exists with correct metadata', () => {
      expect(rule).toBeDefined();
      expect(rule.category).toBe('path-traversal');
      expect(rule.severity).toBe('warning');
      expect(rule.confidence).toBe('medium');
      expect(rule.references).toContain('CWE-22');
    });

    // True positives: ../ pattern in file operations
    it('detects readFile with ../', () => {
      expect(rule.patterns.some((p) => p.test("readFile('../etc/passwd')"))).toBe(true);
    });

    it('detects readFileSync with ../', () => {
      expect(rule.patterns.some((p) => p.test("readFileSync('../../secret')"))).toBe(true);
    });

    it('detects writeFile with ../', () => {
      expect(rule.patterns.some((p) => p.test("writeFile('../output/data')"))).toBe(true);
    });

    it('detects writeFileSync with ../', () => {
      expect(rule.patterns.some((p) => p.test("writeFileSync('../config.json')"))).toBe(true);
    });

    it('detects createReadStream with ../', () => {
      expect(rule.patterns.some((p) => p.test("createReadStream('../data/file')"))).toBe(true);
    });

    it('detects createWriteStream with ../', () => {
      expect(rule.patterns.some((p) => p.test("createWriteStream('../out/log')"))).toBe(true);
    });

    it('detects unlink with ../', () => {
      expect(rule.patterns.some((p) => p.test("unlink('../temp/file')"))).toBe(true);
    });

    it('detects backslash traversal (..\\)', () => {
      expect(rule.patterns.some((p) => p.test("readFile('..\\\\secret')"))).toBe(true);
    });

    // True positives: string concatenation in file operations
    it('detects readFile with string concatenation', () => {
      expect(rule.patterns.some((p) => p.test('readFile(basePath + userInput)'))).toBe(true);
    });

    it('detects writeFileSync with string concatenation', () => {
      expect(rule.patterns.some((p) => p.test('writeFileSync(dir + filename)'))).toBe(true);
    });

    // True negatives
    it('does not flag readFile with a safe literal path', () => {
      expect(rule.patterns.some((p) => p.test("readFile('/safe/path/file.txt')"))).toBe(false);
    });

    it('does not flag console.log with ../', () => {
      expect(rule.patterns.some((p) => p.test("console.log('../test')"))).toBe(false);
    });
  });
});
