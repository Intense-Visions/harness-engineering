/**
 * KnowledgePipelineRunner — 4-phase convergence loop for knowledge extraction,
 * reconciliation, drift detection, and remediation.
 *
 * Phases:
 * 1. EXTRACT — Run code signal extractors, diagram parsers, image analysis, business knowledge ingestor, linker
 * 2. RECONCILE — Compare pre-extraction graph snapshot against post-extraction snapshot + cross-source contradiction detection
 * 3. DETECT — Classify findings by severity, generate gap report + coverage scoring
 * 4. REMEDIATE — Apply safe fixes, converge (only with `fix: true`)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GraphStore } from '../store/GraphStore.js';
import type { IngestResult, NodeType } from '../types.js';
import { BusinessKnowledgeIngestor } from './BusinessKnowledgeIngestor.js';
import { DiagramParser } from './DiagramParser.js';
import { KnowledgeLinker } from './KnowledgeLinker.js';
import {
  StructuralDriftDetector,
  type KnowledgeSnapshot,
  type KnowledgeSnapshotEntry,
  type DriftResult,
  type DriftFinding,
} from './StructuralDriftDetector.js';
import {
  KnowledgeStagingAggregator,
  type GapReport,
  type StagedEntry,
} from './KnowledgeStagingAggregator.js';
import { createExtractionRunner } from './extractors/index.js';
import { ImageAnalysisExtractor, type AnalysisProvider } from './ImageAnalysisExtractor.js';
import { ContradictionDetector, type ContradictionResult } from './ContradictionDetector.js';
import { CoverageScorer, type CoverageReport } from './CoverageScorer.js';

const BUSINESS_NODE_TYPES: readonly NodeType[] = [
  'business_concept',
  'business_rule',
  'business_process',
  'business_term',
  'business_metric',
  'business_fact',
];

/** Node types included in snapshot for drift detection (Phase 5 adds design + image types). */
const SNAPSHOT_NODE_TYPES: readonly NodeType[] = [
  ...BUSINESS_NODE_TYPES,
  'design_token',
  'design_constraint',
  'aesthetic_intent',
  'image_annotation',
];

// ─── Public Types ───────────────────────────────────────────────────────────

export interface KnowledgePipelineOptions {
  readonly projectDir: string;
  readonly fix: boolean;
  readonly ci: boolean;
  readonly domain?: string;
  readonly graphDir?: string;
  readonly maxIterations?: number;
  readonly analyzeImages?: boolean;
  readonly analysisProvider?: AnalysisProvider;
  readonly imagePaths?: readonly string[];
}

export interface ExtractionCounts {
  readonly codeSignals: number;
  readonly diagrams: number;
  readonly linkerFacts: number;
  readonly businessKnowledge: number;
  readonly images: number;
}

export interface KnowledgePipelineResult {
  readonly verdict: 'pass' | 'warn' | 'fail';
  readonly driftScore: number;
  readonly iterations: number;
  readonly findings: DriftResult['summary'];
  readonly extraction: ExtractionCounts;
  readonly gaps: GapReport;
  readonly remediations: readonly string[];
  readonly contradictions: ContradictionResult;
  readonly coverage: CoverageReport;
}

// ─── Implementation ─────────────────────────────────────────────────────────

export class KnowledgePipelineRunner {
  constructor(private readonly store: GraphStore) {}

  async run(options: KnowledgePipelineOptions): Promise<KnowledgePipelineResult> {
    const remediations: string[] = [];

    // Phases 1-3: Extract, Reconcile, Detect
    const extraction = await this.extract(options);
    let driftResult = this.runReconciliation(options);
    const contradictions = new ContradictionDetector().detect(this.store);
    let gapReport = await this.detect(options);
    const coverage = new CoverageScorer().score(this.store);

    // Phase 4: Remediate (convergence loop)
    const iterations = options.fix
      ? await this.runRemediationLoop(options, driftResult, gapReport, remediations)
      : 1;

    // Re-read final state after remediation loop may have mutated driftResult/gapReport
    if (options.fix && iterations > 1) {
      driftResult = this.runReconciliation(options);
      gapReport = await this.detect(options);
    }

    await this.stageNewFindings(driftResult, options);

    return this.buildResult(
      driftResult,
      iterations,
      extraction,
      gapReport,
      remediations,
      contradictions,
      coverage
    );
  }

