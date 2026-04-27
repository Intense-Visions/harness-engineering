import * as path from 'node:path';
import type { Issue, ConcernSignal } from '@harness-engineering/types';
import type {
  EnrichedSpec,
  SimulationResult,
  ComplexityScore,
  WeightedRecommendation,
} from '@harness-engineering/intelligence';
import { weightedRecommendPersona } from '@harness-engineering/intelligence';
import {
  GitHubIssuesSyncAdapter,
  loadTrackerSyncConfig,
  type TrackerSyncAdapter,
} from '@harness-engineering/core';
import { resolveEscalationConfig } from '../core/state-machine';
import { detectScopeTier, artifactPresenceFromIssue } from '../core/model-router';
import type { AnalysisRecord } from '../core/analysis-archive';
import { renderAnalysisComment } from '../core/analysis-comment';
import { loadPublishedIndex, savePublishedIndex } from '../core/published-index';
import type { OrchestratorContext } from '../types/orchestrator-context';

const CONNECTION_ERROR_PATTERNS = [
  'Connection error',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'fetch failed',
];

function isConnectionError(err: unknown): boolean {
  const msg = String(err);
  return CONNECTION_ERROR_PATTERNS.some((p) => msg.includes(p));
}

export type TickActivityCallback = (
  phase: 'idle' | 'fetching' | 'analyzing' | 'dispatching',
  detail?: string,
  progress?: { current: number; total: number }
) => void;

/**
 * Encapsulates the intelligence pipeline analysis loop: enrichment, complexity
 * scoring, PESL simulation, archiving, and auto-publishing.
 *
 * Extracted from the Orchestrator class to reduce file size and isolate the
 * intelligence subsystem's concerns.
 */
export class IntelligencePipelineRunner {
  private ctx: OrchestratorContext;
  private graphLoaded = false;

  constructor(ctx: OrchestratorContext) {
    this.ctx = ctx;
  }

  /**
   * Loads the graph store and hydrates the enriched spec cache from the analysis
   * archive on the first call. Subsequent calls are no-ops. All failures are
   * non-fatal — empty graph / empty cache are valid fallbacks.
   */
  async loadPersistedData(): Promise<void> {
    if (!this.ctx.pipeline || !this.ctx.graphStore || this.graphLoaded) return;
    this.graphLoaded = true;

    await this.loadGraphStore();
    await this.hydrateSpecCache();
  }

