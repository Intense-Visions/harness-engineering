import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import * as fs from 'node:fs/promises';
import * as os from 'os';
import {
  ExtractionRunner,
  detectLanguage,
  DEFAULT_EXTRACTION_EXCLUDE,
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
    supportedExtensions: [
      '.ts',
      '.tsx',
      '.mts',
      '.cts',
      '.js',
      '.jsx',
      '.mjs',
      '.cjs',
      '.py',
      '.go',
      '.rs',
      '.java',
    ],
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

  describe('test / fixture exclusion (#1111)', () => {
    /** Write a small polyglot-free TS project tree under a temp root. */
    async function buildProjectTree(root: string): Promise<void> {
      const write = async (rel: string, body = 'export const x = 1;\n') => {
        const full = path.join(root, rel);
        await fs.mkdir(path.dirname(full), { recursive: true });
        await fs.writeFile(full, body, 'utf-8');
      };
      await write('src/orders.ts'); // genuine first-party source
      await write('src/orders.test.ts'); // co-located test file
      await write('tests/sync-runtime.test.ts'); // test directory
      await write('tests/skills/fixtures/optum/expected/schema.ts'); // golden fixture
      await write('src/__snapshots__/thing.ts'); // snapshot tree
    }

    it('findSourceFiles walks first-party source but skips test files and fixtures', async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'excl-test-'));
      await buildProjectTree(root);

      const runner = new ExtractionRunner([]);
      const files = (await runner.findSourceFiles(root)).map((f) =>
        path.relative(root, f).replaceAll('\\', '/')
      );

      expect(files).toContain('src/orders.ts');
      expect(files).not.toContain('src/orders.test.ts');
      expect(files).not.toContain('tests/sync-runtime.test.ts');
      expect(files).not.toContain('tests/skills/fixtures/optum/expected/schema.ts');
      expect(files).not.toContain('src/__snapshots__/thing.ts');
    });

    it('extracts a genuine first-party signal but not test/fixture-derived ones', async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'excl-test-'));
      await buildProjectTree(root);
      const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'excl-out-'));

      // Stub emits one record per file it is given — so the produced records'
      // filePaths reveal exactly which files the runner fed to the extractors.
      const stub = createStubExtractor('probe');
      const runner = new ExtractionRunner([stub]);
      const store = new GraphStore();
      await runner.run(root, store, outDir);

      const paths = store
        .findNodes({ type: 'business_rule' })
        .filter((n) => n.metadata.source === 'code-extractor')
        .map((n) => n.path);

      expect(paths).toContain('src/orders.ts');
      expect(paths).not.toContain('src/orders.test.ts');
      expect(paths).not.toContain('tests/sync-runtime.test.ts');
      expect(paths).not.toContain('tests/skills/fixtures/optum/expected/schema.ts');
    });

    it('honors caller-supplied excludeGlobs that extend the defaults', async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'excl-test-'));
      await fs.mkdir(path.join(root, 'src'), { recursive: true });
      await fs.writeFile(path.join(root, 'src/orders.ts'), 'export const x = 1;\n');
      await fs.writeFile(path.join(root, 'src/generated.ts'), 'export const y = 2;\n');

      const runner = new ExtractionRunner([], {
        excludeGlobs: [...DEFAULT_EXTRACTION_EXCLUDE, '**/generated.ts'],
      });
      const files = (await runner.findSourceFiles(root)).map((f) =>
        path.relative(root, f).replaceAll('\\', '/')
      );

      expect(files).toContain('src/orders.ts');
      expect(files).not.toContain('src/generated.ts');
    });
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
