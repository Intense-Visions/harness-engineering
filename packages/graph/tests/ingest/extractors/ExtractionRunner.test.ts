import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import * as fs from 'node:fs/promises';
import * as os from 'os';
import {
  ExtractionRunner,
  detectLanguage,
} from '../../../src/ingest/extractors/ExtractionRunner.js';
import { GraphStore } from '../../../src/store/GraphStore.js';
import type {
  ExtractionRecord,
  Language,
  SignalExtractor,
} from '../../../src/ingest/extractors/types.js';
import { hash } from '../../../src/ingest/ingestUtils.js';

const FIXTURE_DIR = path.resolve(__dirname, '../../../__fixtures__/extractor-project');

/** Simple stub extractor for testing the runner. */
function createStubExtractor(name: string): SignalExtractor {
  return {
    name,
    supportedExtensions: ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java'],
    extract(content: string, filePath: string, language: Language): ExtractionRecord[] {
      return [
        {
          id: `extracted:${name}:${hash(filePath + ':stub')}`,
          extractor: name,
          language,
          filePath,
          line: 1,
          nodeType: 'business_rule',
          name: `stub from ${path.basename(filePath)}`,
          content: 'stub content',
          confidence: 0.7,
          metadata: {},
        },
      ];
    },
  };
}

describe('detectLanguage', () => {
  it('maps .ts to typescript', () => {
    expect(detectLanguage('src/foo.ts')).toBe('typescript');
  });
  it('maps .tsx to typescript', () => {
    expect(detectLanguage('src/foo.tsx')).toBe('typescript');
  });
  it('maps .js to javascript', () => {
    expect(detectLanguage('src/foo.js')).toBe('javascript');
  });
  it('maps .py to python', () => {
    expect(detectLanguage('src/foo.py')).toBe('python');
  });
  it('maps .go to go', () => {
    expect(detectLanguage('src/foo.go')).toBe('go');
  });
  it('maps .rs to rust', () => {
    expect(detectLanguage('src/foo.rs')).toBe('rust');
  });
  it('maps .java to java', () => {
    expect(detectLanguage('src/Foo.java')).toBe('java');
  });
  it('returns undefined for .d.ts', () => {
    expect(detectLanguage('src/foo.d.ts')).toBeUndefined();
  });
  it('returns undefined for unsupported extensions', () => {
    expect(detectLanguage('src/foo.md')).toBeUndefined();
  });
});

describe('ExtractionRunner', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'extractor-test-'));
  });

  it('finds source files in fixture directory', async () => {
    const runner = new ExtractionRunner([]);
    const files = await runner.findSourceFiles(FIXTURE_DIR);
    expect(files.length).toBeGreaterThan(0);
    // Should find TypeScript, Python, Go, Rust, Java files
    const extensions = new Set(files.map((f) => path.extname(f)));
    expect(extensions).toContain('.ts');
    expect(extensions).toContain('.py');
    expect(extensions).toContain('.go');
    expect(extensions).toContain('.rs');
    expect(extensions).toContain('.java');
  });

  it('writes JSONL output for each extractor', async () => {
    const stubExtractor = createStubExtractor('test-stub');
    const runner = new ExtractionRunner([stubExtractor]);
    const store = new GraphStore();

    await runner.run(FIXTURE_DIR, store, tmpDir);

    const jsonlPath = path.join(tmpDir, 'test-stub.jsonl');
    const content = await fs.readFile(jsonlPath, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);

    // Each line should be valid JSON ExtractionRecord
    for (const line of lines) {
      const record = JSON.parse(line) as ExtractionRecord;
      expect(record.id).toMatch(/^extracted:test-stub:/);
      expect(record.extractor).toBe('test-stub');
      expect(record.confidence).toBeGreaterThanOrEqual(0);
      expect(record.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('creates graph nodes with correct metadata', async () => {
    const stubExtractor = createStubExtractor('test-stub');
    const runner = new ExtractionRunner([stubExtractor]);
    const store = new GraphStore();

    const result = await runner.run(FIXTURE_DIR, store, tmpDir);

    expect(result.nodesAdded).toBeGreaterThan(0);
    expect(result.edgesAdded).toBeGreaterThan(0);

    const nodes = store.findNodes({ type: 'business_rule' });
    const extractorNodes = nodes.filter((n) => n.metadata.source === 'code-extractor');
    expect(extractorNodes.length).toBeGreaterThan(0);
    for (const node of extractorNodes) {
      expect(node.metadata.extractor).toBe('test-stub');
      expect(node.metadata.confidence).toBe(0.7);
      expect(node.metadata.stale).toBe(false);
    }
  });

  it('produces identical results on re-run (stable IDs)', async () => {
    const stubExtractor = createStubExtractor('test-stub');
    const runner = new ExtractionRunner([stubExtractor]);
    const store = new GraphStore();

    const result1 = await runner.run(FIXTURE_DIR, store, tmpDir);
    const nodesBefore = store.findNodes({ type: 'business_rule' }).length;

    const result2 = await runner.run(FIXTURE_DIR, store, tmpDir);
    const nodesAfter = store.findNodes({ type: 'business_rule' }).length;

    // No new nodes on second run
    expect(nodesAfter).toBe(nodesBefore);
    expect(result2.nodesAdded).toBe(0);
  });

  it('marks stale nodes when signals disappear', async () => {
    // First run: create some nodes
    const stubExtractor = createStubExtractor('test-stub');
    const runner = new ExtractionRunner([stubExtractor]);
    const store = new GraphStore();

    await runner.run(FIXTURE_DIR, store, tmpDir);

    const nodesBefore = store
      .findNodes({ type: 'business_rule' })
      .filter((n) => n.metadata.source === 'code-extractor');
    expect(nodesBefore.length).toBeGreaterThan(0);

    // Second run: empty extractor returns nothing
    const emptyExtractor: SignalExtractor = {
      name: 'test-stub',
      supportedExtensions: ['.ts'],
      extract() {
        return [];
      },
    };
    const runner2 = new ExtractionRunner([emptyExtractor]);
    await runner2.run(FIXTURE_DIR, store, tmpDir);

    // All previous nodes should be marked stale
    const nodesAfter = store
      .findNodes({ type: 'business_rule' })
      .filter((n) => n.metadata.source === 'code-extractor');
    const staleNodes = nodesAfter.filter((n) => n.metadata.stale === true);
    expect(staleNodes.length).toBe(nodesBefore.length);
    for (const stale of staleNodes) {
      expect(stale.metadata.staleAt).toBeDefined();
    }
  });
});
