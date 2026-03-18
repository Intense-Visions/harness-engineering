import * as path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { CodeIngestor } from '../../src/ingest/CodeIngestor.js';
import { KnowledgeIngestor } from '../../src/ingest/KnowledgeIngestor.js';

const FIXTURE_DIR = path.resolve(__dirname, '../../__fixtures__/sample-project');

describe('KnowledgeIngestor', () => {
  let store: GraphStore;
  let knowledgeIngestor: KnowledgeIngestor;

  beforeEach(async () => {
    store = new GraphStore();
    const codeIngestor = new CodeIngestor(store);
    await codeIngestor.ingest(FIXTURE_DIR);
    knowledgeIngestor = new KnowledgeIngestor(store);
  });

  describe('ingestADRs', () => {
    it('should create adr nodes with correct metadata', async () => {
      const adrDir = path.join(FIXTURE_DIR, 'docs', 'adr');
      const result = await knowledgeIngestor.ingestADRs(adrDir);

      expect(result.nodesAdded).toBeGreaterThanOrEqual(1);
      expect(result.errors).toHaveLength(0);

      const adrNode = store.getNode('adr:ADR-001');
      expect(adrNode).not.toBeNull();
      expect(adrNode!.name).toBe('ADR-001: Use AuthService for authentication');
      expect(adrNode!.metadata.date).toBe('2026-01-15');
      expect(adrNode!.metadata.status).toBe('Accepted');
    });

    it('should create documents edges linking ADR to mentioned code nodes', async () => {
      const adrDir = path.join(FIXTURE_DIR, 'docs', 'adr');
      await knowledgeIngestor.ingestADRs(adrDir);

      const edges = store.getEdges({ from: 'adr:ADR-001', type: 'documents' });
      expect(edges.length).toBeGreaterThanOrEqual(1);

      const targetIds = edges.map((e) => e.to);

      // ADR mentions AuthService, hashPassword, auth-service.ts, hash.ts
      const authServiceClass = store.findNodes({ type: 'class', name: 'AuthService' });
      expect(authServiceClass.length).toBe(1);
      expect(targetIds).toContain(authServiceClass[0]!.id);

      const hashPasswordFn = store.findNodes({ type: 'function', name: 'hashPassword' });
      expect(hashPasswordFn.length).toBe(1);
      expect(targetIds).toContain(hashPasswordFn[0]!.id);

      // Should match file nodes via path containing auth-service.ts and hash.ts
      const authFileMatches = edges.filter((e) => e.to.includes('auth-service.ts'));
      expect(authFileMatches.length).toBeGreaterThanOrEqual(1);

      const hashFileMatches = edges.filter((e) => e.to.includes('hash.ts'));
      expect(hashFileMatches.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('ingestLearnings', () => {
    it('should create learning nodes with skill/outcome metadata', async () => {
      const result = await knowledgeIngestor.ingestLearnings(FIXTURE_DIR);

      expect(result.nodesAdded).toBe(2);
      expect(result.errors).toHaveLength(0);

      const learningNodes = store.findNodes({ type: 'learning' });
      expect(learningNodes.length).toBe(2);

      const gotchaLearning = learningNodes.find((n) => n.metadata.outcome === 'gotcha');
      expect(gotchaLearning).toBeDefined();
      expect(gotchaLearning!.metadata.skill).toBe('harness-execution');
      expect(gotchaLearning!.metadata.date).toBeDefined();

      const successLearning = learningNodes.find((n) => n.metadata.outcome === 'success');
      expect(successLearning).toBeDefined();
      expect(successLearning!.metadata.skill).toBe('harness-execution');
    });

    it('should create applies_to edges to relevant code nodes', async () => {
      await knowledgeIngestor.ingestLearnings(FIXTURE_DIR);

      const learningNodes = store.findNodes({ type: 'learning' });
      // The learning about hashPassword should link to hashPassword function and hash.ts file
      const hashLearning = learningNodes.find((n) => n.name.includes('hashPassword'));
      expect(hashLearning).toBeDefined();

      const edges = store.getEdges({ from: hashLearning!.id, type: 'applies_to' });
      expect(edges.length).toBeGreaterThanOrEqual(1);

      const targetIds = edges.map((e) => e.to);
      const hashPasswordFn = store.findNodes({ type: 'function', name: 'hashPassword' });
      expect(targetIds).toContain(hashPasswordFn[0]!.id);
    });
  });

  describe('ingestFailures', () => {
    it('should create failure nodes with date/skill/type metadata', async () => {
      const result = await knowledgeIngestor.ingestFailures(FIXTURE_DIR);

      expect(result.nodesAdded).toBe(1);
      expect(result.errors).toHaveLength(0);

      const failureNodes = store.findNodes({ type: 'failure' });
      expect(failureNodes.length).toBe(1);

      const failure = failureNodes[0]!;
      expect(failure.metadata.date).toBe('2026-01-22');
      expect(failure.metadata.skill).toBe('harness-execution');
      expect(failure.metadata.type).toBe('test-failure');
      expect(failure.name).toContain('UserService.login');
    });

    it('should create caused_by edges to relevant code nodes (UserService)', async () => {
      await knowledgeIngestor.ingestFailures(FIXTURE_DIR);

      const failureNodes = store.findNodes({ type: 'failure' });
      const failure = failureNodes[0]!;

      const edges = store.getEdges({ from: failure.id, type: 'caused_by' });
      expect(edges.length).toBeGreaterThanOrEqual(1);

      const targetIds = edges.map((e) => e.to);
      const userServiceClass = store.findNodes({ type: 'class', name: 'UserService' });
      expect(targetIds).toContain(userServiceClass[0]!.id);
    });
  });

  describe('ingestAll', () => {
    it('should create all node types', async () => {
      const result = await knowledgeIngestor.ingestAll(FIXTURE_DIR);

      expect(result.nodesAdded).toBeGreaterThanOrEqual(4); // 1 adr + 2 learnings + 1 failure
      expect(result.edgesAdded).toBeGreaterThanOrEqual(1);
      expect(result.errors).toHaveLength(0);

      const adrNodes = store.findNodes({ type: 'adr' });
      const learningNodes = store.findNodes({ type: 'learning' });
      const failureNodes = store.findNodes({ type: 'failure' });

      expect(adrNodes.length).toBeGreaterThanOrEqual(1);
      expect(learningNodes.length).toBe(2);
      expect(failureNodes.length).toBe(1);
    });
  });

  describe('missing files', () => {
    it('should return empty result when learnings file is missing', async () => {
      const result = await knowledgeIngestor.ingestLearnings('/nonexistent/path');

      expect(result.nodesAdded).toBe(0);
      expect(result.edgesAdded).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('IngestResult accuracy', () => {
    it('should return IngestResult with accurate counts', async () => {
      const result = await knowledgeIngestor.ingestAll(FIXTURE_DIR);

      // Verify counts match actual store state changes
      expect(result.nodesAdded).toBe(
        store.findNodes({ type: 'adr' }).length +
          store.findNodes({ type: 'learning' }).length +
          store.findNodes({ type: 'failure' }).length
      );
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
