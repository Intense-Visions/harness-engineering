// packages/graph/tests/constraints/DesignConstraintAdapter.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import {
  DesignConstraintAdapter,
  type DesignViolation,
} from '../../src/constraints/DesignConstraintAdapter.js';

describe('DesignConstraintAdapter', () => {
  let store: GraphStore;
  let adapter: DesignConstraintAdapter;

  function seedTokens(): void {
    store.addNode({
      id: 'design_token:color.primary',
      type: 'design_token',
      name: 'color.primary',
      metadata: { tokenType: 'color', value: '#2563eb', group: 'color' },
    });
    store.addNode({
      id: 'design_token:color.error',
      type: 'design_token',
      name: 'color.error',
      metadata: { tokenType: 'color', value: '#dc2626', group: 'color' },
    });
    store.addNode({
      id: 'design_token:typography.body',
      type: 'design_token',
      name: 'typography.body',
      metadata: {
        tokenType: 'typography',
        value: { fontFamily: 'Geist', fontSize: '1rem', fontWeight: 400, lineHeight: 1.6 },
        group: 'typography',
      },
    });
  }

  function seedConstraints(): void {
    store.addNode({
      id: 'design_constraint:no-system-fonts',
      type: 'design_constraint',
      name: 'No system/default fonts in user-facing UI',
      metadata: {
        rule: 'No system/default fonts in user-facing UI',
        severity: 'warn',
        scope: 'project',
      },
    });
  }

  beforeEach(() => {
    store = new GraphStore();
    adapter = new DesignConstraintAdapter(store);
  });

  describe('checkForHardcodedColors', () => {
    it('detects hardcoded hex colors that are NOT in the token set', () => {
      seedTokens();

      // This source uses #3b82f6 which is NOT a token value
      const source = 'const style = { color: "#3b82f6", background: "#ffffff" };';
      const violations = adapter.checkForHardcodedColors(source, 'src/components/Button.tsx');

      expect(violations.length).toBeGreaterThanOrEqual(1);
      expect(violations[0]!.code).toMatch(/^DESIGN-/);
      expect(violations[0]!.file).toBe('src/components/Button.tsx');
      expect(violations[0]!.message).toContain('#3b82f6');
    });

    it('does NOT flag colors that match token values', () => {
      seedTokens();

      // Uses #2563eb which IS the primary token value
      const source = 'const style = { color: "#2563eb" };';
      const violations = adapter.checkForHardcodedColors(source, 'src/components/Button.tsx');

      expect(violations).toHaveLength(0);
    });

    it('returns empty for source with no hex colors', () => {
      seedTokens();

      const source = 'export function Button() { return <button>Click</button>; }';
      const violations = adapter.checkForHardcodedColors(source, 'src/components/Button.tsx');

      expect(violations).toHaveLength(0);
    });
  });

  describe('checkForHardcodedFonts', () => {
    it('detects font families not in the token set', () => {
      seedTokens();

      const source = "const style = { fontFamily: 'Inter' };";
      const violations = adapter.checkForHardcodedFonts(source, 'src/components/Card.tsx');

      expect(violations.length).toBeGreaterThanOrEqual(1);
      expect(violations[0]!.code).toMatch(/^DESIGN-/);
    });

    it('does NOT flag font families that match token values', () => {
      seedTokens();

      const source = "const style = { fontFamily: 'Geist' };";
      const violations = adapter.checkForHardcodedFonts(source, 'src/components/Card.tsx');

      expect(violations).toHaveLength(0);
    });
  });

  describe('severity mapping', () => {
    it('maps violations to info severity for permissive strictness', () => {
      seedTokens();

      const source = 'const style = { color: "#3b82f6" };';
      const violations = adapter.checkForHardcodedColors(source, 'test.tsx', 'permissive');

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]!.severity).toBe('info');
    });

    it('maps violations to warn severity for standard strictness', () => {
      seedTokens();

      const source = 'const style = { color: "#3b82f6" };';
      const violations = adapter.checkForHardcodedColors(source, 'test.tsx', 'standard');

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]!.severity).toBe('warn');
    });

    it('maps violations to error severity for strict strictness', () => {
      seedTokens();

      const source = 'const style = { color: "#3b82f6" };';
      const violations = adapter.checkForHardcodedColors(source, 'test.tsx', 'strict');

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]!.severity).toBe('error');
    });

    it('defaults to standard strictness when not specified', () => {
      seedTokens();

      const source = 'const style = { color: "#3b82f6" };';
      const violations = adapter.checkForHardcodedColors(source, 'test.tsx');

      expect(violations[0]!.severity).toBe('warn');
    });
  });

  describe('checkAll', () => {
    it('combines color and font violations', () => {
      seedTokens();

      const source = `
        const style = {
          color: "#3b82f6",
          fontFamily: "Arial"
        };
      `;
      const violations = adapter.checkAll(source, 'test.tsx');

      expect(violations.length).toBeGreaterThanOrEqual(2);
      const codes = violations.map((v) => v.code);
      expect(codes.some((c) => c.includes('DESIGN-001'))).toBe(true); // hardcoded color
      expect(codes.some((c) => c.includes('DESIGN-002'))).toBe(true); // hardcoded font
    });
  });
});
