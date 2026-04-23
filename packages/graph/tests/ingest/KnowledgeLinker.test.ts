import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { KnowledgeLinker } from '../../src/ingest/KnowledgeLinker.js';
import type { LinkResult } from '../../src/ingest/KnowledgeLinker.js';

function createTestStore(): GraphStore {
  const store = new GraphStore();
  return store;
}

function addIssueNode(
  store: GraphStore,
  id: string,
  content: string,
  metadata: Record<string, unknown> = {}
): void {
  store.addNode({
    id,
    type: 'issue',
    name: `Issue ${id}`,
    content,
    metadata: { source: 'jira', ...metadata },
  });
}

function addConversationNode(
  store: GraphStore,
  id: string,
  content: string,
  metadata: Record<string, unknown> = {}
): void {
  store.addNode({
    id,
    type: 'conversation',
    name: `Conversation ${id}`,
    content,
    metadata: { source: 'slack', ...metadata },
  });
}

function addDocumentNode(
  store: GraphStore,
  id: string,
  content: string,
  metadata: Record<string, unknown> = {}
): void {
  store.addNode({
    id,
    type: 'document',
    name: `Document ${id}`,
    content,
    metadata: { source: 'confluence', ...metadata },
  });
}

describe('KnowledgeLinker', () => {
  let store: GraphStore;

  beforeEach(() => {
    store = createTestStore();
  });

  describe('link() return shape', () => {
    it('returns LinkResult with all required fields', async () => {
      const linker = new KnowledgeLinker(store);
      const result = await linker.link();
      expect(result).toHaveProperty('factsCreated');
      expect(result).toHaveProperty('conceptsClustered');
      expect(result).toHaveProperty('duplicatesMerged');
      expect(result).toHaveProperty('stagedForReview');
      expect(result).toHaveProperty('errors');
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('returns zeros when store is empty', async () => {
      const linker = new KnowledgeLinker(store);
      const result = await linker.link();
      expect(result.factsCreated).toBe(0);
      expect(result.conceptsClustered).toBe(0);
      expect(result.stagedForReview).toBe(0);
    });
  });

  describe('heuristic pattern detection', () => {
    it('detects "must" / "shall" / "required" business rules', async () => {
      addIssueNode(store, 'issue:1', 'The system must validate all user inputs before processing');
      const linker = new KnowledgeLinker(store);
      const result = await linker.link();
      expect(result.factsCreated + result.stagedForReview).toBeGreaterThan(0);
    });

    it('detects SLA/SLO patterns', async () => {
      addDocumentNode(
        store,
        'doc:1',
        'API response time must be under 200ms with 99.9% availability'
      );
      const linker = new KnowledgeLinker(store);
      const result = await linker.link();
      expect(result.factsCreated + result.stagedForReview).toBeGreaterThan(0);
    });

    it('detects monetary amounts with context', async () => {
      addIssueNode(store, 'issue:2', 'The annual license cost is $50,000 for enterprise tier');
      const linker = new KnowledgeLinker(store);
      const result = await linker.link();
      expect(result.factsCreated + result.stagedForReview).toBeGreaterThan(0);
    });

    it('detects acceptance criteria (Given/When/Then)', async () => {
      addIssueNode(
        store,
        'issue:3',
        'Given a logged-in user When they click submit Then the form is validated'
      );
      const linker = new KnowledgeLinker(store);
      const result = await linker.link();
      expect(result.factsCreated + result.stagedForReview).toBeGreaterThan(0);
    });

    it('detects regulatory references', async () => {
      addDocumentNode(store, 'doc:2', 'All data handling must comply with GDPR requirements');
      const linker = new KnowledgeLinker(store);
      const result = await linker.link();
      expect(result.factsCreated + result.stagedForReview).toBeGreaterThan(0);
    });

    it('does not detect signals in non-business content', async () => {
      addIssueNode(store, 'issue:4', 'Fix the button color to blue');
      const linker = new KnowledgeLinker(store);
      const result = await linker.link();
      expect(result.factsCreated).toBe(0);
      expect(result.stagedForReview).toBe(0);
    });
  });

  describe('confidence scoring and promotion', () => {
    it('promotes high-confidence extractions (>= 0.8) to business_fact nodes', async () => {
      // Regulatory reference has confidence 0.9 per spec
      addDocumentNode(store, 'doc:reg', 'This system must be SOC2 compliant for all customer data');
      const linker = new KnowledgeLinker(store);
      const result = await linker.link();
      expect(result.factsCreated).toBeGreaterThan(0);
      // Verify business_fact node was created
      const facts = store.findNodes({ type: 'business_fact' });
      expect(facts.length).toBeGreaterThan(0);
    });

    it('stages medium-confidence extractions (0.5-0.8) for review', async () => {
      // Monetary amounts have confidence 0.6 per spec
      addIssueNode(store, 'issue:money', 'The project budget is $10,000');
      const linker = new KnowledgeLinker(store);
      const result = await linker.link();
      expect(result.stagedForReview).toBeGreaterThan(0);
    });

    it('discards low-confidence extractions (< 0.5)', async () => {
      // Content with very weak signals should be discarded
      addIssueNode(store, 'issue:weak', 'Updated the README file');
      const linker = new KnowledgeLinker(store);
      const result = await linker.link();
      expect(result.factsCreated).toBe(0);
      expect(result.stagedForReview).toBe(0);
    });
  });

  describe('reaction confidence boost', () => {
    it('boosts confidence by 0.1 for conversation nodes with reactions', async () => {
      // Business rule pattern has base confidence 0.7 -- with reaction boost becomes 0.8
      addConversationNode(
        store,
        'conv:1',
        'We must implement rate limiting on all public API endpoints',
        { reactions: { '+1': 5, white_check_mark: 3 } }
      );
      const linker = new KnowledgeLinker(store);
      const result = await linker.link();
      // With reaction boost (0.7 + 0.1 = 0.8), should be promoted
      expect(result.factsCreated).toBeGreaterThan(0);
    });

    it('caps confidence at 1.0 after boost', async () => {
      // Regulatory reference has 0.9 confidence -- boost should cap at 1.0
      addConversationNode(
        store,
        'conv:2',
        'We must comply with HIPAA for all patient data handling',
        { reactions: { '+1': 10 } }
      );
      const linker = new KnowledgeLinker(store);
      const result = await linker.link();
      const facts = store.findNodes({ type: 'business_fact' });
      const matchingFact = facts.find((f) => f.metadata.sourceNodeId === 'conv:2');
      if (matchingFact) {
        expect(matchingFact.metadata.confidence as number).toBeLessThanOrEqual(1.0);
      }
    });
  });

  describe('JSONL output', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'linker-test-'));
    });

    it('writes extraction records to linker.jsonl', async () => {
      addDocumentNode(store, 'doc:jsonl', 'All systems must comply with SOC2 standards');
      const linker = new KnowledgeLinker(store, tmpDir);
      await linker.link();

      const jsonlPath = path.join(tmpDir, 'linker.jsonl');
      const content = await fs.readFile(jsonlPath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines.length).toBeGreaterThan(0);

      const record = JSON.parse(lines[0]);
      expect(record.sourceNodeId).toBe('doc:jsonl');
      expect(record.confidence).toBeGreaterThan(0);
      expect(record.pattern).toBeDefined();
    });

    it('writes empty file when no extractions found', async () => {
      addIssueNode(store, 'issue:nothing', 'Fixed button color');
      const linker = new KnowledgeLinker(store, tmpDir);
      await linker.link();

      const jsonlPath = path.join(tmpDir, 'linker.jsonl');
      const content = await fs.readFile(jsonlPath, 'utf-8');
      expect(content).toBe('');
    });

    it('skips JSONL output when no outputDir configured', async () => {
      addDocumentNode(store, 'doc:skip', 'Must comply with GDPR');
      const linker = new KnowledgeLinker(store); // no outputDir
      // Should not throw
      await expect(linker.link()).resolves.toBeDefined();
    });
  });
});
