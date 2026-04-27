import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { GraphStore } from '../../src/store/GraphStore.js';
import { KnowledgePipelineRunner } from '../../src/ingest/KnowledgePipelineRunner.js';

describe('Knowledge Pipeline — materialization integration', () => {
  let tmpDir: string;
  let store: GraphStore;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mat-pipeline-'));
    store = new GraphStore();
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true });
    } catch {
      // best-effort cleanup
    }
  });

  it('fix mode materializes docs from extracted graph nodes', async () => {
    // Seed the graph with business nodes that have content
    store.addNode({
      id: 'extracted:billing:invoice-gen',
      type: 'business_process',
      name: 'Invoice Generation',
      metadata: { domain: 'billing', source: 'extractor' },
      content: 'Generate invoices on the 1st of each month for all active subscriptions',
    });
    store.addNode({
      id: 'extracted:billing:payment-retry',
      type: 'business_rule',
      name: 'Payment Retry Policy',
      metadata: { domain: 'billing', source: 'extractor' },
      content: 'Failed payments are retried up to 3 times with exponential backoff',
    });

    // Ensure docs/knowledge dir exists but is empty
    await fs.mkdir(path.join(tmpDir, 'docs', 'knowledge', 'billing'), { recursive: true });

    const runner = new KnowledgePipelineRunner(store);
    const result = await runner.run({
      projectDir: tmpDir,
      fix: true,
      ci: false,
      maxIterations: 3,
    });

    // Materialization result should exist
    expect(result.materialization).toBeDefined();
    expect(result.materialization!.created.length).toBe(2);

    // Files should exist on disk
    for (const doc of result.materialization!.created) {
      const fullPath = path.join(tmpDir, doc.filePath);
      const stat = await fs.stat(fullPath);
      expect(stat.isFile()).toBe(true);

      const content = await fs.readFile(fullPath, 'utf-8');
      expect(content).toContain('---');
      expect(content).toContain('type:');
      expect(content).toContain('domain: billing');
    }

    // Remediations should include created doc entries
    const createdRemediations = result.remediations.filter((r) => r.startsWith('created doc:'));
    expect(createdRemediations.length).toBe(2);
  });

  it('CI mode does NOT create docs', async () => {
    store.addNode({
      id: 'extracted:auth:session-timeout',
      type: 'business_rule',
      name: 'Session Timeout',
      metadata: { domain: 'auth', source: 'extractor' },
      content: 'User sessions expire after 24 hours of inactivity',
    });

    await fs.mkdir(path.join(tmpDir, 'docs', 'knowledge', 'auth'), { recursive: true });

    const runner = new KnowledgePipelineRunner(store);
    const result = await runner.run({
      projectDir: tmpDir,
      fix: true,
      ci: true,
      maxIterations: 3,
    });

    // Materialization should NOT have occurred
    expect(result.materialization).toBeUndefined();

    // No docs should exist
    const authFiles = await fs.readdir(path.join(tmpDir, 'docs', 'knowledge', 'auth'));
    expect(authFiles.filter((f) => f.endsWith('.md'))).toHaveLength(0);
  });

  it('gap report in result includes differential counts when store has nodes', async () => {
    store.addNode({
      id: 'extracted:payments:refund-rules',
      type: 'business_rule',
      name: 'Refund Rules',
      metadata: { domain: 'payments', source: 'extractor' },
      content: 'Refund within 30 days for all products purchased online',
    });

    // Create a matching doc so it is NOT a gap
    const paymentsDir = path.join(tmpDir, 'docs', 'knowledge', 'payments');
    await fs.mkdir(paymentsDir, { recursive: true });
    await fs.writeFile(
      path.join(paymentsDir, 'refund-rules.md'),
      '---\ntype: business_rule\ndomain: payments\n---\n# Refund Rules\nRefund within 30 days'
    );

    const runner = new KnowledgePipelineRunner(store);
    const result = await runner.run({
      projectDir: tmpDir,
      fix: false,
      ci: false,
    });

    // Gap report should have differential data
    expect(result.gaps.totalExtracted).toBeGreaterThan(0);
    expect(result.gaps.totalGaps).toBe(0); // The only node matches the doc
  });
});
