import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  MermaidParser,
  D2Parser,
  PlantUmlParser,
  DiagramParser,
  type DiagramEntity,
  type DiagramRelationship,
  type DiagramParseResult,
} from '../../src/ingest/DiagramParser.js';
import { GraphStore } from '../../src/store/GraphStore.js';

const FIXTURES_DIR = path.resolve(__dirname, '../../__fixtures__/diagrams');
const MERMAID_FIXTURES_DIR = path.resolve(__dirname, '../../__fixtures__/diagrams');

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

describe('D2Parser', () => {
  const parser = new D2Parser();

  describe('canParse()', () => {
    it('returns true for .d2 extension', () => {
      expect(parser.canParse('', '.d2')).toBe(true);
    });

    it('returns false for .mmd extension', () => {
      expect(parser.canParse('', '.mmd')).toBe(false);
    });

    it('returns false for .puml extension', () => {
      expect(parser.canParse('', '.puml')).toBe(false);
    });
  });

  describe('architecture diagram parsing', () => {
    const content = fs.readFileSync(path.join(FIXTURES_DIR, 'architecture.d2'), 'utf-8');
    const result = parser.parse(content, 'architecture.d2');

    it('extracts 3 entities with labels', () => {
      expect(result.entities).toHaveLength(3);
      const ids = result.entities.map((e) => e.id);
      expect(ids).toContain('server');
      expect(ids).toContain('db');
      expect(ids).toContain('cache');

      const server = result.entities.find((e) => e.id === 'server');
      expect(server?.label).toBe('Web Server');

      const db = result.entities.find((e) => e.id === 'db');
      expect(db?.label).toBe('PostgreSQL');
    });

    it('extracts 3 connections with labels', () => {
      expect(result.relationships).toHaveLength(3);

      const queries = result.relationships.find((r) => r.label === 'queries');
      expect(queries).toBeDefined();
      expect(queries?.from).toBe('server');
      expect(queries?.to).toBe('db');

      const sessionLookup = result.relationships.find((r) => r.label === 'session lookup');
      expect(sessionLookup).toBeDefined();
      expect(sessionLookup?.from).toBe('server');
      expect(sessionLookup?.to).toBe('cache');
    });

    it('sets metadata.format to d2', () => {
      expect(result.metadata.format).toBe('d2');
      expect(result.metadata.diagramType).toBe('architecture');
    });
  });

  describe('edge cases', () => {
    it('returns empty result for empty content', () => {
      const result = parser.parse('', 'empty.d2');
      expect(result.entities).toHaveLength(0);
      expect(result.relationships).toHaveLength(0);
    });
  });
});

describe('PlantUmlParser', () => {
  const parser = new PlantUmlParser();

  describe('canParse()', () => {
    it('returns true for .puml extension', () => {
      expect(parser.canParse('', '.puml')).toBe(true);
    });

    it('returns true for .plantuml extension', () => {
      expect(parser.canParse('', '.plantuml')).toBe(true);
    });

    it('returns false for .mmd extension', () => {
      expect(parser.canParse('', '.mmd')).toBe(false);
    });
  });

  describe('class diagram parsing', () => {
    const content = fs.readFileSync(path.join(FIXTURES_DIR, 'class.puml'), 'utf-8');
    const result = parser.parse(content, 'class.puml');

    it('extracts 2 classes', () => {
      expect(result.entities).toHaveLength(2);
      const ids = result.entities.map((e) => e.id);
      expect(ids).toContain('AuthService');
      expect(ids).toContain('TokenStore');
    });

    it('extracts 1 relationship with label', () => {
      expect(result.relationships).toHaveLength(1);
      expect(result.relationships[0].from).toBe('AuthService');
      expect(result.relationships[0].to).toBe('TokenStore');
      expect(result.relationships[0].label).toBe('uses');
    });

    it('sets metadata.format to plantuml and diagramType to class', () => {
      expect(result.metadata.format).toBe('plantuml');
      expect(result.metadata.diagramType).toBe('class');
    });
  });

  describe('edge cases', () => {
    it('returns empty result for empty content', () => {
      const result = parser.parse('', 'empty.puml');
      expect(result.entities).toHaveLength(0);
      expect(result.relationships).toHaveLength(0);
    });
  });
});

describe('DiagramParser (orchestrator)', () => {
  let store: GraphStore;

  beforeEach(() => {
    store = new GraphStore();
  });

  describe('parse()', () => {
    it('dispatches .mmd to MermaidParser', () => {
      const parser = new DiagramParser(store);
      const content = 'graph TD\n  A[Start] --> B[End]';
      const result = parser.parse(content, 'test.mmd');
      expect(result.metadata.format).toBe('mermaid');
      expect(result.entities.length).toBeGreaterThan(0);
    });

    it('dispatches .d2 to D2Parser', () => {
      const parser = new DiagramParser(store);
      const content = 'server: Web Server\ndb: PostgreSQL\nserver -> db: queries';
      const result = parser.parse(content, 'test.d2');
      expect(result.metadata.format).toBe('d2');
      expect(result.entities.length).toBeGreaterThan(0);
    });

    it('dispatches .puml to PlantUmlParser', () => {
      const parser = new DiagramParser(store);
      const content = '@startuml\nclass Foo\n@enduml';
      const result = parser.parse(content, 'test.puml');
      expect(result.metadata.format).toBe('plantuml');
      expect(result.entities.length).toBeGreaterThan(0);
    });

    it('returns empty result for unknown extension', () => {
      const parser = new DiagramParser(store);
      const result = parser.parse('some content', 'test.txt');
      expect(result.entities).toHaveLength(0);
      expect(result.relationships).toHaveLength(0);
    });
  });

  describe('ingest()', () => {
    it('creates business_concept nodes for each entity', async () => {
      const parser = new DiagramParser(store);
      const result = await parser.ingest(FIXTURES_DIR);
      const concepts = store.findNodes({ type: 'business_concept' });
      expect(concepts.length).toBeGreaterThanOrEqual(5); // 3 from D2 + 2 from PlantUML
      expect(result.nodesAdded).toBe(concepts.length);
    });

    it('creates references edges for relationships', async () => {
      const parser = new DiagramParser(store);
      await parser.ingest(FIXTURES_DIR);
      const edges = store.getEdges({ type: 'references' });
      expect(edges.length).toBeGreaterThanOrEqual(4); // 3 from D2 + 1 from PlantUML
    });

    it('sets confidence to 0.85 on all nodes', async () => {
      const parser = new DiagramParser(store);
      await parser.ingest(FIXTURES_DIR);
      const concepts = store.findNodes({ type: 'business_concept' });
      for (const node of concepts) {
        expect(node.metadata.confidence).toBe(0.85);
      }
    });

    it('uses deterministic node IDs: diagram:<pathHash>:<entityId>', async () => {
      const parser = new DiagramParser(store);
      await parser.ingest(FIXTURES_DIR);
      const concepts = store.findNodes({ type: 'business_concept' });
      for (const node of concepts) {
        expect(node.id).toMatch(/^diagram:[a-f0-9]+:.+$/);
      }
    });

    it('returns IngestResult with correct counts', async () => {
      const parser = new DiagramParser(store);
      const result = await parser.ingest(FIXTURES_DIR);
      expect(result.nodesAdded).toBeGreaterThan(0);
      expect(result.edgesAdded).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
