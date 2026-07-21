import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import * as fs from 'node:fs/promises';
import * as os from 'os';
import { GraphStore } from '../../../src/store/GraphStore.js';
import { createExtractionRunner } from '../../../src/ingest/extractors/index.js';
import { CodeIngestor } from '../../../src/ingest/CodeIngestor.js';
import type { ExtractionRecord } from '../../../src/ingest/extractors/types.js';

const FIXTURE_DIR = path.resolve(__dirname, '../../../__fixtures__/extractor-project');

describe('Code Signal Extractors — End-to-End', () => {
  let tmpDir: string;
  let store: GraphStore;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'extractor-e2e-'));
    store = new GraphStore();
  });

  it('writes 4 JSONL files to output directory', async () => {
    const runner = createExtractionRunner();
    await runner.run(FIXTURE_DIR, store, tmpDir);

    const files = await fs.readdir(tmpDir);
    expect(files).toContain('test-descriptions.jsonl');
    expect(files).toContain('enum-constants.jsonl');
    expect(files).toContain('validation-rules.jsonl');
    expect(files).toContain('api-paths.jsonl');
  });

  it('produces valid ExtractionRecord entries in JSONL', async () => {
    const runner = createExtractionRunner();
    await runner.run(FIXTURE_DIR, store, tmpDir);

    for (const fileName of [
      'test-descriptions.jsonl',
      'enum-constants.jsonl',
      'validation-rules.jsonl',
      'api-paths.jsonl',
    ]) {
      const content = await fs.readFile(path.join(tmpDir, fileName), 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines.length).toBeGreaterThan(0);

      for (const line of lines) {
        const record = JSON.parse(line) as ExtractionRecord;
        expect(record.id).toMatch(/^extracted:/);
        expect(record.extractor).toBeTruthy();
        expect(record.language).toBeTruthy();
        expect(record.filePath).toBeTruthy();
        expect(record.line).toBeGreaterThan(0);
        expect(record.nodeType).toBeTruthy();
        expect(record.name).toBeTruthy();
        expect(record.confidence).toBeGreaterThanOrEqual(0);
        expect(record.confidence).toBeLessThanOrEqual(1);
      }
    }
  });

  it('creates graph nodes with correct types and metadata', async () => {
    const runner = createExtractionRunner();
    await runner.run(FIXTURE_DIR, store, tmpDir);

    // business_rule nodes (from test-descriptions and validation-rules)
    const rules = store.findNodes({ type: 'business_rule' });
    const extractorRules = rules.filter((n) => n.metadata.source === 'code-extractor');
    expect(extractorRules.length).toBeGreaterThan(0);

    // business_term nodes (from enum-constants)
    const terms = store.findNodes({ type: 'business_term' });
    const extractorTerms = terms.filter((n) => n.metadata.source === 'code-extractor');
    expect(extractorTerms.length).toBeGreaterThan(0);

    // business_process nodes (from api-paths)
    const processes = store.findNodes({ type: 'business_process' });
    const extractorProcesses = processes.filter((n) => n.metadata.source === 'code-extractor');
    expect(extractorProcesses.length).toBeGreaterThan(0);

    // All extractor nodes should have required metadata
    const allExtractorNodes = [...extractorRules, ...extractorTerms, ...extractorProcesses];
    for (const node of allExtractorNodes) {
      expect(node.metadata.source).toBe('code-extractor');
      expect(node.metadata.extractor).toBeTruthy();
      expect(node.metadata.confidence).toBeGreaterThanOrEqual(0);
      expect(node.metadata.stale).toBe(false);
    }
  });

  it('creates edges from extracted nodes to source file nodes', async () => {
    const runner = createExtractionRunner();
    const result = await runner.run(FIXTURE_DIR, store, tmpDir);

    expect(result.edgesAdded).toBeGreaterThan(0);
  });

  // Regression for #940: extractor `governs`/`documents` edges must target the
  // SAME path-based file-node ID the code scanner materializes
  // (`file:${relativePath}`), not a hash-based `file:<hash>` that never resolves.
  it('binds extractor governs/documents edges to materialized code-scanner file nodes (#940)', async () => {
    // Materialize the canonical path-based file nodes first (as `graph scan` does).
    const codeIngestor = new CodeIngestor(store);
    await codeIngestor.ingest(FIXTURE_DIR);

    // Then run the business-signal extractors (as `graph ingest --all` does).
    const runner = createExtractionRunner();
    await runner.run(FIXTURE_DIR, store, tmpDir);

    // Every edge that originates from an `extracted:` node must resolve to a real
    // file node — no dangling targets.
    const extractedNodes = [
      ...store.findNodes({ type: 'business_rule' }),
      ...store.findNodes({ type: 'business_term' }),
      ...store.findNodes({ type: 'business_process' }),
    ].filter((n) => n.metadata.source === 'code-extractor');
    expect(extractedNodes.length).toBeGreaterThan(0);

    let checkedEdges = 0;
    let governsChecked = 0;
    for (const node of extractedNodes) {
      const outEdges = store.getEdges({ from: node.id });
      const fileEdges = outEdges.filter((e) => e.type === 'governs' || e.type === 'documents');
      for (const edge of fileEdges) {
        checkedEdges++;
        if (edge.type === 'governs') governsChecked++;

        // The edge target must be the canonical path-based file-node ID.
        expect(edge.to).toBe(`file:${node.path}`);
        expect(edge.to).not.toMatch(/^file:[0-9a-f]{8,}$/);

        // And it must resolve to a real, materialized file node (no dangle).
        const target = store.getNode(edge.to);
        expect(target, `dangling edge target ${edge.to} from ${node.id}`).not.toBeNull();
        expect(target!.type).toBe('file');
      }
    }

    // Sanity: we actually exercised governs edges (from test-descriptions).
    expect(checkedEdges).toBeGreaterThan(0);
    expect(governsChecked).toBeGreaterThan(0);
  });

  it('covers all 6 languages across extractors', async () => {
    const runner = createExtractionRunner();
    await runner.run(FIXTURE_DIR, store, tmpDir);

    // Check JSONL files for language coverage
    for (const fileName of [
      'test-descriptions.jsonl',
      'enum-constants.jsonl',
      'validation-rules.jsonl',
      'api-paths.jsonl',
    ]) {
      const content = await fs.readFile(path.join(tmpDir, fileName), 'utf-8');
      const records = content
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as ExtractionRecord);

      const languages = new Set(records.map((r) => r.language));
      // Each extractor should cover at least TS and Python
      expect(languages.size).toBeGreaterThanOrEqual(2);
    }

    // Across all extractors, all 6 languages should appear
    const allLanguages = new Set<string>();
    for (const fileName of [
      'test-descriptions.jsonl',
      'enum-constants.jsonl',
      'validation-rules.jsonl',
      'api-paths.jsonl',
    ]) {
      const content = await fs.readFile(path.join(tmpDir, fileName), 'utf-8');
      const records = content
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as ExtractionRecord);
      for (const r of records) {
        allLanguages.add(r.language);
      }
    }

    expect(allLanguages).toContain('typescript');
    expect(allLanguages).toContain('python');
    expect(allLanguages).toContain('go');
    expect(allLanguages).toContain('rust');
    expect(allLanguages).toContain('java');
  });

  it('produces identical results on re-run (stable IDs)', async () => {
    const runner = createExtractionRunner();

    await runner.run(FIXTURE_DIR, store, tmpDir);
    const nodeCountBefore = [
      ...store.findNodes({ type: 'business_rule' }),
      ...store.findNodes({ type: 'business_term' }),
      ...store.findNodes({ type: 'business_process' }),
    ].filter((n) => n.metadata.source === 'code-extractor').length;

    // Second run with same store
    const result2 = await runner.run(FIXTURE_DIR, store, tmpDir);
    const nodeCountAfter = [
      ...store.findNodes({ type: 'business_rule' }),
      ...store.findNodes({ type: 'business_term' }),
      ...store.findNodes({ type: 'business_process' }),
    ].filter((n) => n.metadata.source === 'code-extractor').length;

    // No new nodes
    expect(nodeCountAfter).toBe(nodeCountBefore);
    expect(result2.nodesAdded).toBe(0);

    // JSONL should be identical
    const jsonl1 = await fs.readFile(path.join(tmpDir, 'test-descriptions.jsonl'), 'utf-8');
    const jsonl2 = await fs.readFile(path.join(tmpDir, 'test-descriptions.jsonl'), 'utf-8');
    expect(jsonl1).toBe(jsonl2);
  });

  it('marks stale nodes when signals disappear', async () => {
    const runner = createExtractionRunner();
    await runner.run(FIXTURE_DIR, store, tmpDir);

    const extractorNodesBefore = [
      ...store.findNodes({ type: 'business_rule' }),
      ...store.findNodes({ type: 'business_term' }),
      ...store.findNodes({ type: 'business_process' }),
    ].filter((n) => n.metadata.source === 'code-extractor' && !n.metadata.stale);
    expect(extractorNodesBefore.length).toBeGreaterThan(0);

    // Create an empty temp dir with no source files → all signals disappear
    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'extractor-empty-'));
    const emptyRunner = createExtractionRunner();
    await emptyRunner.run(emptyDir, store, tmpDir);

    // All previous nodes should now be stale
    const staleNodes = [
      ...store.findNodes({ type: 'business_rule' }),
      ...store.findNodes({ type: 'business_term' }),
      ...store.findNodes({ type: 'business_process' }),
    ].filter((n) => n.metadata.source === 'code-extractor' && n.metadata.stale === true);
    expect(staleNodes.length).toBe(extractorNodesBefore.length);
  });

  it('returns aggregated IngestResult', async () => {
    const runner = createExtractionRunner();
    const result = await runner.run(FIXTURE_DIR, store, tmpDir);

    expect(result.nodesAdded).toBeGreaterThan(0);
    expect(result.edgesAdded).toBeGreaterThan(0);
    expect(result.errors).toEqual([]);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
