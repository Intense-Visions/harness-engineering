import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { GraphStore } from '../../src/store/GraphStore.js';
import { DiagramParser } from '../../src/ingest/DiagramParser.js';
import {
  StructuralDriftDetector,
  type KnowledgeSnapshot,
} from '../../src/ingest/StructuralDriftDetector.js';
import { KnowledgeStagingAggregator } from '../../src/ingest/KnowledgeStagingAggregator.js';
import { KnowledgePipelineRunner } from '../../src/ingest/KnowledgePipelineRunner.js';

const DIAGRAM_FIXTURES = path.resolve(__dirname, '../__fixtures__/diagrams');

describe('Knowledge Pipeline (integration)', () => {
  let store: GraphStore;

  beforeEach(() => {
    store = new GraphStore();
  });

  it('diagram ingest creates nodes that drift detector can compare', async () => {
    // Phase 1: Ingest diagrams into graph
    const parser = new DiagramParser(store);
    const result = await parser.ingest(DIAGRAM_FIXTURES);
    expect(result.nodesAdded).toBeGreaterThan(0);

    // Build a "current" snapshot from the graph
    const businessNodes = store.findNodes({ type: 'business_concept' });
    const currentSnapshot: KnowledgeSnapshot = {
      entries: businessNodes.map((n) => ({
        id: n.id,
        type: n.type,
        contentHash: n.hash ?? n.id,
        source: (n.metadata?.source as string) ?? 'unknown',
        name: n.name,
      })),
      timestamp: new Date().toISOString(),
    };

    // Phase 2: Same snapshot as "fresh" → no drift
    const detector = new StructuralDriftDetector();
    const driftResult = detector.detect(currentSnapshot, currentSnapshot);
    expect(driftResult.findings).toHaveLength(0);
    expect(driftResult.driftScore).toBe(0);
  });

  it('detects new knowledge when fresh extraction finds entities not in graph', () => {
    const detector = new StructuralDriftDetector();
    const current: KnowledgeSnapshot = { entries: [], timestamp: new Date().toISOString() };
    const fresh: KnowledgeSnapshot = {
      entries: [
        {
          id: 'diagram:abc:server',
          type: 'business_concept',
          contentHash: 'h1',
          source: 'diagram',
          name: 'Web Server',
        },
        {
          id: 'diagram:abc:db',
          type: 'business_concept',
          contentHash: 'h2',
          source: 'diagram',
          name: 'PostgreSQL',
        },
      ],
      timestamp: new Date().toISOString(),
    };

    const result = detector.detect(current, fresh);
    expect(result.summary.new).toBe(2);
    expect(result.summary.stale).toBe(0);
  });

  it('detects stale knowledge when graph has entries absent from extraction', () => {
    const detector = new StructuralDriftDetector();
    const current: KnowledgeSnapshot = {
      entries: [
        {
          id: 'diagram:old:legacy',
          type: 'business_concept',
          contentHash: 'h1',
          source: 'diagram',
          name: 'Legacy Service',
        },
      ],
      timestamp: new Date().toISOString(),
    };
    const fresh: KnowledgeSnapshot = { entries: [], timestamp: new Date().toISOString() };

    const result = detector.detect(current, fresh);
    expect(result.summary.stale).toBe(1);
    expect(result.findings[0].classification).toBe('stale');
    expect(result.findings[0].severity).toBe('high');
  });

  it('generates gap report with per-domain coverage', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pipeline-'));

    try {
      // Set up docs/knowledge/ structure
      const knowledgeDir = path.join(tmpDir, 'docs', 'knowledge');
      await fs.mkdir(path.join(knowledgeDir, 'payments'), { recursive: true });
      await fs.mkdir(path.join(knowledgeDir, 'auth'), { recursive: true });
      await fs.writeFile(
        path.join(knowledgeDir, 'payments', 'refund-rules.md'),
        '---\ntype: business_rule\n---\nRefund within 30 days'
      );
      await fs.writeFile(
        path.join(knowledgeDir, 'auth', 'session-policy.md'),
        '---\ntype: business_rule\n---\n24h session timeout'
      );

      const aggregator = new KnowledgeStagingAggregator(tmpDir);
      const gapReport = await aggregator.generateGapReport(knowledgeDir);

      expect(gapReport.domains).toHaveLength(2);
      expect(gapReport.totalEntries).toBe(2);
      expect(gapReport.domains.find((d) => d.domain === 'payments')?.entryCount).toBe(1);
      expect(gapReport.domains.find((d) => d.domain === 'auth')?.entryCount).toBe(1);

      // Write gap report
      await aggregator.writeGapReport(gapReport);
      const gapsContent = await fs.readFile(
        path.join(tmpDir, '.harness', 'knowledge', 'gaps.md'),
        'utf-8'
      );
      expect(gapsContent).toContain('payments');
      expect(gapsContent).toContain('auth');
    } finally {
      await fs.rm(tmpDir, { recursive: true });
    }
  });

  describe('differential gap report', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'diff-gap-'));
    });

    afterEach(async () => {
      try {
        await fs.rm(tmpDir, { recursive: true });
      } catch {
        // best-effort cleanup
      }
    });

    it('produces differential report when store is provided', async () => {
      // Set up docs/knowledge/ with one documented entry
      const knowledgeDir = path.join(tmpDir, 'docs', 'knowledge');
      await fs.mkdir(path.join(knowledgeDir, 'payments'), { recursive: true });
      await fs.writeFile(
        path.join(knowledgeDir, 'payments', 'refund-rules.md'),
        '---\ntype: business_rule\ndomain: payments\n---\n# Refund Rules\nRefund within 30 days'
      );

      // Set up graph store with 3 nodes in payments domain (one matches doc)
      const gapStore = new GraphStore();
      gapStore.addNode({
        id: 'extracted:payments:refund-rules',
        type: 'business_rule',
        name: 'Refund Rules',
        metadata: { domain: 'payments', source: 'extractor' },
        content: 'Refund within 30 days for all products',
      });
      gapStore.addNode({
        id: 'extracted:payments:chargeback-policy',
        type: 'business_rule',
        name: 'Chargeback Policy',
        metadata: { domain: 'payments', source: 'extractor' },
        content: 'Chargebacks are handled within 14 business days',
      });
      gapStore.addNode({
        id: 'extracted:payments:payment-sla',
        type: 'business_process',
        name: 'Payment SLA',
        metadata: { domain: 'payments', source: 'diagram' },
        content: 'All payments settle within 24 hours',
      });

      const aggregator = new KnowledgeStagingAggregator(tmpDir);
      const report = await aggregator.generateGapReport(knowledgeDir, gapStore);

      expect(report.totalEntries).toBe(1);
      expect(report.totalExtracted).toBe(3);
      expect(report.totalGaps).toBe(2);

      const payments = report.domains.find((d) => d.domain === 'payments')!;
      expect(payments.entryCount).toBe(1);
      expect(payments.extractedCount).toBe(3);
      expect(payments.gapCount).toBe(2);
      expect(payments.gapEntries).toHaveLength(2);

      const gapNames = payments.gapEntries.map((e) => e.name).sort();
      expect(gapNames).toEqual(['Chargeback Policy', 'Payment SLA']);
    });

    it('returns backward-compatible result when store is not provided', async () => {
      const knowledgeDir = path.join(tmpDir, 'docs', 'knowledge');
      await fs.mkdir(path.join(knowledgeDir, 'auth'), { recursive: true });
      await fs.writeFile(
        path.join(knowledgeDir, 'auth', 'session-policy.md'),
        '---\ntype: business_rule\ndomain: auth\n---\n# Session Policy\n24h session timeout'
      );

      const aggregator = new KnowledgeStagingAggregator(tmpDir);
      const report = await aggregator.generateGapReport(knowledgeDir);

      expect(report.totalEntries).toBe(1);
      expect(report.totalExtracted).toBe(0);
      expect(report.totalGaps).toBe(0);

      const auth = report.domains.find((d) => d.domain === 'auth')!;
      expect(auth.entryCount).toBe(1);
      expect(auth.extractedCount).toBe(0);
      expect(auth.gapCount).toBe(0);
      expect(auth.gapEntries).toHaveLength(0);
    });

    it('gap entries include correct details', async () => {
      const knowledgeDir = path.join(tmpDir, 'docs', 'knowledge');
      await fs.mkdir(path.join(knowledgeDir, 'billing'), { recursive: true });

      // No docs — all extracted nodes are gaps
      const gapStore = new GraphStore();
      gapStore.addNode({
        id: 'extracted:billing:invoice-gen',
        type: 'business_process',
        name: 'Invoice Generation',
        metadata: { domain: 'billing', source: 'extractor' },
        content: 'Generate invoices on the 1st of each month for all active subscriptions',
      });
      gapStore.addNode({
        id: 'extracted:billing:thin-finding',
        type: 'business_fact',
        name: 'Tax Rate',
        metadata: { domain: 'billing', source: 'linker' },
        content: 'short',
      });

      const aggregator = new KnowledgeStagingAggregator(tmpDir);
      const report = await aggregator.generateGapReport(knowledgeDir, gapStore);

      expect(report.totalGaps).toBe(2);
      const billing = report.domains.find((d) => d.domain === 'billing')!;
      expect(billing.entryCount).toBe(0);
      expect(billing.extractedCount).toBe(2);

      const invoiceGap = billing.gapEntries.find((e) => e.name === 'Invoice Generation')!;
      expect(invoiceGap.nodeId).toBe('extracted:billing:invoice-gen');
      expect(invoiceGap.nodeType).toBe('business_process');
      expect(invoiceGap.source).toBe('extractor');
      expect(invoiceGap.hasContent).toBe(true);

      const thinGap = billing.gapEntries.find((e) => e.name === 'Tax Rate')!;
      expect(thinGap.hasContent).toBe(false); // 'short' is < 10 chars
      expect(thinGap.source).toBe('linker');
    });

    it('writeGapReport renders differential table when extracted data present', async () => {
      const aggregator = new KnowledgeStagingAggregator(tmpDir);

      const report: import('../../src/ingest/KnowledgeStagingAggregator.js').GapReport = {
        domains: [
          {
            domain: 'payments',
            entryCount: 3,
            extractedCount: 15,
            gapCount: 12,
            gapEntries: [],
          },
        ],
        totalEntries: 3,
        totalExtracted: 15,
        totalGaps: 12,
        generatedAt: '2026-04-25T00:00:00.000Z',
      };

      await aggregator.writeGapReport(report);
      const content = await fs.readFile(
        path.join(tmpDir, '.harness', 'knowledge', 'gaps.md'),
        'utf-8'
      );

      expect(content).toContain('| Domain | Documented | Extracted | Gaps |');
      expect(content).toContain('| payments | 3 | 15 | 12 |');
      expect(content).toContain('**Total Gaps:** 12');
      expect(content).not.toContain('| Domain | Entries |');
    });

    it('writeGapReport renders legacy table when no extracted data', async () => {
      const aggregator = new KnowledgeStagingAggregator(tmpDir);

      const report: import('../../src/ingest/KnowledgeStagingAggregator.js').GapReport = {
        domains: [
          {
            domain: 'auth',
            entryCount: 2,
            extractedCount: 0,
            gapCount: 0,
            gapEntries: [],
          },
        ],
        totalEntries: 2,
        totalExtracted: 0,
        totalGaps: 0,
        generatedAt: '2026-04-25T00:00:00.000Z',
      };

      await aggregator.writeGapReport(report);
      const content = await fs.readFile(
        path.join(tmpDir, '.harness', 'knowledge', 'gaps.md'),
        'utf-8'
      );

      expect(content).toContain('| Domain | Entries |');
      expect(content).toContain('| auth | 2 |');
      expect(content).toContain('Total Entries: 2');
      expect(content).not.toContain('Extracted');
    });

    it('name matching is case-insensitive', async () => {
      const knowledgeDir = path.join(tmpDir, 'docs', 'knowledge');
      await fs.mkdir(path.join(knowledgeDir, 'auth'), { recursive: true });
      await fs.writeFile(
        path.join(knowledgeDir, 'auth', 'session-policy.md'),
        '---\ntype: business_rule\ndomain: auth\n---\n# Session Policy\n24h session timeout'
      );

      const gapStore = new GraphStore();
      gapStore.addNode({
        id: 'extracted:auth:session-policy',
        type: 'business_rule',
        name: 'session policy', // lowercase — should still match
        metadata: { domain: 'auth', source: 'extractor' },
        content: '24h session timeout policy for all users',
      });

      const aggregator = new KnowledgeStagingAggregator(tmpDir);
      const report = await aggregator.generateGapReport(knowledgeDir, gapStore);

      expect(report.totalGaps).toBe(0);
      const auth = report.domains.find((d) => d.domain === 'auth')!;
      expect(auth.gapEntries).toHaveLength(0);
    });
  });

  it('convergence: finding count stable when no remediation applied', () => {
    const detector = new StructuralDriftDetector();
    const current: KnowledgeSnapshot = {
      entries: [
        {
          id: 'fact:a',
          type: 'business_fact',
          contentHash: 'old',
          source: 'extractor',
          name: 'Rule A',
        },
      ],
      timestamp: new Date().toISOString(),
    };
    const fresh: KnowledgeSnapshot = {
      entries: [
        {
          id: 'fact:a',
          type: 'business_fact',
          contentHash: 'new',
          source: 'extractor',
          name: 'Rule A',
        },
      ],
      timestamp: new Date().toISOString(),
    };

    // First detection
    const result1 = detector.detect(current, fresh);
    expect(result1.summary.drifted).toBe(1);

    // Second detection without remediation — same result (convergence)
    const result2 = detector.detect(current, fresh);
    expect(result2.findings.length).toBe(result1.findings.length);
    // Convergence: finding count did not decrease → should stop
  });

  describe('KnowledgePipelineRunner (full pipeline)', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runner-e2e-'));
    });

    afterEach(async () => {
      try {
        await fs.rm(tmpDir, { recursive: true });
      } catch {
        // best-effort cleanup
      }
    });

    it('runs full pipeline with diagrams and business knowledge', async () => {
      // Set up diagram
      const diagramDir = path.join(tmpDir, 'docs', 'diagrams');
      await fs.mkdir(diagramDir, { recursive: true });
      await fs.writeFile(
        path.join(diagramDir, 'arch.mmd'),
        'graph TD\n  API[API Server] --> DB[Database]'
      );

      // Set up business knowledge
      const knowledgeDir = path.join(tmpDir, 'docs', 'knowledge', 'payments');
      await fs.mkdir(knowledgeDir, { recursive: true });
      await fs.writeFile(
        path.join(knowledgeDir, 'sla.md'),
        '---\ntype: business_rule\ndomain: payments\n---\n# Payment SLA\nPayments must settle within 24 hours.'
      );

      const runnerStore = new GraphStore();
      const runner = new KnowledgePipelineRunner(runnerStore);
      const result = await runner.run({
        projectDir: tmpDir,
        fix: false,
        ci: false,
      });

      expect(result.extraction.diagrams).toBeGreaterThan(0);
      expect(result.extraction.businessKnowledge).toBeGreaterThan(0);
      expect(result.gaps.domains.length).toBeGreaterThan(0);
      expect(result.verdict).toBeDefined();
      expect(['pass', 'warn', 'fail']).toContain(result.verdict);
    });

    it('fix mode converges on empty project', async () => {
      const runnerStore = new GraphStore();
      const runner = new KnowledgePipelineRunner(runnerStore);
      const result = await runner.run({
        projectDir: tmpDir,
        fix: true,
        ci: false,
        maxIterations: 3,
      });

      expect(result.iterations).toBe(1);
      expect(result.verdict).toBe('pass');
      expect(result.remediations).toHaveLength(0);
    });

    it('CI mode runs non-interactively', async () => {
      const runnerStore = new GraphStore();
      const runner = new KnowledgePipelineRunner(runnerStore);
      const result = await runner.run({
        projectDir: tmpDir,
        fix: true,
        ci: true,
      });

      expect(result.verdict).toBeDefined();
      expect(result.iterations).toBeGreaterThanOrEqual(1);
    });

    it('domain filter limits scope', async () => {
      const knowledgeDir = path.join(tmpDir, 'docs', 'knowledge');
      await fs.mkdir(path.join(knowledgeDir, 'auth'), { recursive: true });
      await fs.mkdir(path.join(knowledgeDir, 'billing'), { recursive: true });
      await fs.writeFile(
        path.join(knowledgeDir, 'auth', 'policy.md'),
        '---\ntype: business_rule\ndomain: auth\n---\nSession timeout: 24h'
      );
      await fs.writeFile(
        path.join(knowledgeDir, 'billing', 'cycle.md'),
        '---\ntype: business_rule\ndomain: billing\n---\nMonthly billing'
      );

      const runnerStore = new GraphStore();
      const runner = new KnowledgePipelineRunner(runnerStore);
      const result = await runner.run({
        projectDir: tmpDir,
        fix: false,
        ci: false,
        domain: 'auth',
      });

      expect(result.verdict).toBeDefined();
      expect(result.gaps.domains.length).toBe(2); // Gap report still shows all domains
    });

    it('writes gaps.md to .harness/knowledge/', async () => {
      const knowledgeDir = path.join(tmpDir, 'docs', 'knowledge', 'testing');
      await fs.mkdir(knowledgeDir, { recursive: true });
      await fs.writeFile(
        path.join(knowledgeDir, 'rules.md'),
        '---\ntype: business_rule\ndomain: testing\n---\nAll tests must pass'
      );

      const runnerStore = new GraphStore();
      const runner = new KnowledgePipelineRunner(runnerStore);
      await runner.run({ projectDir: tmpDir, fix: false, ci: false });

      const gapsPath = path.join(tmpDir, '.harness', 'knowledge', 'gaps.md');
      const content = await fs.readFile(gapsPath, 'utf-8');
      expect(content).toContain('testing');
      expect(content).toContain('Knowledge Gaps Report');
    });
  });

  it('end-to-end: ingest + detect + stage', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-pipeline-'));

    try {
      // Create a diagram file in the temp dir
      const diagramDir = path.join(tmpDir, 'docs', 'diagrams');
      await fs.mkdir(diagramDir, { recursive: true });
      await fs.writeFile(
        path.join(diagramDir, 'flow.mmd'),
        'graph TD\n  A[Start] --> B[Process]\n  B --> C[End]'
      );

      // Ingest
      const parser = new DiagramParser(store);
      const ingestResult = await parser.ingest(tmpDir);
      expect(ingestResult.nodesAdded).toBe(3); // A, B, C

      // Build snapshot from graph
      const nodes = store.findNodes({ type: 'business_concept' });
      const snapshot: KnowledgeSnapshot = {
        entries: nodes.map((n) => ({
          id: n.id,
          type: n.type,
          contentHash: n.hash ?? n.id,
          source: 'diagram',
          name: n.name,
        })),
        timestamp: new Date().toISOString(),
      };

      // Detect against empty current (all NEW)
      const detector = new StructuralDriftDetector();
      const emptySnapshot: KnowledgeSnapshot = {
        entries: [],
        timestamp: new Date().toISOString(),
      };
      const driftResult = detector.detect(emptySnapshot, snapshot);
      expect(driftResult.summary.new).toBe(3);

      // Stage
      const aggregator = new KnowledgeStagingAggregator(tmpDir);
      const stageResult = await aggregator.aggregate(
        [],
        [],
        nodes.map((n) => ({
          id: n.id,
          source: 'diagram' as const,
          nodeType: n.type,
          name: n.name,
          confidence: 0.85,
          contentHash: n.hash ?? n.id,
          timestamp: new Date().toISOString(),
        }))
      );
      expect(stageResult.staged).toBe(3);

      // Verify staged file exists
      const stagedPath = path.join(
        tmpDir,
        '.harness',
        'knowledge',
        'staged',
        'pipeline-staged.jsonl'
      );
      const stagedContent = await fs.readFile(stagedPath, 'utf-8');
      const lines = stagedContent.trim().split('\n');
      expect(lines).toHaveLength(3);
    } finally {
      await fs.rm(tmpDir, { recursive: true });
    }
  });
});
