import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  MermaidParser,
  type DiagramEntity,
  type DiagramRelationship,
  type DiagramParseResult,
} from '../../src/ingest/DiagramParser.js';

const FIXTURES_DIR = path.resolve(__dirname, '../../__fixtures__/diagrams');

describe('MermaidParser', () => {
  const parser = new MermaidParser();

  describe('canParse()', () => {
    it('returns true for .mmd extension', () => {
      expect(parser.canParse('', '.mmd')).toBe(true);
    });

    it('returns true for .mermaid extension', () => {
      expect(parser.canParse('', '.mermaid')).toBe(true);
    });

    it('returns false for .d2 extension', () => {
      expect(parser.canParse('', '.d2')).toBe(false);
    });

    it('returns false for .puml extension', () => {
      expect(parser.canParse('', '.puml')).toBe(false);
    });

    it('returns false for .ts extension', () => {
      expect(parser.canParse('', '.ts')).toBe(false);
    });
  });

  describe('flowchart parsing', () => {
    const content = fs.readFileSync(path.join(FIXTURES_DIR, 'flowchart.mmd'), 'utf-8');
    const result = parser.parse(content, 'flowchart.mmd');

    it('extracts 5 entities with labels', () => {
      expect(result.entities).toHaveLength(5);
      const ids = result.entities.map((e) => e.id);
      expect(ids).toContain('A');
      expect(ids).toContain('B');
      expect(ids).toContain('C');
      expect(ids).toContain('D');
      expect(ids).toContain('E');

      const authEntity = result.entities.find((e) => e.id === 'A');
      expect(authEntity?.label).toBe('Auth Service');

      const grantEntity = result.entities.find((e) => e.id === 'C');
      expect(grantEntity?.label).toBe('Grant Access');
    });

    it('identifies decision nodes with type "decision"', () => {
      const decisionNode = result.entities.find((e) => e.id === 'B');
      expect(decisionNode).toBeDefined();
      expect(decisionNode?.type).toBe('decision');
    });

    it('extracts 4 relationships with correct from/to', () => {
      expect(result.relationships).toHaveLength(4);

      const fromA = result.relationships.filter((r) => r.from === 'A');
      expect(fromA).toHaveLength(1);
      expect(fromA[0].to).toBe('B');

      const fromB = result.relationships.filter((r) => r.from === 'B');
      expect(fromB).toHaveLength(2);

      const fromC = result.relationships.filter((r) => r.from === 'C');
      expect(fromC).toHaveLength(1);
      expect(fromC[0].to).toBe('E');
    });

    it('captures edge labels (Yes, No)', () => {
      const yesEdge = result.relationships.find((r) => r.label === 'Yes');
      expect(yesEdge).toBeDefined();
      expect(yesEdge?.from).toBe('B');
      expect(yesEdge?.to).toBe('C');

      const noEdge = result.relationships.find((r) => r.label === 'No');
      expect(noEdge).toBeDefined();
      expect(noEdge?.from).toBe('B');
      expect(noEdge?.to).toBe('D');
    });

    it('sets metadata.format to mermaid and diagramType to flowchart', () => {
      expect(result.metadata.format).toBe('mermaid');
      expect(result.metadata.diagramType).toBe('flowchart');
    });
  });

  describe('sequence diagram parsing', () => {
    const content = fs.readFileSync(path.join(FIXTURES_DIR, 'sequence.mmd'), 'utf-8');
    const result = parser.parse(content, 'sequence.mmd');

    it('extracts 3 participants', () => {
      expect(result.entities).toHaveLength(3);
      const ids = result.entities.map((e) => e.id);
      expect(ids).toContain('Client');
      expect(ids).toContain('API');
      expect(ids).toContain('DB');
    });

    it('extracts 4 message relationships', () => {
      expect(result.relationships).toHaveLength(4);
    });

    it('captures message labels', () => {
      const postOrder = result.relationships.find((r) => r.label === 'POST /orders');
      expect(postOrder).toBeDefined();
      expect(postOrder?.from).toBe('Client');
      expect(postOrder?.to).toBe('API');

      const insertOrder = result.relationships.find((r) => r.label === 'INSERT order');
      expect(insertOrder).toBeDefined();
      expect(insertOrder?.from).toBe('API');
      expect(insertOrder?.to).toBe('DB');
    });

    it('sets diagramType to sequence', () => {
      expect(result.metadata.diagramType).toBe('sequence');
    });
  });

  describe('edge cases', () => {
    it('returns empty result for empty content', () => {
      const result = parser.parse('', 'empty.mmd');
      expect(result.entities).toHaveLength(0);
      expect(result.relationships).toHaveLength(0);
      expect(result.metadata.format).toBe('mermaid');
      expect(result.metadata.diagramType).toBe('unknown');
    });

    it('returns empty result for non-diagram text', () => {
      const result = parser.parse('Hello, this is just text.', 'text.mmd');
      expect(result.entities).toHaveLength(0);
      expect(result.relationships).toHaveLength(0);
      expect(result.metadata.format).toBe('mermaid');
      expect(result.metadata.diagramType).toBe('unknown');
    });
  });
});