  /** Run phases 1-2 (extract snapshot, reconcile) and return drift result. */
  private runReconciliation(options: KnowledgePipelineOptions): DriftResult {
    const preSnapshot = this.buildSnapshot(options.domain);
    const postSnapshot = this.buildSnapshot(options.domain);
    return this.reconcile(preSnapshot, postSnapshot);
  }

  /** Run the remediation convergence loop; returns total iteration count. */
  private async runRemediationLoop(
    options: KnowledgePipelineOptions,
    driftResult: DriftResult,
    _gapReport: GapReport,
    remediations: string[]
  ): Promise<number> {
    const maxIterations = options.maxIterations ?? 5;
    let iterations = 1;
    let currentDrift = driftResult;
    let previousFindingCount = currentDrift.findings.length;

    while (iterations < maxIterations) {
      if (currentDrift.findings.length === 0) break;

      this.remediate(currentDrift, remediations, options);

      await this.extract(options);
      currentDrift = this.runReconciliation(options);
      await this.detect(options);

      iterations++;
      if (currentDrift.findings.length >= previousFindingCount) break;
      previousFindingCount = currentDrift.findings.length;
    }

    return iterations;
  }

  /** Assemble the final pipeline result. */
  private buildResult(
    driftResult: DriftResult,
    iterations: number,
    extraction: ExtractionCounts,
    gaps: GapReport,
    remediations: readonly string[],
    contradictions: ContradictionResult,
    coverage: CoverageReport
  ): KnowledgePipelineResult {
    return {
      verdict: this.computeVerdict(driftResult),
      driftScore: driftResult.driftScore,
      iterations,
      findings: driftResult.summary,
      extraction,
      gaps,
      remediations,
      contradictions,
      coverage,
    };
  }

  // ── Phase 1: EXTRACT ──────────────────────────────────────────────────────

  private async extract(options: KnowledgePipelineOptions): Promise<ExtractionCounts> {
    const extractedDir = path.join(options.projectDir, '.harness', 'knowledge', 'extracted');
    await fs.mkdir(extractedDir, { recursive: true });

    // Code signal extractors
    const runner = createExtractionRunner();
    const extractionResult = await runner.run(options.projectDir, this.store, extractedDir);

    // Diagram parsers
    const diagramParser = new DiagramParser(this.store);
    const diagramResult = await diagramParser.ingest(options.projectDir);

    // Image analysis (when enabled, provider supplied, and paths non-empty)
    let imageCount = 0;
    const imagePaths = options.imagePaths ?? [];
    if (options.analyzeImages && options.analysisProvider && imagePaths.length > 0) {
      const imageExtractor = new ImageAnalysisExtractor({
        analysisProvider: options.analysisProvider,
      });
      const imageResult = await imageExtractor.analyze(this.store, imagePaths);
      imageCount = imageResult.nodesAdded;
    }

    // Business knowledge from docs/knowledge/
    const knowledgeDir = path.join(options.projectDir, 'docs', 'knowledge');
    const bkIngestor = new BusinessKnowledgeIngestor(this.store);
    let bkResult: IngestResult;
    try {
      bkResult = await bkIngestor.ingest(knowledgeDir);
    } catch {
      bkResult = {
        nodesAdded: 0,
        nodesUpdated: 0,
        edgesAdded: 0,
        edgesUpdated: 0,
        errors: [],
        durationMs: 0,
      };
    }

    // Knowledge linker (scans connector-ingested nodes for business signals)
    const linker = new KnowledgeLinker(this.store, extractedDir);
    const linkResult = await linker.link();

    return {
      codeSignals: extractionResult.nodesAdded,
      diagrams: diagramResult.nodesAdded,
      linkerFacts: linkResult.factsCreated,
      businessKnowledge: bkResult.nodesAdded,
      images: imageCount,
    };
  }

