import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BusinessKnowledgeIngestor } from '../../src/ingest/BusinessKnowledgeIngestor.js';
import { GraphStore } from '../../src/store/GraphStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES = path.resolve(__dirname, '../fixtures/solutions');

describe('BusinessKnowledgeIngestor.ingestSolutions', () => {
  let store: GraphStore;
  let ingestor: BusinessKnowledgeIngestor;

  beforeEach(() => {
    store = new GraphStore();
    ingestor = new BusinessKnowledgeIngestor(store);
  });

  it('ingests knowledge-track docs as business_concept nodes', async () => {
    const root = path.join(FIXTURES, 'knowledge-track', 'architecture-patterns');
    const result = await ingestor.ingestSolutions(root);
    const concepts = store.findNodes({ type: 'business_concept' });
    const knowledgeTrackNode = concepts.find((n) => n.path?.includes('sample-pattern.md'));
    expect(knowledgeTrackNode).toBeDefined();
    expect(result.errors).toEqual([]);
  });

  it('rejects bug-track docs', async () => {
    await ingestor.ingestSolutions(FIXTURES);
    const all = store.findNodes({});
    const bugTrack = all.find((n) => n.path?.includes('bug-track/'));
    expect(bugTrack).toBeUndefined();
  });

  it('rejects docs with invalid frontmatter', async () => {
    const result = await ingestor.ingestSolutions(FIXTURES);
    const all = store.findNodes({});
    const invalid = all.find((n) => n.path?.includes('invalid-frontmatter.md'));
    expect(invalid).toBeUndefined();
    expect(result.errors.some((e) => e.includes('invalid-frontmatter'))).toBe(true);
  });

  it('returns empty result for missing directory', async () => {
    const result = await ingestor.ingestSolutions(path.join(FIXTURES, 'nonexistent'));
    expect(result.nodesAdded).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it('parses files with CRLF line endings', async () => {
    const result = await ingestor.ingestSolutions(FIXTURES);
    const all = store.findNodes({});
    const crlfNode = all.find((n) => n.path?.includes('crlf-pattern.md'));
    expect(crlfNode).toBeDefined();
    expect(crlfNode?.name).toBe('CRLF-authored doc');
    // CRLF file must NOT appear in errors (it should parse successfully).
    expect(result.errors.some((e) => e.includes('crlf-pattern.md'))).toBe(false);
  });

  it('surfaces files lacking frontmatter as errors', async () => {
    const result = await ingestor.ingestSolutions(FIXTURES);
    const noFmError = result.errors.find((e) => e.includes('no-frontmatter.md'));
    expect(noFmError).toBeDefined();
    expect(noFmError).toMatch(/no frontmatter found/);
  });
});
