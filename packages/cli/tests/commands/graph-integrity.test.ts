import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { runScan } from '../../src/commands/graph/scan';
import { runGraphIntegrity } from '../../src/commands/graph/integrity';
import { createGraphCommand } from '../../src/commands/graph/index';

/**
 * End-to-end cover for `harness graph integrity` against a real persisted
 * graph. The unit-level detection rules live in
 * `packages/graph/tests/integrity/GraphIntegrityChecker.test.ts`; this file
 * verifies the wiring — that the command finds the graph, reads the full
 * `sync-metadata.json` rather than the timestamp-only view `status` uses
 * (#1336), and reports denominators.
 */
describe('graph integrity command', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-graph-integrity-'));
    const srcDir = path.join(tmpDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(
      path.join(srcDir, 'index.ts'),
      `export function hello(): string {\n  return 'world';\n}\n`
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeSyncMetadata(contents: unknown): Promise<void> {
    const graphDir = path.join(tmpDir, '.harness', 'graph');
    await fs.mkdir(graphDir, { recursive: true });
    await fs.writeFile(path.join(graphDir, 'sync-metadata.json'), JSON.stringify(contents));
  }

  it('reports no_graph before a scan has ever run', async () => {
    const result = await runGraphIntegrity(tmpDir);

    expect(result.status).toBe('no_graph');
    expect(result.message).toContain('graph scan');
  });

  it('abstains on a scanned graph with no connectors and no extractor nodes', async () => {
    await runScan(tmpDir);

    const result = await runGraphIntegrity(tmpDir);

    expect(result.status).toBe('ok');
    expect(result.report?.checkedNothing).toBe(true);
    expect(result.report?.findings).toEqual([]);
  });

  it('surfaces a connector that stamped a timestamp while hard-failing (#1336)', async () => {
    await runScan(tmpDir);
    await writeSyncMetadata({
      connectors: {
        jira: {
          lastSyncTimestamp: '2026-08-12T00:31:45.448Z',
          lastResult: {
            nodesAdded: 0,
            nodesUpdated: 0,
            edgesAdded: 0,
            edgesUpdated: 0,
            errors: ['Missing API key: environment variable "JIRA_API_KEY" is not set'],
            durationMs: 0,
          },
        },
      },
    });

    const result = await runGraphIntegrity(tmpDir);

    expect(result.report?.checked.connectors).toBe(1);
    const finding = result.report?.findings.find((f) => f.code === 'GI-C001');
    expect(finding?.subject).toBe('jira');
    expect(finding?.evidence).toContain('JIRA_API_KEY');
  });

  it('treats unreadable sync metadata as absent rather than crashing', async () => {
    await runScan(tmpDir);
    const graphDir = path.join(tmpDir, '.harness', 'graph');
    await fs.writeFile(path.join(graphDir, 'sync-metadata.json'), 'not json at all');

    const result = await runGraphIntegrity(tmpDir);

    expect(result.status).toBe('ok');
    expect(result.report?.checked.connectors).toBe(0);
  });

  it('registers `integrity` as a graph subcommand', () => {
    const names = createGraphCommand()
      .commands.map((c) => c.name())
      .sort();

    expect(names).toContain('integrity');
  });

  it('exposes --report-only and --findings-json', () => {
    const integrity = createGraphCommand().commands.find((c) => c.name() === 'integrity');
    const flags = integrity?.options.map((o) => o.long);

    expect(flags).toContain('--report-only');
    expect(flags).toContain('--findings-json');
  });
});
