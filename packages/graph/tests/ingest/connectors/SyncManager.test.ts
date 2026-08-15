import { describe, it, expect, beforeEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { GraphStore } from '../../../src/store/GraphStore.js';
import { SyncManager } from '../../../src/ingest/connectors/SyncManager.js';
import type {
  GraphConnector,
  ConnectorConfig,
} from '../../../src/ingest/connectors/ConnectorInterface.js';
import type { IngestResult } from '../../../src/types.js';

function makeMockConnector(name: string, result: IngestResult): GraphConnector {
  return {
    name,
    source: name,
    ingest: async () => result,
  };
}

describe('SyncManager', () => {
  let store: GraphStore;
  let graphDir: string;
  let manager: SyncManager;

  beforeEach(async () => {
    store = new GraphStore();
    graphDir = path.join(
      os.tmpdir(),
      `graph-sync-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await fs.mkdir(graphDir, { recursive: true });
    manager = new SyncManager(store, graphDir);
  });

  it('registers a connector and runs sync', async () => {
    const result: IngestResult = {
      nodesAdded: 3,
      nodesUpdated: 0,
      edgesAdded: 1,
      edgesUpdated: 0,
      errors: [],
      durationMs: 10,
    };
    const connector = makeMockConnector('test', result);

    manager.registerConnector(connector, {});
    const syncResult = await manager.sync('test');

    expect(syncResult.nodesAdded).toBe(3);
    expect(syncResult.edgesAdded).toBe(1);
  });

  it('returns error for unregistered connector', async () => {
    const result = await manager.sync('nonexistent');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('nonexistent');
  });

  it('syncAll runs all registered connectors', async () => {
    const r1: IngestResult = {
      nodesAdded: 2,
      nodesUpdated: 0,
      edgesAdded: 1,
      edgesUpdated: 0,
      errors: [],
      durationMs: 5,
    };
    const r2: IngestResult = {
      nodesAdded: 3,
      nodesUpdated: 1,
      edgesAdded: 0,
      edgesUpdated: 0,
      errors: [],
      durationMs: 7,
    };

    manager.registerConnector(makeMockConnector('a', r1), {});
    manager.registerConnector(makeMockConnector('b', r2), {});

    const combined = await manager.syncAll();
    expect(combined.nodesAdded).toBe(5);
    expect(combined.nodesUpdated).toBe(1);
    expect(combined.edgesAdded).toBe(1);
  });

  it('getMetadata returns persisted sync state', async () => {
    const result: IngestResult = {
      nodesAdded: 1,
      nodesUpdated: 0,
      edgesAdded: 0,
      edgesUpdated: 0,
      errors: [],
      durationMs: 2,
    };
    manager.registerConnector(makeMockConnector('test', result), {});

    await manager.sync('test');

    const metadata = await manager.getMetadata();
    expect(metadata.connectors['test']).toBeDefined();
    expect(metadata.connectors['test']!.lastResult.nodesAdded).toBe(1);
  });

  it('sync updates lastSyncTimestamp', async () => {
    const result: IngestResult = {
      nodesAdded: 0,
      nodesUpdated: 0,
      edgesAdded: 0,
      edgesUpdated: 0,
      errors: [],
      durationMs: 0,
    };
    manager.registerConnector(makeMockConnector('ts-test', result), {});

    const before = new Date().toISOString();
    await manager.sync('ts-test');
    const after = new Date().toISOString();

    const metadata = await manager.getMetadata();
    const ts = metadata.connectors['ts-test']!.lastSyncTimestamp;
    expect(ts >= before).toBe(true);
    expect(ts <= after).toBe(true);
  });

  it('does not stamp a fresh success timestamp when the sync hard-fails (#1336)', async () => {
    const failed: IngestResult = {
      nodesAdded: 0,
      nodesUpdated: 0,
      edgesAdded: 0,
      edgesUpdated: 0,
      errors: ['GitHub Actions API error: status 500'],
      durationMs: 3,
    };
    manager.registerConnector(makeMockConnector('broken', failed), {});

    await manager.sync('broken');

    const metadata = await manager.getMetadata();
    const entry = metadata.connectors['broken']!;
    // The failed run is still recorded so its errors remain visible...
    expect(entry.lastResult.errors).toHaveLength(1);
    // ...but the "last synced" clock must NOT advance for a run that errored and
    // ingested nothing. A never-succeeded connector reads as empty rather than
    // as freshly synced — otherwise the one surface a human checks lies.
    expect(entry.lastSyncTimestamp).toBe('');
  });

  it('metadata persists to disk as sync-metadata.json', async () => {
    const result: IngestResult = {
      nodesAdded: 1,
      nodesUpdated: 0,
      edgesAdded: 0,
      edgesUpdated: 0,
      errors: [],
      durationMs: 1,
    };
    manager.registerConnector(makeMockConnector('disk', result), {});
    await manager.sync('disk');

    const raw = await fs.readFile(path.join(graphDir, 'sync-metadata.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.connectors['disk']).toBeDefined();
  });

  it('invokes KnowledgeLinker after syncAll completes', async () => {
    const result: IngestResult = {
      nodesAdded: 1,
      nodesUpdated: 0,
      edgesAdded: 0,
      edgesUpdated: 0,
      errors: [],
      durationMs: 1,
    };

    // Create a connector that adds a document node with business content
    const connector: GraphConnector = {
      name: 'test-linker',
      source: 'test',
      ingest: async (s: GraphStore) => {
        s.addNode({
          id: 'doc:sync-test',
          type: 'document',
          name: 'Sync Test Doc',
          content: 'All systems must comply with SOC2 and GDPR requirements',
          metadata: { source: 'test' },
        });
        return result;
      },
    };

    manager.registerConnector(connector, {});
    const combined = await manager.syncAll();

    // KnowledgeLinker should have run and created business_fact nodes
    const facts = store.findNodes({ type: 'business_fact' });
    expect(facts.length).toBeGreaterThan(0);
    expect(combined.nodesAdded).toBeGreaterThan(1); // connector node + linker facts
  });
});
