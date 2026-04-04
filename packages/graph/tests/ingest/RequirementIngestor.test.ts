import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { CodeIngestor } from '../../src/ingest/CodeIngestor.js';
import { RequirementIngestor } from '../../src/ingest/RequirementIngestor.js';

const FIXTURE_DIR = path.resolve(__dirname, '../../__fixtures__/sample-project');

describe('RequirementIngestor', () => {
  let store: GraphStore;
  let ingestor: RequirementIngestor;

  beforeEach(async () => {
    store = new GraphStore();
    // Ingest code first so convention-based linking has targets
    const codeIngestor = new CodeIngestor(store);
    await codeIngestor.ingest(FIXTURE_DIR);
    ingestor = new RequirementIngestor(store);
  });

  describe('ingestSpecs', () => {
    it('should create one requirement node per numbered item in Success Criteria section', async () => {
      const specsDir = path.join(FIXTURE_DIR, 'docs', 'changes');
      const result = await ingestor.ingestSpecs(specsDir);

      expect(result.nodesAdded).toBe(5);
      expect(result.errors).toHaveLength(0);

      const reqNodes = store.findNodes({ type: 'requirement' });
      expect(reqNodes).toHaveLength(5);
    });

    it('should set correct node id format req:<hash>:<index>', async () => {
      const specsDir = path.join(FIXTURE_DIR, 'docs', 'changes');
      await ingestor.ingestSpecs(specsDir);

      const reqNodes = store.findNodes({ type: 'requirement' });
      for (const node of reqNodes) {
        expect(node.id).toMatch(/^req:[a-f0-9]+:\d+$/);
      }
    });

    it('should populate requirement node metadata correctly', async () => {
      const specsDir = path.join(FIXTURE_DIR, 'docs', 'changes');
      await ingestor.ingestSpecs(specsDir);

      const reqNodes = store.findNodes({ type: 'requirement' });
      const firstReq = reqNodes.find((n) => (n.metadata.index as number) === 1);
      expect(firstReq).toBeDefined();
      expect(firstReq!.type).toBe('requirement');
      expect(firstReq!.name).toContain('AuthService.login');
      expect(firstReq!.name).toContain('valid credentials');
      expect(firstReq!.path).toContain('docs/changes/auth-feature/proposal.md');
      expect(firstReq!.metadata.specPath).toContain('docs/changes/auth-feature/proposal.md');
      expect(firstReq!.metadata.index).toBe(1);
      expect(firstReq!.metadata.section).toBe('Success Criteria');
      expect(firstReq!.metadata.rawText).toMatch(/^1\.\s+When/);
      expect(firstReq!.metadata.featureName).toBe('auth-feature');
    });

    it('should set location with correct line numbers', async () => {
      const specsDir = path.join(FIXTURE_DIR, 'docs', 'changes');
      await ingestor.ingestSpecs(specsDir);

      const reqNodes = store.findNodes({ type: 'requirement' });
      for (const node of reqNodes) {
        expect(node.location).toBeDefined();
        expect(node.location!.fileId).toContain('proposal.md');
        expect(node.location!.startLine).toBeGreaterThan(0);
        expect(node.location!.endLine).toBeGreaterThanOrEqual(node.location!.startLine);
      }
    });

    it('should detect EARS patterns in requirement text', async () => {
      const specsDir = path.join(FIXTURE_DIR, 'docs', 'changes');
      await ingestor.ingestSpecs(specsDir);

      const reqNodes = store.findNodes({ type: 'requirement' });

      // "When a user calls..." -> event-driven
      const eventReq = reqNodes.find((n) => (n.metadata.index as number) === 1);
      expect(eventReq!.metadata.earsPattern).toBe('event-driven');

      // "The system shall hash..." -> ubiquitous
      const ubiqReq = reqNodes.find((n) => (n.metadata.index as number) === 3);
      expect(ubiqReq!.metadata.earsPattern).toBe('ubiquitous');

      // "While the session..." -> state-driven
      const stateReq = reqNodes.find((n) => (n.metadata.index as number) === 4);
      expect(stateReq!.metadata.earsPattern).toBe('state-driven');

      // "If the token is expired, then the system shall not..." -> unwanted
      const unwantedReq = reqNodes.find((n) => (n.metadata.index as number) === 5);
      expect(unwantedReq!.metadata.earsPattern).toBe('unwanted');
    });

    it('should create specifies edge from requirement to spec document', async () => {
      const specsDir = path.join(FIXTURE_DIR, 'docs', 'changes');
      await ingestor.ingestSpecs(specsDir);

      const reqNodes = store.findNodes({ type: 'requirement' });
      for (const node of reqNodes) {
        const edges = store.getEdges({ from: node.id, type: 'specifies' });
        expect(edges.length).toBeGreaterThanOrEqual(1);
        // The target should be a document node for the spec
        const docEdge = edges[0]!;
        expect(docEdge.to).toContain('proposal.md');
      }
    });

    it('should return accurate IngestResult with counts and timing', async () => {
      const specsDir = path.join(FIXTURE_DIR, 'docs', 'changes');
      const result = await ingestor.ingestSpecs(specsDir);

      expect(result.nodesAdded).toBe(5);
      // At least specifies edges (5) + some convention-based edges
      expect(result.edgesAdded).toBeGreaterThanOrEqual(5);
      expect(result.nodesUpdated).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('convention-based linking', () => {
    it('should create requires edges to code files matching feature name pattern', async () => {
      const specsDir = path.join(FIXTURE_DIR, 'docs', 'changes');
      await ingestor.ingestSpecs(specsDir);

      const reqNodes = store.findNodes({ type: 'requirement' });
      // At least one requirement should have a requires edge via keyword overlap
      // (AuthService is mentioned in requirement text and exists as a code node)
      const allRequiresEdges = reqNodes.flatMap((n) =>
        store.getEdges({ from: n.id, type: 'requires' })
      );
      expect(allRequiresEdges.length).toBeGreaterThanOrEqual(1);

      // Check confidence metadata
      for (const edge of allRequiresEdges) {
        expect(edge.confidence).toBeGreaterThanOrEqual(0.5);
        expect(edge.confidence).toBeLessThanOrEqual(0.7);
        expect(edge.metadata).toBeDefined();
        expect(edge.metadata!.method).toBe('convention');
      }
    });

    it('should create requires edge via keyword overlap when requirement mentions a class name', async () => {
      const specsDir = path.join(FIXTURE_DIR, 'docs', 'changes');
      await ingestor.ingestSpecs(specsDir);

      // Requirement 1 mentions "AuthService" which is a class in the fixture
      const reqNodes = store.findNodes({ type: 'requirement' });
      const authReq = reqNodes.find((n) => (n.metadata.index as number) === 1);
      expect(authReq).toBeDefined();

      const edges = store.getEdges({ from: authReq!.id, type: 'requires' });
      const authEdge = edges.find((e) => {
        const target = store.getNode(e.to);
        return target?.name === 'AuthService';
      });
      expect(authEdge).toBeDefined();
      expect(authEdge!.confidence).toBe(0.6);
      expect(authEdge!.metadata!.matchReason).toBe('keyword-overlap');
    });

    it('should create requires edge via keyword overlap when requirement mentions a function name', async () => {
      const specsDir = path.join(FIXTURE_DIR, 'docs', 'changes');
      await ingestor.ingestSpecs(specsDir);

      // Requirement 3 mentions "hashPassword" which is a function in the fixture
      const reqNodes = store.findNodes({ type: 'requirement' });
      const hashReq = reqNodes.find((n) => (n.metadata.index as number) === 3);
      expect(hashReq).toBeDefined();

      const edges = store.getEdges({ from: hashReq!.id, type: 'requires' });
      const hashEdge = edges.find((e) => {
        const target = store.getNode(e.to);
        return target?.name === 'hashPassword';
      });
      expect(hashEdge).toBeDefined();
      expect(hashEdge!.confidence).toBe(0.6);
    });
  });

  describe('missing/empty specs', () => {
    it('should return empty result when specs directory does not exist', async () => {
      const result = await ingestor.ingestSpecs('/nonexistent/path');

      expect(result.nodesAdded).toBe(0);
      expect(result.edgesAdded).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should skip spec files without matching sections', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'req-ingestor-'));
      const featureDir = path.join(tmpDir, 'no-criteria');
      await fs.mkdir(featureDir, { recursive: true });
      await fs.writeFile(
        path.join(featureDir, 'proposal.md'),
        '# Feature\n\n## Overview\n\nJust an overview, no criteria.\n'
      );

      try {
        const result = await ingestor.ingestSpecs(tmpDir);
        expect(result.nodesAdded).toBe(0);
        expect(result.edgesAdded).toBe(0);
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it('should handle spec with section heading but no numbered items', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'req-ingestor-'));
      const featureDir = path.join(tmpDir, 'empty-criteria');
      await fs.mkdir(featureDir, { recursive: true });
      await fs.writeFile(
        path.join(featureDir, 'proposal.md'),
        '# Feature\n\n## Success Criteria\n\nNo numbered items here.\n'
      );

      try {
        const result = await ingestor.ingestSpecs(tmpDir);
        expect(result.nodesAdded).toBe(0);
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('multiple sections', () => {
    it('should extract requirements from both Observable Truths and Success Criteria sections', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'req-ingestor-'));
      const featureDir = path.join(tmpDir, 'multi-section');
      await fs.mkdir(featureDir, { recursive: true });
      await fs.writeFile(
        path.join(featureDir, 'proposal.md'),
        [
          '# Feature',
          '',
          '## Observable Truths',
          '',
          '1. The system shall do X',
          '2. The system shall do Y',
          '',
          '## Success Criteria',
          '',
          '1. The system shall do Z',
          '',
        ].join('\n')
      );

      try {
        const result = await ingestor.ingestSpecs(tmpDir);
        expect(result.nodesAdded).toBe(3);

        const reqNodes = store.findNodes({ type: 'requirement' });
        const sections = reqNodes.map((n) => n.metadata.section);
        expect(sections).toContain('Observable Truths');
        expect(sections).toContain('Success Criteria');
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
