import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphStore } from '../../../src/store/GraphStore.js';
import { CIConnector } from '../../../src/ingest/connectors/CIConnector.js';
import type { ConnectorConfig } from '../../../src/ingest/connectors/ConnectorInterface.js';

const WORKFLOW_RUNS_FIXTURE = {
  workflow_runs: [
    {
      id: 1001,
      name: 'CI',
      status: 'completed',
      conclusion: 'failure',
      head_branch: 'main',
      head_sha: 'abc123',
      html_url: 'https://github.com/org/repo/actions/runs/1001',
      created_at: '2026-03-18T10:00:00Z',
    },
    {
      id: 1002,
      name: 'CI',
      status: 'completed',
      conclusion: 'success',
      head_branch: 'feature-x',
      head_sha: 'def456',
      html_url: 'https://github.com/org/repo/actions/runs/1002',
      created_at: '2026-03-18T11:00:00Z',
    },
  ],
};

const EMPTY_FIXTURE = { workflow_runs: [] };

function makeMockHttpClient(response: unknown) {
  return async (_url: string, _options?: { headers?: Record<string, string> }) => ({
    ok: true as const,
    json: async () => response,
  });
}

describe('CIConnector', () => {
  let store: GraphStore;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    store = new GraphStore();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('creates build nodes from workflow runs with metadata', async () => {
    process.env['GITHUB_TOKEN'] = 'test-token';

    const connector = new CIConnector(makeMockHttpClient(WORKFLOW_RUNS_FIXTURE));
    const config: ConnectorConfig = { repo: 'org/repo' };

    const result = await connector.ingest(store, config);

    expect(result.errors).toHaveLength(0);

    // Should create build nodes (2 runs) + 1 test_result for failure
    const buildNode = store.getNode('build:1001');
    expect(buildNode).not.toBeNull();
    expect(buildNode!.type).toBe('build');
    expect(buildNode!.name).toBe('CI #1001');
    expect(buildNode!.metadata.status).toBe('completed');
    expect(buildNode!.metadata.conclusion).toBe('failure');
    expect(buildNode!.metadata.branch).toBe('main');
    expect(buildNode!.metadata.sha).toBe('abc123');

    const buildNode2 = store.getNode('build:1002');
    expect(buildNode2).not.toBeNull();
    expect(buildNode2!.type).toBe('build');
    expect(buildNode2!.metadata.conclusion).toBe('success');
  });

  it('links builds to commit nodes via SHA (triggered_by edge)', async () => {
    process.env['GITHUB_TOKEN'] = 'test-token';

    // Pre-populate store with a commit node
    store.addNode({
      id: 'commit:abc123',
      type: 'commit',
      name: 'commit abc123',
      metadata: { sha: 'abc123' },
    });

    const connector = new CIConnector(makeMockHttpClient(WORKFLOW_RUNS_FIXTURE));
    const config: ConnectorConfig = { repo: 'org/repo' };

    const result = await connector.ingest(store, config);

    // build:1001 should link to commit:abc123 via triggered_by
    const edges = store.getEdges({
      from: 'build:1001',
      to: 'commit:abc123',
      type: 'triggered_by',
    });
    expect(edges).toHaveLength(1);

    // build:1002 has sha def456 which has no commit node, so no edge
    const edges2 = store.getEdges({ from: 'build:1002', type: 'triggered_by' });
    expect(edges2).toHaveLength(0);

    expect(result.edgesAdded).toBeGreaterThanOrEqual(1);
  });

  it('creates test_result nodes for failed runs and links to build (failed_in edge)', async () => {
    process.env['GITHUB_TOKEN'] = 'test-token';

    // Pre-populate store with a file node for failure linking
    store.addNode({
      id: 'file:src/services/auth.ts',
      type: 'file',
      name: 'auth.ts',
      path: 'src/services/auth.ts',
      metadata: {},
    });

    const connector = new CIConnector(makeMockHttpClient(WORKFLOW_RUNS_FIXTURE));
    const config: ConnectorConfig = { repo: 'org/repo' };

    const result = await connector.ingest(store, config);

    // test_result node should exist for the failed run (1001)
    const testResultNode = store.getNode('test_result:1001');
    expect(testResultNode).not.toBeNull();
    expect(testResultNode!.type).toBe('test_result');
    expect(testResultNode!.metadata.conclusion).toBe('failure');
    expect(testResultNode!.metadata.buildId).toBe('1001');

    // test_result should link to build via failed_in
    const edges = store.getEdges({
      from: 'test_result:1001',
      to: 'build:1001',
      type: 'failed_in',
    });
    expect(edges).toHaveLength(1);

    // No test_result for successful run 1002
    const testResultNode2 = store.getNode('test_result:1002');
    expect(testResultNode2).toBeNull();
  });

  it('returns error in IngestResult when API key env var is missing (no throw)', async () => {
    delete process.env['GITHUB_TOKEN'];

    const connector = new CIConnector(makeMockHttpClient(WORKFLOW_RUNS_FIXTURE));
    const config: ConnectorConfig = { repo: 'org/repo' };

    const result = await connector.ingest(store, config);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('GITHUB_TOKEN');
    expect(result.nodesAdded).toBe(0);
    expect(result.edgesAdded).toBe(0);
  });

  it('handles empty workflow runs response', async () => {
    process.env['GITHUB_TOKEN'] = 'test-token';

    const connector = new CIConnector(makeMockHttpClient(EMPTY_FIXTURE));
    const config: ConnectorConfig = { repo: 'org/repo' };

    const result = await connector.ingest(store, config);

    expect(result.nodesAdded).toBe(0);
    expect(result.edgesAdded).toBe(0);
    expect(result.errors).toHaveLength(0);
  });
});
