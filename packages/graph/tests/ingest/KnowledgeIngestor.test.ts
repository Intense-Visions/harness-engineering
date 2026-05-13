import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

  describe('ingestAll options', () => {
    it('should accept a custom adrDir', async () => {
      const customAdrDir = path.join(FIXTURE_DIR, 'docs', 'adr');
      const result = await knowledgeIngestor.ingestAll(FIXTURE_DIR, { adrDir: customAdrDir });

      expect(result.nodesAdded).toBeGreaterThanOrEqual(1);
      const adrNodes = store.findNodes({ type: 'adr' });
      expect(adrNodes.length).toBeGreaterThanOrEqual(1);
    });

    it('should use wall-clock durationMs instead of summed sub-durations', async () => {
      const result = await knowledgeIngestor.ingestAll(FIXTURE_DIR);

      // durationMs should be a non-negative number representing real elapsed time
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.durationMs).toBe('number');
    });
  });

  describe('malformed markdown', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'knowledge-ingestor-'));
      await fs.mkdir(path.join(tmpDir, '.harness'), { recursive: true });
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('should produce 0 learning nodes when file has only headings and no bullets', async () => {
      const content = '## 2026-01-20 — Some heading\n## 2026-01-21 — Another heading\n';
      await fs.writeFile(path.join(tmpDir, '.harness', 'learnings.md'), content);

      const result = await knowledgeIngestor.ingestLearnings(tmpDir);

      expect(result.nodesAdded).toBe(0);
      expect(store.findNodes({ type: 'learning' })).toHaveLength(0);
    });

    it('should skip failures entry missing Description field', async () => {
      const content = [
        '## 2026-01-22 — Failure',
        '',
        '- **Date:** 2026-01-22',
        '- **Skill:** harness-execution',
        '- **Type:** test-failure',
        // No Description field
        '',
      ].join('\n');
      await fs.writeFile(path.join(tmpDir, '.harness', 'failures.md'), content);

      const result = await knowledgeIngestor.ingestFailures(tmpDir);

      expect(result.nodesAdded).toBe(0);
      expect(store.findNodes({ type: 'failure' })).toHaveLength(0);
    });

    it('should create learning node with undefined tags when skill/outcome missing', async () => {
      const content = '## 2026-01-20 — Session\n\n- Some learning without any tags at all\n';
      await fs.writeFile(path.join(tmpDir, '.harness', 'learnings.md'), content);

      const result = await knowledgeIngestor.ingestLearnings(tmpDir);

      expect(result.nodesAdded).toBe(1);
      const nodes = store.findNodes({ type: 'learning' });
      expect(nodes).toHaveLength(1);
      expect(nodes[0]!.metadata.skill).toBeUndefined();
      expect(nodes[0]!.metadata.outcome).toBeUndefined();
    });
  });

  // Regression coverage for issue #302 — ingestAll must materialize README,
  // AGENTS.md, and docs/**/*.md (non-ADR) as `document` nodes so that the
  // detect-doc-drift skill's graph-enhanced path has `documents` edges to
  // traverse on projects without a docs/adr/ directory.
  describe('general docs ingestion (issue #302)', () => {
    let tmpDir: string;
    let isolatedStore: GraphStore;
    let isolatedIngestor: KnowledgeIngestor;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'general-docs-'));
      // Seed a tiny source tree so linkToCode has something to match against.
      await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, 'src', 'thing.ts'),
        'export function doStuff(): void {\n  return;\n}\n'
      );
      isolatedStore = new GraphStore();
      const codeIngestor = new CodeIngestor(isolatedStore);
      await codeIngestor.ingest(tmpDir);
      isolatedIngestor = new KnowledgeIngestor(isolatedStore);
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('creates document nodes for top-level README.md and AGENTS.md', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'README.md'),
        '# Project\n\nUses `doStuff` to do stuff.\n'
      );
      await fs.writeFile(
        path.join(tmpDir, 'AGENTS.md'),
        '# Agents\n\nSee src/thing.ts for details.\n'
      );

      const result = await isolatedIngestor.ingestAll(tmpDir);

      const docs = isolatedStore.findNodes({ type: 'document' });
      expect(docs.length).toBeGreaterThanOrEqual(2);
      expect(docs.find((d) => d.path?.endsWith('README.md'))).toBeDefined();
      expect(docs.find((d) => d.path?.endsWith('AGENTS.md'))).toBeDefined();
      expect(result.nodesAdded).toBeGreaterThanOrEqual(2);
      expect(result.errors).toHaveLength(0);
    });

    it('creates documents edges from docs/*.md to mentioned code symbols', async () => {
      await fs.mkdir(path.join(tmpDir, 'docs'), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, 'docs', 'guide.md'),
        '# Guide\n\nCall doStuff() to perform the operation.\n'
      );

      await isolatedIngestor.ingestAll(tmpDir);

      const docs = isolatedStore.findNodes({ type: 'document' });
      const guideDoc = docs.find((d) => d.path?.endsWith('guide.md'));
      expect(guideDoc).toBeDefined();

      const edges = isolatedStore.getEdges({ from: guideDoc!.id, type: 'documents' });
      expect(edges.length).toBeGreaterThanOrEqual(1);
      const doStuffFn = isolatedStore.findNodes({ type: 'function', name: 'doStuff' });
      expect(doStuffFn.length).toBe(1);
      expect(edges.map((e) => e.to)).toContain(doStuffFn[0]!.id);
    });

    it('does not duplicate ADRs as document nodes (docs/adr is owned by ingestADRs)', async () => {
      await fs.mkdir(path.join(tmpDir, 'docs', 'adr'), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, 'docs', 'adr', 'ADR-100.md'),
        '# ADR-100: Test decision\n\n**Date:** 2026-05-13\n**Status:** Accepted\n'
      );

      await isolatedIngestor.ingestAll(tmpDir);

      expect(isolatedStore.findNodes({ type: 'adr' })).toHaveLength(1);
      const docs = isolatedStore.findNodes({ type: 'document' });
      expect(docs.find((d) => d.path?.includes('ADR-100.md'))).toBeUndefined();
    });

    it('skips docs/{knowledge,changes,solutions} (owned by other ingestors)', async () => {
      await fs.mkdir(path.join(tmpDir, 'docs', 'knowledge'), { recursive: true });
      await fs.mkdir(path.join(tmpDir, 'docs', 'changes'), { recursive: true });
      await fs.mkdir(path.join(tmpDir, 'docs', 'solutions'), { recursive: true });
      await fs.writeFile(path.join(tmpDir, 'docs', 'knowledge', 'k.md'), '# k\n');
      await fs.writeFile(path.join(tmpDir, 'docs', 'changes', 'c.md'), '# c\n');
      await fs.writeFile(path.join(tmpDir, 'docs', 'solutions', 's.md'), '# s\n');
      await fs.writeFile(path.join(tmpDir, 'docs', 'visible.md'), '# visible\n');

      await isolatedIngestor.ingestAll(tmpDir);

      const docs = isolatedStore.findNodes({ type: 'document' });
      expect(docs.find((d) => d.path?.includes('knowledge'))).toBeUndefined();
      expect(docs.find((d) => d.path?.includes('changes'))).toBeUndefined();
      expect(docs.find((d) => d.path?.includes('solutions'))).toBeUndefined();
      expect(docs.find((d) => d.path?.endsWith('visible.md'))).toBeDefined();
    });

    it('does not ingest .harness/*.md as document nodes', async () => {
      await fs.mkdir(path.join(tmpDir, '.harness'), { recursive: true });
      await fs.writeFile(path.join(tmpDir, '.harness', 'notes.md'), '# notes\n');

      await isolatedIngestor.ingestAll(tmpDir);

      const docs = isolatedStore.findNodes({ type: 'document' });
      expect(docs.find((d) => d.path?.includes('.harness'))).toBeUndefined();
    });
  });
});
