import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { GraphStore } from '../../src/store/GraphStore.js';
import { CodeIngestor } from '../../src/ingest/CodeIngestor.js';
import { TopologicalLinker } from '../../src/ingest/TopologicalLinker.js';
import { detectCommunities } from '../../src/community/detectCommunities.js';

const FIXTURE_DIR = path.resolve(__dirname, '../../__fixtures__/sample-project');

describe('Integration: community detection over a built graph', () => {
  it('labels nodes of a real ingested graph and persists them through the Serializer', async () => {
    // 1. Build a real graph from the sample project (not a hand-rolled toy).
    const store = new GraphStore();
    const ingestResult = await new CodeIngestor(store).ingest(FIXTURE_DIR);
    expect(ingestResult.errors).toHaveLength(0);
    new TopologicalLinker(store).link();
    expect(store.nodeCount).toBeGreaterThan(5);

    // 2. Run the detection pass exactly as `graph scan` does.
    const result = detectCommunities(store);
    expect(result.communityCount).toBeGreaterThanOrEqual(1);
    expect(result.assignments).toHaveLength(store.nodeCount);

    // Every node now carries a valid community label in range.
    const labeled = store.findNodes({});
    expect(labeled.every((n) => typeof n.community === 'number')).toBe(true);
    expect(labeled.every((n) => n.community! >= 0 && n.community! < result.communityCount)).toBe(
      true
    );

    // 3. Persist and reload: labels must survive the real save/load path.
    const tmpDir = path.join(os.tmpdir(), `graph-community-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    try {
      await store.save(tmpDir);

      const reloaded = new GraphStore();
      expect(await reloaded.load(tmpDir)).toBe(true);
      expect(reloaded.nodeCount).toBe(store.nodeCount);

      const reloadedNodes = reloaded.findNodes({});
      expect(reloadedNodes.every((n) => typeof n.community === 'number')).toBe(true);

      // Labels are identical before and after the round-trip.
      const before = new Map(store.findNodes({}).map((n) => [n.id, n.community]));
      for (const n of reloadedNodes) {
        expect(n.community).toBe(before.get(n.id));
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('is deterministic over the same built graph', async () => {
    const build = async () => {
      const store = new GraphStore();
      await new CodeIngestor(store).ingest(FIXTURE_DIR);
      new TopologicalLinker(store).link();
      return store;
    };
    const a = detectCommunities(await build());
    const b = detectCommunities(await build());
    expect(b.communityCount).toBe(a.communityCount);
    expect(b.assignments).toEqual(a.assignments);
  });
});
