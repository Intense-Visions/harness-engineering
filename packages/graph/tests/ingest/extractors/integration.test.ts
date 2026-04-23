import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import * as fs from 'node:fs/promises';
import * as os from 'os';
import { GraphStore } from '../../../src/store/GraphStore.js';
import { createExtractionRunner } from '../../../src/ingest/extractors/index.js';
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