  /**
   * Runs the full intelligence pipeline for the given candidates:
   * enrichment, complexity scoring, PESL simulation, archiving, and auto-publishing.
   */
  async run(
    candidates: Issue[],
    setTickActivity: TickActivityCallback
  ): Promise<{
    concernSignals: Map<string, ConcernSignal[]>;
    enrichedSpecs: Map<string, EnrichedSpec>;
    complexityScores: Map<string, ComplexityScore>;
    simulationResults: Map<string, SimulationResult>;
    personaRecommendations: Map<string, WeightedRecommendation[]>;
  }> {
    const concernSignals = new Map<string, ConcernSignal[]>();
    const enrichedSpecs = new Map<string, EnrichedSpec>();
    const complexityScores = new Map<string, ComplexityScore>();

    // Seed with previously-cached specs so routing still has enrichment context
    for (const [id, spec] of this.ctx.enrichedSpecsByIssue) {
      enrichedSpecs.set(id, spec);
    }
    const escalationConfig = resolveEscalationConfig(this.ctx.config);
    const failureTtl = this.ctx.config.intelligence?.failureCacheTtlMs ?? 300_000;
    const nowForCache = Date.now();

    this.evictExpiredFailures(nowForCache, failureTtl);

    const eligibleCandidates = this.filterEligibleForAnalysis(candidates, escalationConfig);
    const circuitBreakerThreshold = this.ctx.config.intelligence?.circuitBreakerThreshold ?? 2;

    await this.analyzeCandidates(
      eligibleCandidates,
      escalationConfig,
      nowForCache,
      failureTtl,
      circuitBreakerThreshold,
      concernSignals,
      enrichedSpecs,
      complexityScores,
      setTickActivity
    );

    setTickActivity('analyzing', 'PESL: Running simulations');
    const simulationResults = await this.runPeslSimulations(
      candidates,
      enrichedSpecs,
      complexityScores
    );

    setTickActivity('analyzing', 'Archiving analysis results');
    await this.archiveAnalysisResults(
      candidates,
      enrichedSpecs,
      complexityScores,
      simulationResults
    );

    // Auto-publish to external tracker (non-fatal)
    try {
      setTickActivity('analyzing', 'Publishing to tracker');
      await this.autoPublishAnalyses(
        candidates,
        enrichedSpecs,
        complexityScores,
        simulationResults
      );
    } catch (err) {
      this.ctx.logger.warn('Auto-publish analyses failed', { error: String(err) });
    }

    // Persona scoring via specialization (non-fatal)
    setTickActivity('analyzing', 'Scoring persona recommendations');
    const personaRecommendations = this.computePersonaRecommendations(candidates);

    return {
      concernSignals,
      enrichedSpecs,
      complexityScores,
      simulationResults,
      personaRecommendations,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async loadGraphStore(): Promise<void> {
    try {
      const graphDir = path.join(this.ctx.config.workspace.root, '..', 'graph');
      const loaded = await this.ctx.graphStore!.load(graphDir);
      if (loaded) {
        this.ctx.logger.info('Graph store loaded from disk');
      } else {
        this.ctx.logger.info('No persisted graph data found, starting with empty graph');
      }
    } catch (err) {
      this.ctx.logger.warn('Failed to load graph store, starting with empty graph', {
        error: String(err),
      });
    }
  }

  private async hydrateSpecCache(): Promise<void> {
    try {
      const archived = await this.ctx.analysisArchive.list();
      for (const record of archived) {
        if (record.spec && !this.ctx.enrichedSpecsByIssue.has(record.issueId)) {
          this.ctx.enrichedSpecsByIssue.set(record.issueId, record.spec);
        }
      }
      if (archived.length > 0) {
        this.ctx.logger.info(
          `Loaded ${this.ctx.enrichedSpecsByIssue.size} cached analyses from archive`
        );
      }
    } catch (err) {
      this.ctx.logger.warn('Failed to load analysis archive, will re-analyze on demand', {
        error: String(err),
      });
    }
  }

  private async runPeslSimulations(
    candidates: Issue[],
    enrichedSpecs: Map<string, EnrichedSpec>,
    complexityScores: Map<string, ComplexityScore>
  ): Promise<Map<string, SimulationResult>> {
    if (!this.ctx.pipeline) return new Map();
    const results = new Map<string, SimulationResult>();
    for (const issue of candidates) {
      const spec = enrichedSpecs.get(issue.id);
      const score = complexityScores.get(issue.id);
      if (!spec || !score) continue;

      const scopeTier = detectScopeTier(issue, artifactPresenceFromIssue(issue));
      try {
        const simResult = await this.ctx.pipeline.simulate(spec, score, scopeTier);
        results.set(issue.id, simResult);
      } catch (err) {
        this.ctx.logger.error(`PESL simulation failed for ${issue.identifier}`, {
          issueId: issue.id,
          error: String(err),
        });
        // Simulation failure is non-fatal — issue proceeds without simulation
      }
    }
    return results;
  }

  private async archiveAnalysisResults(
    candidates: Issue[],
    enrichedSpecs: Map<string, EnrichedSpec>,
    complexityScores: Map<string, ComplexityScore>,
    simulationResults: Map<string, SimulationResult>
  ): Promise<void> {
    for (const issue of candidates) {
      await this.archiveSingleAnalysis(issue, enrichedSpecs, complexityScores, simulationResults);
    }
  }

  private async archiveSingleAnalysis(
    issue: Issue,
    enrichedSpecs: Map<string, EnrichedSpec>,
    complexityScores: Map<string, ComplexityScore>,
    simulationResults: Map<string, SimulationResult>
  ): Promise<void> {
    const spec = enrichedSpecs.get(issue.id) ?? null;
    const score = complexityScores.get(issue.id) ?? null;
    const simulation = simulationResults.get(issue.id) ?? null;
    if (!spec && !score && !simulation) return;
    try {
      await this.ctx.analysisArchive.save({
        issueId: issue.id,
        identifier: issue.identifier,
        spec,
        score,
        simulation,
        analyzedAt: new Date().toISOString(),
        externalId: issue.externalId ?? null,
      });
    } catch (err) {
      this.ctx.logger.warn(`Failed to archive analysis for ${issue.identifier}`, {
        issueId: issue.id,
        error: String(err),
      });
    }
  }

  private async autoPublishAnalyses(
    candidates: Issue[],
    enrichedSpecs: Map<string, EnrichedSpec>,
    complexityScores: Map<string, ComplexityScore>,
    simulationResults: Map<string, SimulationResult>
  ): Promise<void> {
    const trackerConfig = loadTrackerSyncConfig(this.ctx.projectRoot);
    if (!trackerConfig) return;

    const token = process.env.GITHUB_TOKEN;
    if (!token) return;

    let adapter: TrackerSyncAdapter;
    try {
      adapter = new GitHubIssuesSyncAdapter({ token, config: trackerConfig });
    } catch (err) {
      this.ctx.logger.warn('Failed to create tracker adapter for auto-publish', {
        error: String(err),
      });
      return;
    }

    const publishedIndex = loadPublishedIndex(this.ctx.projectRoot);
    let publishedCount = 0;

    for (const issue of candidates) {
      const published = await this.publishAnalysisForIssue(
        issue,
        enrichedSpecs,
        complexityScores,
        simulationResults,
        publishedIndex,
        adapter
      );
      if (published) publishedCount++;
    }

    if (publishedCount > 0) {
      try {
        savePublishedIndex(this.ctx.projectRoot, publishedIndex);
      } catch (err) {
        this.ctx.logger.warn('Failed to persist published index after auto-publish', {
          error: String(err),
        });
      }
    }
  }

  private async publishAnalysisForIssue(
    issue: Issue,
    enrichedSpecs: Map<string, EnrichedSpec>,
    complexityScores: Map<string, ComplexityScore>,
    simulationResults: Map<string, SimulationResult>,
    publishedIndex: Record<string, string>,
    adapter: TrackerSyncAdapter
  ): Promise<boolean> {
    const spec = enrichedSpecs.get(issue.id) ?? null;
    const score = complexityScores.get(issue.id) ?? null;
    const simulation = simulationResults.get(issue.id) ?? null;
    if (!spec && !score && !simulation) return false;

    const externalId = issue.externalId ?? null;
    if (!externalId) return false;
    if (publishedIndex[issue.id]) return false;

    const record: AnalysisRecord = {
      issueId: issue.id,
      identifier: issue.identifier,
      spec,
      score,
      simulation,
      analyzedAt: new Date().toISOString(),
      externalId,
    };

    try {
      const commentBody = renderAnalysisComment(record);
      const result = await adapter.addComment(externalId, commentBody);
      if (result.ok) {
        publishedIndex[issue.id] = new Date().toISOString();
        this.ctx.logger.info(`Auto-published analysis for ${issue.identifier} to ${externalId}`);
        return true;
      }
      this.ctx.logger.warn(`Auto-publish failed for ${issue.identifier}: ${result.error.message}`, {
        issueId: issue.id,
      });
    } catch (err) {
      this.ctx.logger.warn(`Auto-publish error for ${issue.identifier}`, {
        issueId: issue.id,
        error: String(err),
      });
    }
    return false;
  }

  private async analyzeCandidate(
    issue: Issue,
    escalationConfig: ReturnType<typeof resolveEscalationConfig>,
    nowForCache: number,
    failureTtl: number,
    consecutiveConnectionErrors: number,
    circuitBreakerThreshold: number,
    concernSignals: Map<string, ConcernSignal[]>,
    enrichedSpecs: Map<string, EnrichedSpec>,
    complexityScores: Map<string, ComplexityScore>
  ): Promise<{
    consecutiveConnectionErrors: number;
    circuitBroken: boolean;
    breakError: string | null;
  }> {
    const scopeTier = detectScopeTier(issue, artifactPresenceFromIssue(issue));
    try {
      const result = await this.ctx.pipeline!.preprocessIssue(issue, scopeTier, escalationConfig);
      if (result.signals.length > 0) concernSignals.set(issue.id, result.signals);
      if (result.spec) {
        enrichedSpecs.set(issue.id, result.spec);
        this.ctx.enrichedSpecsByIssue.set(issue.id, result.spec);
      }
      if (result.score) complexityScores.set(issue.id, result.score);
      return { consecutiveConnectionErrors: 0, circuitBroken: false, breakError: null };
    } catch (err) {
      this.ctx.analysisFailureCache.set(issue.id, nowForCache);

      if (isConnectionError(err)) {
        const newCount = consecutiveConnectionErrors + 1;
        if (newCount >= circuitBreakerThreshold) {
          return {
            consecutiveConnectionErrors: newCount,
            circuitBroken: true,
            breakError: String(err),
          };
        }
        this.ctx.logger.error(
          `Intelligence pipeline failed for ${issue.identifier}, cached for ${failureTtl}ms`,
          { issueId: issue.id, error: String(err) }
        );
        return { consecutiveConnectionErrors: newCount, circuitBroken: false, breakError: null };
      }

      this.ctx.logger.error(
        `Intelligence pipeline failed for ${issue.identifier}, cached for ${failureTtl}ms`,
        { issueId: issue.id, error: String(err) }
      );
      return { consecutiveConnectionErrors, circuitBroken: false, breakError: null };
    }
  }

  private evictExpiredFailures(nowForCache: number, failureTtl: number): void {
    for (const [id, failedAt] of this.ctx.analysisFailureCache) {
      if (nowForCache - failedAt >= failureTtl) {
        this.ctx.analysisFailureCache.delete(id);
      }
    }
  }

  private filterEligibleForAnalysis(
    candidates: Issue[],
    escalationConfig: ReturnType<typeof resolveEscalationConfig>
  ): Issue[] {
    return candidates.filter((issue) => {
      const scopeTier = detectScopeTier(issue, artifactPresenceFromIssue(issue));
      if (escalationConfig.autoExecute.includes(scopeTier)) return false;
      if (this.ctx.analysisFailureCache.has(issue.id)) return false;
      if (this.ctx.enrichedSpecsByIssue.has(issue.id)) return false;
      return true;
    });
  }

  /**
   * Compute persona recommendations for each candidate using the specialization
   * scorer. Extracts system node IDs from issue labels prefixed with `system:`
   * or `module:`. Failures are non-fatal — returns an empty map on error.
   */
  private computePersonaRecommendations(
    candidates: Issue[]
  ): Map<string, WeightedRecommendation[]> {
    const results = new Map<string, WeightedRecommendation[]>();
    if (!this.ctx.graphStore) return results;

    try {
      for (const issue of candidates) {
        const systemNodeIds = issue.labels
          .filter((l) => l.startsWith('system:') || l.startsWith('module:'))
          .map((l) => l.split(':')[1]!)
          .filter((id) => id.length > 0);

        if (systemNodeIds.length === 0) continue;

        const recs = weightedRecommendPersona(this.ctx.graphStore, { systemNodeIds });
        if (recs.length > 0) {
          results.set(issue.id, recs);
        }
      }
    } catch (err) {
      this.ctx.logger.warn('Persona recommendation scoring failed', {
        error: String(err),
      });
    }

    return results;
  }

  private async analyzeCandidates(
    eligibleCandidates: Issue[],
    escalationConfig: ReturnType<typeof resolveEscalationConfig>,
    nowForCache: number,
    failureTtl: number,
    circuitBreakerThreshold: number,
    concernSignals: Map<string, ConcernSignal[]>,
    enrichedSpecs: Map<string, EnrichedSpec>,
    complexityScores: Map<string, ComplexityScore>,
    setTickActivity: TickActivityCallback
  ): Promise<void> {
    let processed = 0;
    let consecutiveConnErrors = 0;
    for (const issue of eligibleCandidates) {
      processed++;
      setTickActivity('analyzing', `SEL/CML: ${issue.identifier} — ${issue.title}`, {
        current: processed,
        total: eligibleCandidates.length,
      });

      const loopResult = await this.analyzeCandidate(
        issue,
        escalationConfig,
        nowForCache,
        failureTtl,
        consecutiveConnErrors,
        circuitBreakerThreshold,
        concernSignals,
        enrichedSpecs,
        complexityScores
      );
      consecutiveConnErrors = loopResult.consecutiveConnectionErrors;

      if (loopResult.circuitBroken) {
        for (const skipped of eligibleCandidates.slice(processed)) {
          this.ctx.analysisFailureCache.set(skipped.id, nowForCache);
        }
        this.ctx.logger.warn(
          `Intelligence pipeline unreachable, skipping remaining ${eligibleCandidates.length - processed} issues`,
          { error: loopResult.breakError!, cachedForMs: failureTtl }
        );
        break;
      }
    }
  }
}
