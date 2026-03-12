import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
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
  SuggestionReport,
} from './types';
import { buildSnapshot } from './snapshot';
import { detectDocDrift } from './detectors/drift';
import { detectDeadCode } from './detectors/dead-code';
import { detectPatternViolations } from './detectors/patterns';
import { generateSuggestions } from './fixers/suggestions';
import { TypeScriptParser } from '../shared/parsers';

/**
 * Main entropy analysis orchestrator
 */
export class EntropyAnalyzer {
  private config: EntropyConfig;
  private snapshot?: CodebaseSnapshot;
  private report?: EntropyReport;

  constructor(config: EntropyConfig) {
    this.config = {
      ...config,
      parser: config.parser || new TypeScriptParser(),
    };
  }

  /**
   * Run full entropy analysis
   */
  async analyze(): Promise<Result<EntropyReport, EntropyError>> {
    const startTime = Date.now();

    // Build snapshot
    const snapshotResult = await buildSnapshot(this.config);
    if (!snapshotResult.ok) {
      return Err(snapshotResult.error);
    }
    this.snapshot = snapshotResult.value;

    // Run requested analyzers
    let driftReport: DriftReport | undefined;
    let deadCodeReport: DeadCodeReport | undefined;
    let patternReport: PatternReport | undefined;

    // Drift detection
    if (this.config.analyze.drift) {
      const driftConfig = typeof this.config.analyze.drift === 'object'
        ? this.config.analyze.drift
        : {};
      const result = await detectDocDrift(this.snapshot, driftConfig);
      if (result.ok) {
        driftReport = result.value;
      }
    }

    // Dead code detection
    if (this.config.analyze.deadCode) {
      const result = await detectDeadCode(this.snapshot);
      if (result.ok) {
        deadCodeReport = result.value;
      }
    }

    // Pattern detection
    if (this.config.analyze.patterns) {
      const patternConfig: PatternConfig = typeof this.config.analyze.patterns === 'object'
        ? this.config.analyze.patterns
        : { patterns: [] };
      const result = await detectPatternViolations(this.snapshot, patternConfig);
      if (result.ok) {
        patternReport = result.value;
      }
    }

    // Calculate summary
    const driftIssues = driftReport?.drifts.length || 0;
    const deadCodeIssues = (deadCodeReport?.deadExports.length || 0) +
                          (deadCodeReport?.deadFiles.length || 0) +
                          (deadCodeReport?.unusedImports.length || 0);
    const patternIssues = patternReport?.violations.length || 0;
    const patternErrors = patternReport?.stats.errorCount || 0;
    const patternWarnings = patternReport?.stats.warningCount || 0;

    const totalIssues = driftIssues + deadCodeIssues + patternIssues;

    // Calculate fixable count
    const fixableCount = (deadCodeReport?.deadFiles.length || 0) +
                        (deadCodeReport?.unusedImports.length || 0);

    // Generate suggestions count
    const suggestions = generateSuggestions(
      deadCodeReport,
      driftReport,
      patternReport
    );

    const duration = Date.now() - startTime;

    const report: EntropyReport = {
      snapshot: this.snapshot,
      summary: {
        totalIssues,
        errors: patternErrors,
        warnings: patternWarnings + driftIssues,
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
      return { suggestions: [], byPriority: { high: [], medium: [], low: [] }, estimatedEffort: 'trivial' };
    }

    return generateSuggestions(
      this.report.deadCode,
      this.report.drift,
      this.report.patterns
    );
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
   * Run drift detection only (snapshot must be built first)
   */
  async detectDrift(config?: Partial<DriftConfig>): Promise<Result<DriftReport, EntropyError>> {
    if (!this.snapshot) {
      const snapshotResult = await this.buildSnapshot();
      if (!snapshotResult.ok) {
        return Err(snapshotResult.error);
      }
    }
    return detectDocDrift(this.snapshot!, config || {});
  }

  /**
   * Run dead code detection only (snapshot must be built first)
   */
  async detectDeadCode(): Promise<Result<DeadCodeReport, EntropyError>> {
    if (!this.snapshot) {
      const snapshotResult = await this.buildSnapshot();
      if (!snapshotResult.ok) {
        return Err(snapshotResult.error);
      }
    }
    return detectDeadCode(this.snapshot!);
  }

  /**
   * Run pattern detection only (snapshot must be built first)
   */
  async detectPatterns(config: PatternConfig): Promise<Result<PatternReport, EntropyError>> {
    if (!this.snapshot) {
      const snapshotResult = await this.buildSnapshot();
      if (!snapshotResult.ok) {
        return Err(snapshotResult.error);
      }
    }
    return detectPatternViolations(this.snapshot!, config);
  }
}