  // ── Phase 2: RECONCILE ────────────────────────────────────────────────────

  private buildSnapshot(domain?: string): KnowledgeSnapshot {
    let nodes = SNAPSHOT_NODE_TYPES.flatMap((type) => this.store.findNodes({ type }));

    if (domain) {
      nodes = nodes.filter((n) => (n.metadata?.domain as string) === domain);
    }

    return {
      entries: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        contentHash: n.hash ?? n.id,
        source: (n.metadata?.source as string) ?? 'unknown',
        name: n.name,
      })),
      timestamp: new Date().toISOString(),
    };
  }

  private reconcile(current: KnowledgeSnapshot, fresh: KnowledgeSnapshot): DriftResult {
    const detector = new StructuralDriftDetector();
    return detector.detect(current, fresh);
  }

  // ── Phase 3: DETECT ───────────────────────────────────────────────────────

  private async detect(options: KnowledgePipelineOptions): Promise<GapReport> {
    const knowledgeDir = path.join(options.projectDir, 'docs', 'knowledge');
    const aggregator = new KnowledgeStagingAggregator(options.projectDir);
    const gapReport = await aggregator.generateGapReport(knowledgeDir);
    await aggregator.writeGapReport(gapReport);
    return gapReport;
  }

  // ── Phase 4: REMEDIATE ────────────────────────────────────────────────────

  private remediate(
    driftResult: DriftResult,
    remediations: string[],
    options: KnowledgePipelineOptions
  ): void {
    for (const finding of driftResult.findings) {
      switch (finding.classification) {
        case 'stale':
          // Auto-remove stale nodes (source is gone)
          this.store.removeNode(finding.entryId);
          remediations.push(`removed stale: ${finding.entryId}`);
          break;
        case 'new':
          // Staged separately via stageNewFindings after convergence
          break;
        case 'drifted':
          // CI mode: skip (report only). Interactive: flag for user.
          if (!options.ci) {
            remediations.push(`flagged drifted: ${finding.entryId}`);
          }
          break;
        case 'contradicting':
          // Never auto-resolve — Iron Law
          break;
      }
    }
  }

  private async stageNewFindings(
    driftResult: DriftResult,
    options: KnowledgePipelineOptions
  ): Promise<void> {
    const newFindings = driftResult.findings.filter((f) => f.classification === 'new');
    if (newFindings.length === 0) return;

    const stagedEntries: StagedEntry[] = newFindings
      .filter((f): f is DriftFinding & { fresh: KnowledgeSnapshotEntry } => f.fresh != null)
      .map((f) => ({
        id: f.fresh.id,
        source: this.classifySource(f.fresh.source),
        nodeType: f.fresh.type,
        name: f.fresh.name,
        confidence: 0.7,
        contentHash: f.fresh.contentHash,
        timestamp: new Date().toISOString(),
      }));

    if (stagedEntries.length > 0) {
      const aggregator = new KnowledgeStagingAggregator(options.projectDir);
      await aggregator.aggregate(stagedEntries, [], []);
    }
  }

  private classifySource(source: string): 'extractor' | 'linker' | 'diagram' {
    if (source === 'linker' || source === 'knowledge-linker') return 'linker';
    if (source === 'diagram') return 'diagram';
    return 'extractor';
  }

  // ── Verdict ───────────────────────────────────────────────────────────────

  private computeVerdict(driftResult: DriftResult): 'pass' | 'warn' | 'fail' {
    const { summary } = driftResult;
    const unresolved = summary.drifted + summary.stale + summary.contradicting;

    if (unresolved === 0 && summary.new === 0) return 'pass';
    if (unresolved === 0) return 'warn';
    return 'fail';
  }
}
