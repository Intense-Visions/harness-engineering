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

  describe('recordFindings (craft skills)', () => {
    it('creates a design_constraint node per unique finding code', () => {
      const result = adapter.recordFindings([
        {
          code: 'ANAT-D001',
          file: 'src/Button.tsx',
          line: 14,
          message: 'Button is missing required state: loading',
          severity: 'error',
        },
        {
          code: 'CRAFT-C001',
          file: 'src/Page.tsx',
          line: 88,
          message: 'Three buttons compete for primary; hierarchy muddy',
          severity: 'warn',
          evidence: '<Button variant="primary">Save</Button>',
          runId: 'run-2026-05-24-001',
        },
      ]);

      expect(result.constraintsAdded).toBe(2);
      expect(result.edgesAdded).toBe(2);

      const constraints = store.findNodes({ type: 'design_constraint' });
      expect(constraints).toHaveLength(2);
      expect(constraints.map((n) => n.name).sort()).toEqual(['ANAT-D001', 'CRAFT-C001']);

      const anatNode = constraints.find((n) => n.name === 'ANAT-D001')!;
      expect(anatNode.metadata.label).toBe('Component anatomy (definition)');
      expect(anatNode.metadata.mostRecentSeverity).toBe('error');

      const craftNode = constraints.find((n) => n.name === 'CRAFT-C001')!;
      expect(craftNode.metadata.label).toBe('Design craft (critique)');
      expect(craftNode.metadata.mostRecentMessage).toContain('hierarchy muddy');
    });

    it('emits violates_design edges from file -> constraint with metadata', () => {
      adapter.recordFindings([
        {
          code: 'ANAT-P001',
          file: 'src/List.tsx',
          line: 80,
          message: 'map() over data with no empty branch',
          severity: 'warn',
          evidence: 'items.map(...)',
          runId: 'run-x',
        },
      ]);

      const edges = store.getEdges({
        from: 'src/List.tsx',
        to: 'design_constraint:ANAT-P001',
        type: 'violates_design',
      });
      expect(edges).toHaveLength(1);
      expect(edges[0]!.metadata).toMatchObject({
        line: 80,
        severity: 'warn',
        message: 'map() over data with no empty branch',
        evidence: 'items.map(...)',
        runId: 'run-x',
      });
    });

    it('is idempotent — re-recording the same finding produces no duplicates', () => {
      const finding = {
        code: 'CRAFT-P001',
        file: 'src/Modal.tsx',
        line: 42,
        message: 'Spring physics would feel more confident',
        severity: 'info' as const,
      };

      const first = adapter.recordFindings([finding]);
      const second = adapter.recordFindings([finding]);

      expect(first.constraintsAdded).toBe(1);
      expect(first.edgesAdded).toBe(1);
      expect(second.constraintsAdded).toBe(0);
      expect(second.edgesAdded).toBe(0);

      expect(store.findNodes({ type: 'design_constraint' })).toHaveLength(1);
      expect(
        store.getEdges({
          from: 'src/Modal.tsx',
          to: 'design_constraint:CRAFT-P001',
          type: 'violates_design',
        })
      ).toHaveLength(1);
    });

    it('labels each known code-prefix namespace', () => {
      const findings = [
        { code: 'ANAT-D001', label: 'Component anatomy (definition)' },
        { code: 'ANAT-P001', label: 'Component anatomy (pattern presence)' },
        { code: 'ANAT-U001', label: 'Component anatomy (usage)' },
        { code: 'CRAFT-C001', label: 'Design craft (critique)' },
        { code: 'CRAFT-P001', label: 'Design craft (polish)' },
        { code: 'CRAFT-B001', label: 'Design craft (benchmark)' },
        { code: 'DESIGN-001', label: 'Design constraint (legacy)' },
        { code: 'A11Y-010', label: 'Accessibility' },
      ];

      adapter.recordFindings(
        findings.map((f) => ({
          code: f.code,
          file: 'src/A.tsx',
          message: 'msg',
          severity: 'warn' as const,
        }))
      );

      for (const f of findings) {
        const node = store.getNode(`design_constraint:${f.code}`)!;
        expect(node.metadata.label, `label for ${f.code}`).toBe(f.label);
      }
    });

    it('labels unknown code prefixes with the generic fallback', () => {
      adapter.recordFindings([
        {
          code: 'UNKNOWN-999',
          file: 'src/X.tsx',
          message: 'mystery finding',
          severity: 'info',
        },
      ]);

      const node = store.getNode('design_constraint:UNKNOWN-999')!;
      expect(node.metadata.label).toBe('Design constraint');
    });

    it('accepts findings with no line, evidence, or runId', () => {
      const result = adapter.recordFindings([
        {
          code: 'ANAT-D000',
          file: 'src/Y.tsx',
          message: 'JSDoc divergence',
          severity: 'info',
        },
      ]);
      expect(result.edgesAdded).toBe(1);
      const edges = store.getEdges({ type: 'violates_design' });
      expect(edges[0]!.metadata).not.toHaveProperty('line');
      expect(edges[0]!.metadata).not.toHaveProperty('evidence');
      expect(edges[0]!.metadata).not.toHaveProperty('runId');
    });

    it('handles an empty findings array gracefully', () => {
      const result = adapter.recordFindings([]);
      expect(result).toEqual({ constraintsAdded: 0, edgesAdded: 0 });
    });
  });
});
