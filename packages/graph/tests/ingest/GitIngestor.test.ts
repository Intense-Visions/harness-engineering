import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { GitIngestor, type GitRunner } from '../../src/ingest/GitIngestor.js';

// 40-char hex hashes with unique first 7 chars for short hash
const HASH_1 = 'aaa111100000000000000000000000000000000a';
const HASH_2 = 'bbb222200000000000000000000000000000000b';
const HASH_3 = 'ccc333300000000000000000000000000000000c';

const MOCK_GIT_LOG = `${HASH_1}|John|john@example.com|2026-01-15T10:00:00Z|feat: add auth service

src/services/auth-service.ts
src/utils/hash.ts

${HASH_2}|John|john@example.com|2026-01-16T10:00:00Z|fix: auth token expiry

src/services/auth-service.ts
src/utils/hash.ts
src/types.ts

${HASH_3}|Jane|jane@example.com|2026-01-17T10:00:00Z|docs: update types

src/types.ts
`;

function createMockGitRunner(output: string): GitRunner {
  return async (_rootDir: string, _args: string[]): Promise<string> => {
    return output;
  };
}

function createFailingGitRunner(errorMessage: string): GitRunner {
  return async (_rootDir: string, _args: string[]): Promise<string> => {
    throw new Error(errorMessage);
  };
}

/** Seed the store with file nodes matching mock git log paths */
function seedFileNodes(store: GraphStore): void {
  const filePaths = ['src/services/auth-service.ts', 'src/utils/hash.ts', 'src/types.ts'];
  for (const fp of filePaths) {
    store.addNode({
      id: `file:${fp}`,
      type: 'file',
      name: fp.split('/').pop()!,
      path: fp,
      metadata: { language: 'typescript' },
    });
  }
}

describe('GitIngestor', () => {
  let store: GraphStore;
  let ingestor: GitIngestor;

  beforeEach(() => {
    store = new GraphStore();
    seedFileNodes(store);
    ingestor = new GitIngestor(store, createMockGitRunner(MOCK_GIT_LOG));
  });

  it('should create commit nodes from git log output', async () => {
    await ingestor.ingest('/fake/root');

    const commitNodes = store.findNodes({ type: 'commit' });
    expect(commitNodes).toHaveLength(3);

    const names = commitNodes.map((n) => n.name);
    expect(names).toContain('feat: add auth service');
    expect(names).toContain('fix: auth token expiry');
    expect(names).toContain('docs: update types');
  });

  it('should set correct metadata on commit nodes', async () => {
    await ingestor.ingest('/fake/root');

    const commitNode = store.getNode('commit:aaa1111');
    expect(commitNode).not.toBeNull();
    expect(commitNode!.metadata).toEqual({
      author: 'John',
      email: 'john@example.com',
      date: '2026-01-15T10:00:00Z',
      hash: HASH_1,
    });

    const janeCommit = store.getNode('commit:ccc3333');
    expect(janeCommit).not.toBeNull();
    expect(janeCommit!.metadata.author).toBe('Jane');
    expect(janeCommit!.metadata.email).toBe('jane@example.com');
    expect(janeCommit!.metadata.date).toBe('2026-01-17T10:00:00Z');
  });

  it('should create triggered_by edges between file nodes and commit nodes', async () => {
    await ingestor.ingest('/fake/root');

    // auth-service appears in commits abc1234 and def5678
    const authEdges = store.getEdges({
      from: 'file:src/services/auth-service.ts',
      type: 'triggered_by',
    });
    expect(authEdges).toHaveLength(2);

    // types.ts appears in commits def5678 and ghi9012
    const typesEdges = store.getEdges({ from: 'file:src/types.ts', type: 'triggered_by' });
    expect(typesEdges).toHaveLength(2);

    // hash.ts appears in commits abc1234 and def5678
    const hashEdges = store.getEdges({ from: 'file:src/utils/hash.ts', type: 'triggered_by' });
    expect(hashEdges).toHaveLength(2);
  });

  it('should not create triggered_by edges for files not in the graph', async () => {
    // Remove one file node before ingesting
    store.removeNode('file:src/utils/hash.ts');
    await ingestor.ingest('/fake/root');

    const hashEdges = store.getEdges({ from: 'file:src/utils/hash.ts', type: 'triggered_by' });
    expect(hashEdges).toHaveLength(0);
  });

  it('should compute co_changes_with edges for files modified together 2+ times', async () => {
    await ingestor.ingest('/fake/root');

    const coChangeEdges = store.getEdges({ type: 'co_changes_with' });

    // auth-service + hash appear together in 2 commits -> edge
    // auth-service + types appear together in 1 commit -> no edge
    // hash + types appear together in 1 commit -> no edge
    expect(coChangeEdges).toHaveLength(1);

    const edge = coChangeEdges[0]!;
    // Files are sorted, so auth-service < hash (by path)
    expect(edge.from).toBe('file:src/services/auth-service.ts');
    expect(edge.to).toBe('file:src/utils/hash.ts');
    expect(edge.metadata).toEqual({ count: 2 });
  });

  it('should handle empty git log output gracefully', async () => {
    const emptyIngestor = new GitIngestor(store, createMockGitRunner(''));
    const result = await emptyIngestor.ingest('/fake/root');

    expect(result.nodesAdded).toBe(0);
    expect(result.edgesAdded).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should handle git command failure gracefully', async () => {
    const failingIngestor = new GitIngestor(
      store,
      createFailingGitRunner('fatal: not a git repository')
    );
    const result = await failingIngestor.ingest('/fake/root');

    expect(result.nodesAdded).toBe(0);
    expect(result.edgesAdded).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('not a git repository');
  });

  it('should return IngestResult with accurate counts', async () => {
    const result = await ingestor.ingest('/fake/root');

    // 3 commit nodes
    expect(result.nodesAdded).toBe(3);
    expect(result.nodesUpdated).toBe(0);

    // triggered_by edges: auth-service(2) + hash(2) + types(2) = 6
    // co_changes_with edges: 1 (auth-service + hash)
    expect(result.edgesAdded).toBe(7);
    expect(result.errors).toHaveLength(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
