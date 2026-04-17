import { describe, it, expect, beforeAll, vi } from 'vitest';
import { getParser, parseFile, resetParserCache } from '../../src/code-nav/parser';
import * as path from 'path';

const FIXTURES = path.resolve(__dirname, '../fixtures/code-nav');

describe('code-nav parser', () => {
  beforeAll(() => {
    resetParserCache();
  });

  describe('getParser', () => {
    it('should return a parser for typescript', async () => {
      const parser = await getParser('typescript');
      expect(parser).toBeDefined();
    });

    it('should return a parser for javascript', async () => {
      const parser = await getParser('javascript');
      expect(parser).toBeDefined();
    });

    it('should return a parser for python', async () => {
      const parser = await getParser('python');
      expect(parser).toBeDefined();
    });

    it('should return a parser for go', async () => {
      const parser = await getParser('go');
      expect(parser).toBeDefined();
    });

    it('should return a parser for rust', async () => {
      const parser = await getParser('rust');
      expect(parser).toBeDefined();
    });

    it('should return a parser for java', async () => {
      const parser = await getParser('java');
      expect(parser).toBeDefined();
    });

    it('should cache parser instances', async () => {
      const p1 = await getParser('typescript');
      const p2 = await getParser('typescript');
      expect(p1).toBe(p2);
    });
  });

  describe('parseFile', () => {
    it('should parse a TypeScript file', async () => {
      const result = await parseFile(path.join(FIXTURES, 'sample.ts'));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.tree).toBeDefined();
        expect(result.value.language).toBe('typescript');
        expect(result.value.source).toContain('class AuthMiddleware');
      }
    });

    it('should parse a JavaScript file', async () => {
      const result = await parseFile(path.join(FIXTURES, 'sample.js'));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.language).toBe('javascript');
      }
    });

    it('should parse a Python file', async () => {
      const result = await parseFile(path.join(FIXTURES, 'sample.py'));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.language).toBe('python');
      }
    });

    it('should parse a Go file', async () => {
      const result = await parseFile(path.join(FIXTURES, 'sample.go'));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.language).toBe('go');
      }
    });

    it('should parse a Rust file', async () => {
      const result = await parseFile(path.join(FIXTURES, 'sample.rs'));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.language).toBe('rust');
      }
    });

    it('should parse a Java file', async () => {
      const result = await parseFile(path.join(FIXTURES, 'sample.java'));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.language).toBe('java');
      }
    });

    it('should return error for unsupported extension', async () => {
      const result = await parseFile('/tmp/test.xyz');
      expect(result.ok).toBe(false);
    });

    it('should return error for non-existent file', async () => {
      const result = await parseFile('/tmp/nonexistent.ts');
      expect(result.ok).toBe(false);
    });

    it('should return PARSE_FAILED error when parser.parse throws', async () => {
      // Get a real parser, then make its parse method throw
      const parser = await getParser('typescript');
      const parseSpy = vi.spyOn(parser, 'parse').mockImplementationOnce(() => {
        throw new Error('wasm parse exploded');
      });
      const result = await parseFile(path.join(FIXTURES, 'sample.ts'));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PARSE_FAILED');
        expect(result.error.message).toContain('wasm parse exploded');
      }
      parseSpy.mockRestore();
    });
  });
});
