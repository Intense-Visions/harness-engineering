import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import { createEntropyError } from '../shared/errors';
import type {
  EntropyError,
  EntropyConfig,
  EntropyReport,
  CodebaseSnapshot,
  DriftConfig,
  DriftReport,
  DeadCodeReport,
  PatternReport,
  PatternConfig,
  ComplexityReport,
  CouplingReport,
  SizeBudgetReport,
  DuplicationReport,
  SuggestionReport,
  AnalysisError,
} from './types';
import { buildSnapshot } from './snapshot';
import { detectDocDrift } from './detectors/drift';
import { detectDeadCode } from './detectors/dead-code';
import { detectPatternViolations } from './detectors/patterns';
import { detectComplexityViolations } from './detectors/complexity';
import { detectCouplingViolations } from './detectors/coupling';
import { detectSizeBudgetViolations } from './detectors/size-budget';
import { detectDuplication } from './detectors/duplication';
import { generateSuggestions } from './fixers/suggestions';
/**
 * Main entropy analysis orchestrator
 */
export class EntropyAnalyzer {
  private config: EntropyConfig;
  private snapshot?: CodebaseSnapshot;
  private report?: EntropyReport;

  constructor(config: EntropyConfig) {
    // Leave `parser` undefined when the caller doesn't supply one so that
    // buildSnapshot dispatches per file via the default multi-language registry.
    // Callers that want single-parser semantics can still pass `parser` explicitly.
    this.config = { ...config };
  }

