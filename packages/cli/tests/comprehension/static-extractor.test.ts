import { describe, it, expect } from 'vitest';
import {
  isStaticSupported,
  renderInterfaceContract,
  renderDependencySlice,
} from '../../src/comprehension/static-extractor';

const SUPPORTED_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const UNSUPPORTED_EXTS = ['.py', '.go', '.rs'];

describe('static-extractor render primitives', () => {
  describe('isStaticSupported', () => {
    it('accepts the TS/JS family', () => {
      for (const ext of SUPPORTED_EXTS) {
        expect(isStaticSupported(ext)).toBe(true);
      }
    });
    it('rejects unsupported languages', () => {
      for (const ext of UNSUPPORTED_EXTS) {
        expect(isStaticSupported(ext)).toBe(false);
      }
    });
  });

  describe('renderInterfaceContract', () => {
    it('renders each export on its own line, deterministically sorted', () => {
      const out = renderInterfaceContract([{ name: 'compileModule' }, { name: 'Foo' }]);
      expect(out).toContain('compileModule');
      expect(out).toContain('Foo');
      const lines = out.split('\n').filter(Boolean);
      expect(lines).toHaveLength(2);
      // deterministic sort: 'Foo' (uppercase) sorts before 'compileModule'
      expect(lines[0]).toContain('Foo');
      expect(lines[1]).toContain('compileModule');
    });
    it('dedups by name', () => {
      const out = renderInterfaceContract([{ name: 'Foo' }, { name: 'Foo' }]);
      expect(out.split('\n').filter(Boolean)).toHaveLength(1);
    });
    it('renders an empty surface as an empty string (never faked)', () => {
      expect(renderInterfaceContract([])).toBe('');
    });
  });

  describe('renderDependencySlice', () => {
    it('groups specifiers by source, one line per source, sorted', () => {
      const out = renderDependencySlice([
        { source: 'node:crypto', specifiers: ['createHash'] },
        { source: './types', specifiers: ['SourceFile'] },
      ]);
      expect(out).toContain('node:crypto');
      expect(out).toContain('createHash');
      expect(out).toContain('./types');
      expect(out).toContain('SourceFile');
      const lines = out.split('\n').filter(Boolean);
      expect(lines).toHaveLength(2);
      // sorted by source: './types' before 'node:crypto'
      expect(lines[0]).toContain('./types');
      expect(lines[1]).toContain('node:crypto');
    });
    it('folds a default and namespace import into the source line', () => {
      const out = renderDependencySlice([
        { source: 'react', default: 'React' },
        { source: 'node:path', namespace: 'path' },
      ]);
      expect(out).toContain('React');
      expect(out).toContain('react');
      expect(out).toContain('path');
      expect(out).toContain('node:path');
    });
    it('renders an empty slice as an empty string', () => {
      expect(renderDependencySlice([])).toBe('');
    });
  });
});
