import { describe, it, expect, beforeEach } from 'vitest';
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
