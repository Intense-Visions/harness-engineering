import { describe, it, expect } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore';
import { GraphComplexityAdapter } from '../../src/entropy/GraphComplexityAdapter';
import { GitIngestor, type GitRunner } from '../../src/ingest/GitIngestor';

function addFileWithFunction(
  store: GraphStore,
  filePath: string,
  fnName: string,
  complexity: number
): void {
  const fileId = `file:${filePath}`;
  store.addNode({ id: fileId, type: 'file', name: filePath, path: filePath, metadata: {} });
  const fnId = `function:${filePath}:${fnName}`;
  store.addNode({
    id: fnId,
    type: 'function',
    name: fnName,
    path: filePath,
    metadata: { cyclomaticComplexity: complexity },
  });
  store.addEdge({ from: fileId, to: fnId, type: 'contains' });
}

/**
 * Add a commit touching `filePath` in exactly the shape GitIngestor writes it:
 * a `commit` node plus a `triggered_by` edge FROM the file TO the commit.
 */
function addCommitTouching(store: GraphStore, commitId: string, filePath: string): void {
  if (!store.getNode(commitId)) {
    store.addNode({ id: commitId, type: 'commit', name: commitId, metadata: {} });
  }
  store.addEdge({ from: `file:${filePath}`, to: commitId, type: 'triggered_by' });
}

function hashFor(i: number): string {
  // 40-char hex hash whose 7-char short hash is unique per i
  return i.toString(16).padStart(7, '0') + '0'.repeat(33);
}

describe('GraphComplexityAdapter', () => {
  it('computes hotspot scores from function metadata and commit frequency', () => {
    const store = new GraphStore();
    addFileWithFunction(store, 'src/service.ts', 'processData', 8);
    for (let i = 0; i < 5; i++) addCommitTouching(store, `commit:abc${i}`, 'src/service.ts');

    const result = new GraphComplexityAdapter(store).computeComplexityHotspots();

    expect(result.hotspots).toHaveLength(1);
    expect(result.hotspots[0]!.file).toBe('src/service.ts');
    expect(result.hotspots[0]!.function).toBe('processData');
    expect(result.hotspots[0]!.changeFrequency).toBe(5);
    expect(result.hotspots[0]!.complexity).toBe(8);
    expect(result.hotspots[0]!.hotspotScore).toBe(40); // 5 * 8
    expect(result.percentile95Score).toBe(40);
    expect(result.changeFrequencyMeasured).toBe(true);
  });

  it('measures churn from a real GitIngestor run (#2022)', async () => {
    const store = new GraphStore();
    addFileWithFunction(store, 'src/hot.ts', 'busy', 4);
    addFileWithFunction(store, 'src/cold.ts', 'quiet', 9);

    // Three commits touch hot.ts; none touch cold.ts.
    const log = [0, 1, 2]
      .map(
        (i) =>
          `${hashFor(i + 1)}|Dev|dev@example.com|2026-01-1${i}T10:00:00Z|change ${i}\n\nsrc/hot.ts\n`
      )
      .join('\n');
    const runner: GitRunner = async () => log;
    const ingest = await new GitIngestor(store, runner).ingest('/repo');
    expect(ingest.errors).toEqual([]);

    const result = new GraphComplexityAdapter(store).computeComplexityHotspots();
    const hot = result.hotspots.find((h) => h.function === 'busy')!;
    const cold = result.hotspots.find((h) => h.function === 'quiet')!;

    expect(hot.changeFrequency).toBe(3);
    expect(hot.hotspotScore).toBe(12); // 3 * 4
    // Positive control: a file no commit touched stays at 0.
    expect(cold.changeFrequency).toBe(0);
    expect(cold.hotspotScore).toBe(0);
    expect(result.hotspots[0]!.function).toBe('busy');
    expect(result.changeFrequencyMeasured).toBe(true);
  });

  it('does not count doc/diagram/connector references as churn', () => {
    const store = new GraphStore();
    addFileWithFunction(store, 'src/service.ts', 'processData', 8);
    // A diagram and a Slack message reference the file — neither is a change.
    store.addNode({ id: 'diagram:arch', type: 'document', name: 'arch', metadata: {} });
    store.addEdge({ from: 'diagram:arch', to: 'file:src/service.ts', type: 'references' });
    store.addNode({ id: 'conversation:s1', type: 'conversation', name: 's1', metadata: {} });
    store.addEdge({ from: 'conversation:s1', to: 'file:src/service.ts', type: 'references' });
    addCommitTouching(store, 'commit:one', 'src/service.ts');

    const result = new GraphComplexityAdapter(store).computeComplexityHotspots();

    expect(result.hotspots[0]!.changeFrequency).toBe(1);
    expect(result.hotspots[0]!.hotspotScore).toBe(8);
  });

  it('reports change frequency as not measured when no git history was ingested', () => {
    const store = new GraphStore();
    addFileWithFunction(store, 'src/service.ts', 'processData', 8);

    const result = new GraphComplexityAdapter(store).computeComplexityHotspots();

    expect(result.hotspots[0]!.changeFrequency).toBe(0);
    expect(result.changeFrequencyMeasured).toBe(false);
  });

  it('computes 95th percentile correctly with 20 functions', () => {
    const store = new GraphStore();

    // Create 20 functions with varying churn: file i gets (i + 1) commits.
    for (let i = 0; i < 20; i++) {
      const filePath = `src/file${i}.ts`;
      addFileWithFunction(store, filePath, `fn${i}`, i + 1);
      for (let c = 0; c < i + 1; c++) addCommitTouching(store, `commit:file${i}-${c}`, filePath);
    }

    const result = new GraphComplexityAdapter(store).computeComplexityHotspots();

    expect(result.hotspots).toHaveLength(20);
    // Sorted descending by hotspotScore
    expect(result.hotspots[0]!.hotspotScore).toBe(400); // fn19: 20 * 20
    expect(result.hotspots[19]!.hotspotScore).toBe(1); // fn0: 1 * 1

    // Ascending: 1, 4, 9, ..., 361, 400; ceil(0.95 * 20) = 19 -> index 18 = 361
    expect(result.percentile95Score).toBe(361);
  });

  it('returns empty result for empty graph', () => {
    const store = new GraphStore();
    const result = new GraphComplexityAdapter(store).computeComplexityHotspots();

    expect(result.hotspots).toEqual([]);
    expect(result.percentile95Score).toBe(0);
    expect(result.changeFrequencyMeasured).toBe(false);
  });
});
