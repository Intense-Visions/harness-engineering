import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runScan } from '../../../src/commands/graph/scan';

/**
 * #949 (follow-up): `harness graph scan` ingests code BEFORE requirement specs,
 * so `@req` annotations must be linked AFTER requirement nodes exist. Before the
 * fix the annotation pass ran inline during code ingestion — before any
 * requirement node existed — so every annotation logged "references non-existent
 * requirement" and no `verified_by` edge was created on a single `scan` (it only
 * worked via the two-step `scan` then `ingest --all` workaround). This guards the
 * production wiring: annotation linking now runs after RequirementIngestor.
 */
describe('runScan @req annotation linking (#949)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'runscan-req-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('creates a verified_by edge from an @req annotation to the annotated file', async () => {
    // A spec so RequirementIngestor mints requirement nodes.
    const featureDir = path.join(tmp, 'docs', 'changes', 'auth-feature');
    fs.mkdirSync(featureDir, { recursive: true });
    fs.writeFileSync(
      path.join(featureDir, 'proposal.md'),
      [
        '# Auth Feature',
        '',
        '## Success Criteria',
        '',
        '1. When a user logs in, the system shall return a token',
        '',
      ].join('\n')
    );

    // A source file annotated with @req against that requirement.
    const srcDir = path.join(tmp, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'auth.test.ts'),
      [
        '// @req auth-feature#1',
        'describe("auth", () => {',
        '  it("logs in", () => {});',
        '});',
        '',
      ].join('\n')
    );

    await runScan(tmp);

    // Load the persisted graph and assert the annotation edge exists and resolves
    // to the path-based file node the code scanner materialized.
    const { GraphStore } = await import('@harness-engineering/graph');
    const store = new GraphStore();
    await store.load(path.join(tmp, '.harness', 'graph'));

    const annotationEdges = store
      .getEdges({ type: 'verified_by' })
      .filter((e) => e.metadata?.method === 'annotation');

    expect(annotationEdges.length).toBeGreaterThanOrEqual(1);
    expect(annotationEdges.some((e) => e.to === 'file:src/auth.test.ts')).toBe(true);
  });
});