  /**
   * Run full entropy analysis.
   * When graphOptions is provided, passes graph data to drift and dead code detectors
   * for graph-enhanced analysis instead of snapshot-based analysis.
   */
  async analyze(graphOptions?: {
    graphDriftData?: {
      staleEdges: Array<{ docNodeId: string; codeNodeId: string; edgeType: string }>;
      missingTargets: string[];
    };
    graphDeadCodeData?: {
      reachableNodeIds: Set<string> | string[];
      unreachableNodes: Array<{ id: string; type: string; name: string; path?: string }>;
    };
    graphComplexityData?: {
      hotspots: Array<{ file: string; function: string; hotspotScore: number }>;
      percentile95Score: number;
    };
    graphCouplingData?: {
      files: Array<{
        file: string;
        fanIn: number;
        fanOut: number;
        couplingRatio: number;
        transitiveDepth: number;
      }>;
    };
  }): Promise<Result<EntropyReport, EntropyError>> {
    const startTime = Date.now();

    // Only build snapshot if we need it (no graph data for some/all detectors)
    const needsSnapshot =
      !graphOptions || !graphOptions.graphDriftData || !graphOptions.graphDeadCodeData;
    if (needsSnapshot) {
      const snapshotResult = await buildSnapshot(this.config);
      if (!snapshotResult.ok) {
        return Err(snapshotResult.error);
      }
      this.snapshot = snapshotResult.value;
    } else {
      // Provide a minimal empty snapshot for backward compatibility with detector signatures
      this.snapshot = {
        files: [],
        dependencyGraph: { nodes: [], edges: [] },
        exportMap: { byFile: new Map(), byName: new Map() },
        docs: [],
        codeReferences: [],
        entryPoints: [],
        rootDir: this.config.rootDir,
        config: this.config,
        buildTime: 0,
      };
    }

    // Run requested analyzers
    let driftReport: DriftReport | undefined;
    let deadCodeReport: DeadCodeReport | undefined;
    let patternReport: PatternReport | undefined;
    const analysisErrors: AnalysisError[] = [];

    // Drift detection
    if (this.config.analyze.drift) {
      const driftConfig =
        typeof this.config.analyze.drift === 'object' ? this.config.analyze.drift : {};
      const result = await detectDocDrift(this.snapshot, driftConfig, graphOptions?.graphDriftData);
      if (result.ok) {
        driftReport = result.value;
      } else {
        analysisErrors.push({ analyzer: 'drift', error: result.error });
      }
    }

    // Dead code detection
    if (this.config.analyze.deadCode) {
      const result = await detectDeadCode(
        this.snapshot,
        graphOptions?.graphDeadCodeData,
        this.config.protectedRegions
      );
      if (result.ok) {
        deadCodeReport = result.value;
      } else {
        analysisErrors.push({ analyzer: 'deadCode', error: result.error });
      }
    }

    // Pattern detection
    if (this.config.analyze.patterns) {
      const patternConfig: PatternConfig =
        typeof this.config.analyze.patterns === 'object'
          ? this.config.analyze.patterns
          : { patterns: [] };
      const result = await detectPatternViolations(this.snapshot, patternConfig);
      if (result.ok) {
        patternReport = result.value;
      } else {
        analysisErrors.push({ analyzer: 'patterns', error: result.error });
      }
    }

    // Complexity detection
    let complexityReport: ComplexityReport | undefined;
    if (this.config.analyze.complexity) {
      const complexityConfig =
        typeof this.config.analyze.complexity === 'object' ? this.config.analyze.complexity : {};
      const result = await detectComplexityViolations(
        this.snapshot,
        complexityConfig,
        graphOptions?.graphComplexityData
      );
      if (result.ok) {
        complexityReport = result.value;
      } else {
        analysisErrors.push({ analyzer: 'complexity', error: result.error });
      }
    }

    // Coupling detection
    let couplingReport: CouplingReport | undefined;
    if (this.config.analyze.coupling) {
      const couplingConfig =
        typeof this.config.analyze.coupling === 'object' ? this.config.analyze.coupling : {};
      const result = await detectCouplingViolations(
        this.snapshot,
        couplingConfig,
        graphOptions?.graphCouplingData
      );
      if (result.ok) {
        couplingReport = result.value;
      } else {
        analysisErrors.push({ analyzer: 'coupling', error: result.error });
      }
    }

    // Size budget detection
    let sizeBudgetReport: SizeBudgetReport | undefined;
    if (this.config.analyze.sizeBudget) {
      const sizeBudgetConfig =
        typeof this.config.analyze.sizeBudget === 'object' ? this.config.analyze.sizeBudget : {};
      const result = await detectSizeBudgetViolations(this.config.rootDir, sizeBudgetConfig);
      if (result.ok) {
        sizeBudgetReport = result.value;
      } else {
        analysisErrors.push({ analyzer: 'sizeBudget', error: result.error });
      }
    }

    // Duplication detection
    let duplicationReport: DuplicationReport | undefined;
    if (this.config.analyze.duplication && !needsSnapshot) {
      // The snapshot was BYPASSED, not built: the graph-fed branch above
      // replaced it with a minimal one carrying `files: []`. Duplication
      // discovers through `snapshot.files` (spec decision D7 — it re-parses
      // those paths itself for estree tokens) and has no graph-fed path, so
      // calling it here would map an empty list straight into its
      // zero-discovery refusal: a guard for BROKEN discovery, reporting
      // "check that EntropyConfig.include matches real source paths" when the
      // include is fine and the snapshot was skipped on purpose.
      //
      // So: do not run it, leave `EntropyReport.duplication` undefined (the
      // honest "not run" signal), and record WHY with a reason of its own.
      //
      // Noted rather than fixed: the other snapshot-fed detectors (patterns,
      // complexity, coupling, sizeBudget) still run over the empty snapshot in
      // this mode and report vacuously clean. That is pre-existing behavior
      // and out of this change's scope; duplication can refuse because it is
      // the only one with an explicit zero-discovery guard to refuse WITH.
      analysisErrors.push({
        analyzer: 'duplication',
        error: createEntropyError(
          'INVALID_CONFIG',
          'Duplication analysis did not run: this run supplied both graph drift and graph dead-code data, so no codebase snapshot was built and the detector has no file list to scan. This is not a discovery failure — EntropyConfig.include was never consulted.',
          { reason: 'snapshot-bypassed' },
          [
            'Supply graph data for at most one of drift / deadCode, so the snapshot is still built',
            'Or analyze duplication in a separate pass, with no graph data, where the snapshot is built from EntropyConfig.include / exclude',
          ]
        ),
      });
    } else if (this.config.analyze.duplication) {
      const duplicationConfig =
        typeof this.config.analyze.duplication === 'object' ? this.config.analyze.duplication : {};
      const result = await detectDuplication(this.snapshot, duplicationConfig);
      if (result.ok) {
        duplicationReport = result.value;
        // A per-file skip is a finding ABOUT the scan, not a failure OF it:
        // the run succeeded with gaps, so each skip is surfaced as an
        // AnalysisError while the report is still published. The detector
        // hands back bare EntropyErrors; the `analyzer` tag is applied here,
        // in the one place that owns `analysisErrors`.
        for (const error of result.value.skipErrors) {
          analysisErrors.push({ analyzer: 'duplication', error });
        }
      } else {
        analysisErrors.push({ analyzer: 'duplication', error: result.error });
      }
    }

    // Calculate summary
    const driftIssues = driftReport?.drifts.length || 0;
    const deadCodeIssues =
      (deadCodeReport?.deadExports.length || 0) +
      (deadCodeReport?.deadFiles.length || 0) +
      (deadCodeReport?.unusedImports.length || 0);
    const patternIssues = patternReport?.violations.length || 0;
    const patternErrors = patternReport?.stats.errorCount || 0;
    const patternWarnings = patternReport?.stats.warningCount || 0;

    const complexityIssues = complexityReport?.violations.length || 0;
    const couplingIssues = couplingReport?.violations.length || 0;
    const sizeBudgetIssues = sizeBudgetReport?.violations.length || 0;
    const complexityErrors = complexityReport?.stats.errorCount || 0;
    const complexityWarnings = complexityReport?.stats.warningCount || 0;
    const couplingWarnings = couplingReport?.stats.warningCount || 0;
    const sizeBudgetWarnings = sizeBudgetReport?.stats.warningCount || 0;
    // Advisory-only (spec decision D4): clone classes are counted in
    // totalIssues so the summary cannot report a clean run over a scan that
    // reported classes, and are added to NEITHER `errors` NOR `warnings`.
    //
    // The DuplicationReport's missing errorCount / warningCount blocks the
    // realistic accident — copying a sibling's
    // `+= report.stats.errorCount` line does not compile — but it does NOT
    // make this impossible, and claiming it did was an overstatement worth
    // correcting here. `stats.violationCount` and `stats.classesReported` are
    // numbers on the same object and compile into either sum fine; adding
    // `violationCount` to `errors` below typechecks clean and fails the D4
    // test in `tests/entropy/analyzer.duplication.test.ts` at runtime
    // (verified). The type and that test are two layers, not one.
    const duplicationIssues = duplicationReport?.stats.classesReported || 0;

    const totalIssues =
      driftIssues +
      deadCodeIssues +
      patternIssues +
      complexityIssues +
      couplingIssues +
      sizeBudgetIssues +
      duplicationIssues;

    // Calculate fixable count
    const fixableCount =
      (deadCodeReport?.deadFiles.length || 0) + (deadCodeReport?.unusedImports.length || 0);

    // Generate suggestions count
    const suggestions = generateSuggestions(deadCodeReport, driftReport, patternReport);

    const duration = Date.now() - startTime;

    const report: EntropyReport = {
      snapshot: this.snapshot,
      analysisErrors,
      summary: {
        totalIssues,
        errors: patternErrors + complexityErrors,
        warnings:
          patternWarnings +
          driftIssues +
          complexityWarnings +
          couplingWarnings +
          sizeBudgetWarnings,
        fixableCount,
        suggestionCount: suggestions.suggestions.length,
      },
      timestamp: new Date().toISOString(),
      duration,
    };

    // Add optional reports only if defined
    if (driftReport) {
      report.drift = driftReport;
    }
    if (deadCodeReport) {
      report.deadCode = deadCodeReport;
    }
    if (patternReport) {
      report.patterns = patternReport;
    }
    if (complexityReport) {
      report.complexity = complexityReport;
    }
    if (couplingReport) {
      report.coupling = couplingReport;
    }
    if (sizeBudgetReport) {
      report.sizeBudget = sizeBudgetReport;
    }
    if (duplicationReport) {
      report.duplication = duplicationReport;
    }

    this.report = report;

    return Ok(report);
  }

