import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { CodeIngestor } from '../../src/ingest/CodeIngestor.js';
import { RequirementIngestor } from '../../src/ingest/RequirementIngestor.js';

const FIXTURE_DIR = path.resolve(__dirname, '../../__fixtures__/sample-project');

describe('CodeIngestor @req annotation parsing', () => {
  let store: GraphStore;
  let tmpDir: string;

  beforeEach(async () => {
    store = new GraphStore();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'code-ingestor-req-'));

    // Create a minimal spec so RequirementIngestor creates requirement nodes
    const featureDir = path.join(tmpDir, 'docs', 'changes', 'auth-feature');
    await fs.mkdir(featureDir, { recursive: true });
    await fs.writeFile(
      path.join(featureDir, 'proposal.md'),
      [
        '# Auth Feature',
        '',
        '## Success Criteria',
        '',
        '1. When a user logs in, the system shall return a token',
        '2. The system shall hash passwords before storage',
        '3. The system shall validate tokens on every request',
        '',
      ].join('\n')
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should create verified_by edges from @req annotations with confidence 1.0', async () => {
    // Create a source file with a @req annotation
    const srcDir = path.join(tmpDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(
      path.join(srcDir, 'auth.test.ts'),
      [
        '// @req auth-feature#1',
        'describe("auth", () => {',
        '  it("should login", () => {});',
        '});',
      ].join('\n')
    );

    // Ingest requirements first so requirement nodes exist
    const reqIngestor = new RequirementIngestor(store);
    await reqIngestor.ingestSpecs(path.join(tmpDir, 'docs', 'changes'));

    // Verify requirement nodes were created
    const reqNodes = store.findNodes({ type: 'requirement' });
    expect(reqNodes.length).toBe(3);

    // Ingest code (which will parse @req annotations)
    const codeIngestor = new CodeIngestor(store);
    await codeIngestor.ingest(tmpDir);

    // Find verified_by edges created by annotation
    const verifiedByEdges = store.getEdges({ type: 'verified_by' });
    const annotationEdges = verifiedByEdges.filter((e) => e.metadata?.method === 'annotation');

    expect(annotationEdges.length).toBeGreaterThanOrEqual(1);
    const edge = annotationEdges[0]!;
    expect(edge.confidence).toBe(1.0);
    expect(edge.metadata!.method).toBe('annotation');
    expect(edge.metadata!.tag).toBe('@req auth-feature#1');
    expect(edge.metadata!.confidence).toBe(1.0);

    // The 'from' should be the requirement node
    const reqNode = reqNodes.find((n) => n.metadata.index === 1);
    expect(edge.from).toBe(reqNode!.id);

    // The 'to' should be a file node
    expect(edge.to).toMatch(/^file:/);
  });

  it('should warn but not fail when @req references a non-existent requirement', async () => {
    const srcDir = path.join(tmpDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(
      path.join(srcDir, 'missing-ref.ts'),
      ['// @req nonexistent-feature#99', 'export function doSomething() { return true; }'].join(
        '\n'
      )
    );

    // Ingest requirements first
    const reqIngestor = new RequirementIngestor(store);
    await reqIngestor.ingestSpecs(path.join(tmpDir, 'docs', 'changes'));

    // Spy on console.warn
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Ingest code — should not throw
    const codeIngestor = new CodeIngestor(store);
    const result = await codeIngestor.ingest(tmpDir);

    expect(result.errors).toHaveLength(0);

    // Should have logged a warning
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('nonexistent-feature#99'));

    // No annotation-based verified_by edges should have been created
    const verifiedByEdges = store.getEdges({ type: 'verified_by' });
    const annotationEdges = verifiedByEdges.filter((e) => e.metadata?.method === 'annotation');
    expect(annotationEdges).toHaveLength(0);

    warnSpy.mockRestore();
  });

  it('should create multiple verified_by edges from multiple @req annotations in one file', async () => {
    const srcDir = path.join(tmpDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(
      path.join(srcDir, 'auth-full.test.ts'),
      [
        '// @req auth-feature#1',
        '// @req auth-feature#2',
        '// @req auth-feature#3',
        'describe("auth full suite", () => {',
        '  it("covers login", () => {});',
        '  it("covers hashing", () => {});',
        '  it("covers validation", () => {});',
        '});',
      ].join('\n')
    );

    // Ingest requirements first
    const reqIngestor = new RequirementIngestor(store);
    await reqIngestor.ingestSpecs(path.join(tmpDir, 'docs', 'changes'));

    const reqNodes = store.findNodes({ type: 'requirement' });
    expect(reqNodes.length).toBe(3);

    // Ingest code
    const codeIngestor = new CodeIngestor(store);
    await codeIngestor.ingest(tmpDir);

    // Find annotation-created verified_by edges
    const verifiedByEdges = store.getEdges({ type: 'verified_by' });
    const annotationEdges = verifiedByEdges.filter((e) => e.metadata?.method === 'annotation');

    // Should have 3 annotation edges (one per @req)
    expect(annotationEdges).toHaveLength(3);

    // Each should point from a distinct requirement to the same test file
    const fromIds = new Set(annotationEdges.map((e) => e.from));
    expect(fromIds.size).toBe(3);

    const toIds = new Set(annotationEdges.map((e) => e.to));
    expect(toIds.size).toBe(1); // All point to the same file

    // All should have confidence 1.0
    for (const edge of annotationEdges) {
      expect(edge.confidence).toBe(1.0);
      expect(edge.metadata!.method).toBe('annotation');
    }
  });
});
