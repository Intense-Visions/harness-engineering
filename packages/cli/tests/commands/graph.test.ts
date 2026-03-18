import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { runScan } from '../../src/commands/graph/scan';
import { runQuery } from '../../src/commands/graph/query';
import { runGraphStatus } from '../../src/commands/graph/status';
import { runGraphExport } from '../../src/commands/graph/export';
import { createScanCommand } from '../../src/commands/graph/scan';
import { createQueryCommand } from '../../src/commands/graph/query';
import { createIngestCommand, runIngest } from '../../src/commands/graph/ingest';
import { createGraphCommand } from '../../src/commands/graph/index';

describe('graph commands', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-graph-test-'));
    // Create a minimal TypeScript file for the code ingestor to find
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

  describe('runScan', () => {
    it('builds a graph and returns node/edge counts', async () => {
      const result = await runScan(tmpDir);
      expect(result.nodeCount).toBeGreaterThan(0);
      expect(result.edgeCount).toBeGreaterThanOrEqual(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('creates .harness/graph directory', async () => {
      await runScan(tmpDir);
      const graphDir = path.join(tmpDir, '.harness', 'graph');
      const stat = await fs.stat(graphDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('creates graph.json and metadata.json', async () => {
      await runScan(tmpDir);
      const graphDir = path.join(tmpDir, '.harness', 'graph');
      const graphJson = await fs.readFile(path.join(graphDir, 'graph.json'), 'utf-8');
      const parsed = JSON.parse(graphJson);
      expect(parsed).toHaveProperty('nodes');
      expect(parsed).toHaveProperty('edges');

      const metaJson = await fs.readFile(path.join(graphDir, 'metadata.json'), 'utf-8');
      const meta = JSON.parse(metaJson);
      expect(meta).toHaveProperty('schemaVersion');
      expect(meta).toHaveProperty('nodeCount');
    });
  });

  describe('runQuery', () => {
    it('queries a known node from a scanned graph', async () => {
      await runScan(tmpDir);
      // The code ingestor creates file nodes with IDs like "file:src/index.ts"
      const result = await runQuery(tmpDir, 'file:src/index.ts', { depth: 2 });
      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.nodes.some((n) => n.id === 'file:src/index.ts')).toBe(true);
    });

    it('returns error when no graph exists', async () => {
      const emptyDir = path.join(tmpDir, 'empty');
      await fs.mkdir(emptyDir, { recursive: true });
      await expect(runQuery(emptyDir, 'file:foo.ts', {})).rejects.toThrow('No graph found');
    });
  });

  describe('runGraphStatus', () => {
    it('returns status with counts when graph exists', async () => {
      await runScan(tmpDir);
      const status = await runGraphStatus(tmpDir);
      expect(status.status).toBe('ok');
      expect(status.nodeCount).toBeGreaterThan(0);
      expect(status.edgeCount).toBeGreaterThanOrEqual(0);
      expect(status.nodesByType).toBeDefined();
      expect(typeof status.nodesByType).toBe('object');
    });

    it('returns no_graph status when graph does not exist', async () => {
      const emptyDir = path.join(tmpDir, 'empty');
      await fs.mkdir(emptyDir, { recursive: true });
      const status = await runGraphStatus(emptyDir);
      expect(status.status).toBe('no_graph');
      expect(status.message).toContain('No graph found');
    });
  });

  describe('runGraphExport', () => {
    it('exports as valid JSON', async () => {
      await runScan(tmpDir);
      const output = await runGraphExport(tmpDir, 'json');
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('nodes');
      expect(parsed).toHaveProperty('edges');
      expect(Array.isArray(parsed.nodes)).toBe(true);
    });

    it('exports as mermaid format', async () => {
      await runScan(tmpDir);
      const output = await runGraphExport(tmpDir, 'mermaid');
      expect(output.startsWith('graph TD')).toBe(true);
    });

    it('throws on unknown format', async () => {
      await runScan(tmpDir);
      await expect(runGraphExport(tmpDir, 'xml')).rejects.toThrow('Unknown format');
    });

    it('throws when no graph exists', async () => {
      const emptyDir = path.join(tmpDir, 'empty');
      await fs.mkdir(emptyDir, { recursive: true });
      await expect(runGraphExport(emptyDir, 'json')).rejects.toThrow('No graph found');
    });
  });

  describe('runIngest', () => {
    it('ingests code source and creates graph nodes', async () => {
      const result = await runIngest(tmpDir, 'code');
      expect(result.nodesAdded).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      // Verify graph was persisted
      const graphDir = path.join(tmpDir, '.harness', 'graph');
      const stat = await fs.stat(graphDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('throws on unknown source', async () => {
      await expect(runIngest(tmpDir, 'nosource')).rejects.toThrow('Unknown source: nosource');
    });
  });

  describe('command creation', () => {
    it('creates scan command with correct name', () => {
      const cmd = createScanCommand();
      expect(cmd.name()).toBe('scan');
    });

    it('creates query command with correct name', () => {
      const cmd = createQueryCommand();
      expect(cmd.name()).toBe('query');
    });

    it('creates ingest command with correct name', () => {
      const cmd = createIngestCommand();
      expect(cmd.name()).toBe('ingest');
    });

    it('creates graph command with subcommands', () => {
      const cmd = createGraphCommand();
      expect(cmd.name()).toBe('graph');
      const subcommands = cmd.commands.map((c) => c.name());
      expect(subcommands).toContain('status');
      expect(subcommands).toContain('export');
    });
  });
});