  /**
   * Get the built snapshot (must call analyze first)
   */
  getSnapshot(): CodebaseSnapshot | undefined {
    return this.snapshot;
  }

  /**
   * Get the last report (must call analyze first)
   */
  getReport(): EntropyReport | undefined {
    return this.report;
  }

  /**
   * Generate suggestions from the last analysis
   */
  getSuggestions(): SuggestionReport {
    if (!this.report) {
      return {
        suggestions: [],
        byPriority: { high: [], medium: [], low: [] },
        estimatedEffort: 'trivial',
      };
    }

    return generateSuggestions(this.report.deadCode, this.report.drift, this.report.patterns);
  }

  /**
   * Build snapshot without running analysis
   */
  async buildSnapshot(): Promise<Result<CodebaseSnapshot, EntropyError>> {
    const result = await buildSnapshot(this.config);
    if (result.ok) {
      this.snapshot = result.value;
    }
    return result;
  }

  /**
   * Ensure snapshot is built, returning the snapshot or an error
   */
  private async ensureSnapshot(): Promise<Result<CodebaseSnapshot, EntropyError>> {
    if (this.snapshot) {
      return Ok(this.snapshot);
    }
    return this.buildSnapshot();
  }

  /**
   * Run drift detection only (snapshot must be built first)
   */
  async detectDrift(
    config?: Partial<DriftConfig>,
    graphDriftData?: {
      staleEdges: Array<{ docNodeId: string; codeNodeId: string; edgeType: string }>;
      missingTargets: string[];
    }
  ): Promise<Result<DriftReport, EntropyError>> {
    const snapshotResult = await this.ensureSnapshot();
    if (!snapshotResult.ok) {
      return Err(snapshotResult.error);
    }
    return detectDocDrift(snapshotResult.value, config || {}, graphDriftData);
  }

  /**
   * Run dead code detection only (snapshot must be built first)
   */
  async detectDeadCode(graphDeadCodeData?: {
    reachableNodeIds: Set<string> | string[];
    unreachableNodes: Array<{ id: string; type: string; name: string; path?: string }>;
  }): Promise<Result<DeadCodeReport, EntropyError>> {
    const snapshotResult = await this.ensureSnapshot();
    if (!snapshotResult.ok) {
      return Err(snapshotResult.error);
    }
    return detectDeadCode(snapshotResult.value, graphDeadCodeData, this.config.protectedRegions);
  }

  /**
   * Run pattern detection only (snapshot must be built first)
   */
  async detectPatterns(config: PatternConfig): Promise<Result<PatternReport, EntropyError>> {
    const snapshotResult = await this.ensureSnapshot();
    if (!snapshotResult.ok) {
      return Err(snapshotResult.error);
    }
    return detectPatternViolations(snapshotResult.value, config);
  }
}
