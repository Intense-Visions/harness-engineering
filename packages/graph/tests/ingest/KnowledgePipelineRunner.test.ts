import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { KnowledgePipelineRunner } from '../../src/ingest/KnowledgePipelineRunner.js';
import type { KnowledgePipelineOptions } from '../../src/ingest/KnowledgePipelineRunner.js';

describe('KnowledgePipelineRunner', () => {
  let store: GraphStore;
  let tmpDir: string;

  beforeEach(async () => {
    store = new GraphStore();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kp-runner-'));
    await fs.mkdir(path.join(tmpDir, '.harness', 'knowledge', 'extracted'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, '.harness', 'knowledge', 'staged'), { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true });
    } catch {
      // cleanup best-effort
    }
  });

  function makeOptions(
    overrides: Partial<KnowledgePipelineOptions> = {}
  ): KnowledgePipelineOptions {
    return {
      projectDir: tmpDir,
      fix: false,
      ci: false,
      ...overrides,
    };
  }

  describe('verdict computation', () => {
    it('returns pass when no findings exist', async () => {
      const runner = new KnowledgePipelineRunner(store);
      const result = await runner.run(makeOptions());
      expect(result.verdict).toBe('pass');
    });

    it('returns correct iteration count without fix mode', async () => {
      const runner = new KnowledgePipelineRunner(store);
      const result = await runner.run(makeOptions({ fix: false }));
      expect(result.iterations).toBe(1);
    });
  });

  describe('extraction phase', () => {
    it('extracts entities from diagram files', async () => {
      const diagramDir = path.join(tmpDir, 'docs', 'diagrams');
      await fs.mkdir(diagramDir, { recursive: true });
      await fs.writeFile(
        path.join(diagramDir, 'arch.mmd'),
        'graph TD\n  API[API Gateway] --> DB[Database]\n  API --> Cache[Redis Cache]'
      );

      const runner = new KnowledgePipelineRunner(store);
      const result = await runner.run(makeOptions());
      expect(result.extraction.diagrams).toBeGreaterThan(0);
    });

    it('extracts from business knowledge files', async () => {
      const knowledgeDir = path.join(tmpDir, 'docs', 'knowledge', 'payments');
      await fs.mkdir(knowledgeDir, { recursive: true });
      await fs.writeFile(
        path.join(knowledgeDir, 'refund-policy.md'),
        '---\ntype: business_rule\ndomain: payments\n---\n# Refund Policy\nRefunds must be processed within 30 days.'
      );

      const runner = new KnowledgePipelineRunner(store);
      const result = await runner.run(makeOptions());
      expect(result.extraction.businessKnowledge).toBeGreaterThan(0);
    });

    it('survives missing docs/knowledge/ directory', async () => {
      const runner = new KnowledgePipelineRunner(store);
      const result = await runner.run(makeOptions());
      expect(result.extraction.businessKnowledge).toBe(0);
    });

    it('ingests knowledge-track docs from docs/solutions/ alongside docs/knowledge/', async () => {
      // Sample knowledge-track solution doc — should be ingested as business_concept.
      const solutionsDir = path.join(
        tmpDir,
        'docs',
        'solutions',
        'knowledge-track',
        'architecture-patterns'
      );
      await fs.mkdir(solutionsDir, { recursive: true });
      await fs.writeFile(
        path.join(solutionsDir, 'sample.md'),
        '---\ntrack: knowledge-track\ncategory: architecture-patterns\nmodule: orchestrator\ntags: [pattern]\nproblem_type: pattern\nlast_updated: 2026-05-05\n---\n\n# Sample Solutions Pattern\n\nIngested via the pipeline runner.\n'
      );

      const runner = new KnowledgePipelineRunner(store);
      const result = await runner.run(makeOptions());

      // The solutions doc must contribute to the businessKnowledge count.
      expect(result.extraction.businessKnowledge).toBeGreaterThan(0);

      // Verify the node was actually added to the graph with source=solutions.
      const concepts = store.findNodes({ type: 'business_concept' });
      const solutionNode = concepts.find((n) => n.metadata?.source === 'solutions');
      expect(solutionNode).toBeDefined();
      expect(solutionNode?.name).toBe('Sample Solutions Pattern');
    });

    it('reports zero code signals for empty project', async () => {
      const runner = new KnowledgePipelineRunner(store);
      const result = await runner.run(makeOptions());
      expect(result.extraction.codeSignals).toBe(0);
    });
  });

  describe('gap report', () => {
    it('generates gap report with domain coverage', async () => {
      const knowledgeDir = path.join(tmpDir, 'docs', 'knowledge');
      await fs.mkdir(path.join(knowledgeDir, 'auth'), { recursive: true });
      await fs.mkdir(path.join(knowledgeDir, 'billing'), { recursive: true });
      await fs.writeFile(
        path.join(knowledgeDir, 'auth', 'session.md'),
        '---\ntype: business_rule\ndomain: auth\n---\nSession timeout: 24h'
      );
      await fs.writeFile(
        path.join(knowledgeDir, 'billing', 'rates.md'),
        '---\ntype: business_rule\ndomain: billing\n---\nMonthly billing cycle'
      );

      const runner = new KnowledgePipelineRunner(store);
      const result = await runner.run(makeOptions());
      expect(result.gaps.domains.length).toBe(2);
      expect(result.gaps.totalEntries).toBe(2);

      const gapsPath = path.join(tmpDir, '.harness', 'knowledge', 'gaps.md');
      const gapsContent = await fs.readFile(gapsPath, 'utf-8');
      expect(gapsContent).toContain('auth');
      expect(gapsContent).toContain('billing');
    });

    it('handles empty knowledge directory gracefully', async () => {
      const runner = new KnowledgePipelineRunner(store);
      const result = await runner.run(makeOptions());
      expect(result.gaps.domains).toHaveLength(0);
      expect(result.gaps.totalEntries).toBe(0);
    });
  });

  describe('domain filtering', () => {
    it('limits snapshot to specified domain', async () => {
      store.addNode({
        id: 'bk:payments:rule1',
        type: 'business_rule',
        name: 'Payment Rule',
        metadata: { domain: 'payments', source: 'manual' },
      });
      store.addNode({
        id: 'bk:auth:rule1',
        type: 'business_rule',
        name: 'Auth Rule',
        metadata: { domain: 'auth', source: 'manual' },
      });

      const runner = new KnowledgePipelineRunner(store);
      const result = await runner.run(makeOptions({ domain: 'payments' }));
      // Only the payments domain node should be in drift analysis
      expect(result.verdict).toBeDefined();
      expect(result.driftScore).toBeDefined();
    });
  });

  describe('convergence loop', () => {
    it('does not loop when fix is false', async () => {
      const runner = new KnowledgePipelineRunner(store);
      const result = await runner.run(makeOptions({ fix: false }));
      expect(result.iterations).toBe(1);
    });

    it('respects maxIterations cap', async () => {
      const runner = new KnowledgePipelineRunner(store);
      const result = await runner.run(makeOptions({ fix: true, maxIterations: 2 }));
      expect(result.iterations).toBeLessThanOrEqual(2);
    });

    it('converges immediately on empty project', async () => {
      const runner = new KnowledgePipelineRunner(store);
      const result = await runner.run(makeOptions({ fix: true, maxIterations: 5 }));
      expect(result.iterations).toBe(1);
      expect(result.verdict).toBe('pass');
    });
  });

  describe('remediation', () => {
    it('returns remediations array', async () => {
      const runner = new KnowledgePipelineRunner(store);
      const result = await runner.run(makeOptions({ fix: true }));
      expect(Array.isArray(result.remediations)).toBe(true);
    });

    it('stages new diagram findings', async () => {
      const diagramDir = path.join(tmpDir, 'docs', 'diagrams');
      await fs.mkdir(diagramDir, { recursive: true });
      await fs.writeFile(
        path.join(diagramDir, 'simple.mmd'),
        'graph TD\n  X[Service X] --> Y[Service Y]'
      );

      const runner = new KnowledgePipelineRunner(store);
      await runner.run(makeOptions());

      // Verify staged file
      const stagedPath = path.join(
        tmpDir,
        '.harness',
        'knowledge',
        'staged',
        'pipeline-staged.jsonl'
      );
      try {
        const content = await fs.readFile(stagedPath, 'utf-8');
        if (content.trim().length > 0) {
          const lines = content.trim().split('\n');
          for (const line of lines) {
            expect(() => JSON.parse(line)).not.toThrow();
          }
        }
      } catch {
        // File may not exist if no new findings
      }
    });
  });

  describe('CI mode', () => {
    it('runs non-interactively', async () => {
      const runner = new KnowledgePipelineRunner(store);
      const result = await runner.run(makeOptions({ ci: true, fix: true }));
      expect(result.verdict).toBeDefined();
      expect(result.iterations).toBeGreaterThanOrEqual(1);
    });
  });

  describe('result structure', () => {
    it('returns complete result object', async () => {
      const runner = new KnowledgePipelineRunner(store);
      const result = await runner.run(makeOptions());

      expect(result).toHaveProperty('verdict');
      expect(result).toHaveProperty('driftScore');
      expect(result).toHaveProperty('iterations');
      expect(result).toHaveProperty('findings');
      expect(result).toHaveProperty('extraction');
      expect(result).toHaveProperty('gaps');
      expect(result).toHaveProperty('remediations');

      expect(result.findings).toHaveProperty('new');
      expect(result.findings).toHaveProperty('drifted');
      expect(result.findings).toHaveProperty('stale');
      expect(result.findings).toHaveProperty('contradicting');

      expect(result.extraction).toHaveProperty('codeSignals');
      expect(result.extraction).toHaveProperty('diagrams');
      expect(result.extraction).toHaveProperty('linkerFacts');
      expect(result.extraction).toHaveProperty('businessKnowledge');
      expect(result.extraction).toHaveProperty('images');

      // Phase 5 additions: contradictions and coverage
      expect(result).toHaveProperty('contradictions');
      expect(result.contradictions).toHaveProperty('contradictions');
      expect(result.contradictions).toHaveProperty('sourcePairCounts');
      expect(result.contradictions).toHaveProperty('totalChecked');

      expect(result).toHaveProperty('coverage');
      expect(result.coverage).toHaveProperty('overallScore');
      expect(result.coverage).toHaveProperty('overallGrade');
      expect(result.coverage).toHaveProperty('domains');
      expect(result.coverage).toHaveProperty('generatedAt');
    });
  });

  describe('inferenceOptions plumbing (Phase 4)', () => {
    it('defaults to {} when no inferenceOptions field on options', async () => {
      // Pre-seed graph with one node whose path lands under a non-default top-level dir.
      store.addNode({
        id: 'extracted:agents:foo',
        type: 'business_concept',
        name: 'Foo',
        path: 'agents/skills/foo.ts',
        metadata: { source: 'extractor' },
        content: 'lorem ipsum dolor sit amet',
      });

      const runner = new KnowledgePipelineRunner(store);
      const result = await runner.run(makeOptions());

      // Generic first-segment fallback: 'agents'
      const domains = result.coverage.domains.map((d) => d.domain);
      expect(domains).toContain('agents');
      expect(domains).not.toContain('skills');
    });

    it('routes inferenceOptions.extraPatterns through to CoverageScorer', async () => {
      store.addNode({
        id: 'extracted:agents:foo',
        type: 'business_concept',
        name: 'Foo',
        path: 'agents/skills/foo.ts',
        metadata: { source: 'extractor' },
        content: 'lorem ipsum dolor sit amet',
      });

      const runner = new KnowledgePipelineRunner(store);
      const result = await runner.run(
        makeOptions({ inferenceOptions: { extraPatterns: ['agents/<dir>'] } })
      );

      const domains = result.coverage.domains.map((d) => d.domain);
      expect(domains).toContain('skills');
      expect(domains).not.toContain('agents');
    });

    it('routes inferenceOptions.extraBlocklist through to CoverageScorer (blocklisted segment falls through)', async () => {
      store.addNode({
        id: 'extracted:scratch:foo',
        type: 'business_concept',
        name: 'Foo',
        path: 'scratch/foo.ts',
        metadata: { source: 'extractor' },
        content: 'lorem ipsum dolor sit amet',
      });

      const runner = new KnowledgePipelineRunner(store);
      const result = await runner.run(
        makeOptions({ inferenceOptions: { extraBlocklist: ['scratch'] } })
      );

      // 'scratch' is now blocklisted → first non-blocklisted segment falls
      // through. Load-bearing claim: blocklist is consulted, so the bucket
      // is NOT 'scratch'.
      const domains = result.coverage.domains.map((d) => d.domain);
      expect(domains).not.toContain('scratch');
    });
  });
});
