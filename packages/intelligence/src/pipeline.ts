import type { Issue, ConcernSignal, EscalationConfig } from '@harness-engineering/types';
import type { ScopeTier } from '@harness-engineering/types';
import type { GraphStore } from '@harness-engineering/graph';
import type { AnalysisProvider } from './analysis-provider/interface.js';
import type { EnrichedSpec, ComplexityScore, SimulationResult } from './types.js';
import { toRawWorkItem } from './adapter.js';
import { enrich } from './sel/enricher.js';
import { GraphValidator } from './sel/graph-validator.js';
import { score as scoreCML } from './cml/scorer.js';
import { scoreToConcernSignals } from './cml/signals.js';
import { PeslSimulator } from './pesl/simulator.js';
import { ExecutionOutcomeConnector } from './outcome/connector.js';
import type { ExecutionOutcome } from './outcome/types.js';
import type { OutcomeIngestResult } from './outcome/connector.js';

/**
 * Result of preprocessing an issue through the intelligence pipeline.
 */
export interface PreprocessResult {
  /** Enriched spec from SEL, or null if SEL was skipped */
  spec: EnrichedSpec | null;
  /** Complexity score from CML, or null if CML was skipped */
  score: ComplexityScore | null;
  /** Concern signals derived from complexity score (empty if CML skipped) */
  signals: ConcernSignal[];
}

/**
 * Composes SEL, CML, and signal conversion into a single pipeline.
 *
 * Tier-based behavior:
 * - `autoExecute` tiers: skip entirely (no LLM cost)
 * - `alwaysHuman` tiers: run SEL for enrichment context, skip CML (routing already decided)
 * - `signalGated` tiers: full pipeline (SEL → CML → signals)
 */
export class IntelligencePipeline {
  private readonly provider: AnalysisProvider;
  private readonly graphValidator: GraphValidator;
  private readonly store: GraphStore;
  private readonly simulator: PeslSimulator;
  private readonly outcomeConnector: ExecutionOutcomeConnector;

  constructor(provider: AnalysisProvider, store: GraphStore, options?: { peslModel?: string }) {
    this.provider = provider;
    this.store = store;
    this.graphValidator = new GraphValidator(store);
    this.simulator = new PeslSimulator(provider, store, {
      ...(options?.peslModel !== undefined && { model: options.peslModel }),
    });
    this.outcomeConnector = new ExecutionOutcomeConnector(store);
  }

  /**
   * Enrich a raw work item into an EnrichedSpec via LLM + graph validation.
   */
  async enrich(item: import('./types.js').RawWorkItem): Promise<EnrichedSpec> {
    return enrich(item, this.provider, this.graphValidator);
  }

  /**
   * Score an enriched spec using graph-based structural + semantic analysis.
   * Synchronous — no LLM calls.
   */
  score(spec: EnrichedSpec): ComplexityScore {
    return scoreCML(spec, this.store);
  }

  /**
   * Run pre-execution simulation for a spec.
   */
  async simulate(
    spec: EnrichedSpec,
    score: ComplexityScore,
    tier: ScopeTier = 'guided-change'
  ): Promise<SimulationResult> {
    return this.simulator.simulate(spec, score, tier);
  }

  /**
   * Record an execution outcome in the knowledge graph.
   * Called by the orchestrator after a worker exits.
   */
  recordOutcome(outcome: ExecutionOutcome): OutcomeIngestResult {
    return this.outcomeConnector.ingest(outcome);
  }

  /**
   * Preprocess an issue through the intelligence pipeline.
   *
   * Behavior depends on which escalation tier the issue's scope falls into:
   * - `autoExecute`: returns immediately with null spec/score and empty signals
   * - `alwaysHuman`: runs SEL for enrichment context (human gets pre-analyzed view),
   *   skips CML, returns empty signals (routing stays needs-human)
   * - `signalGated`: runs full SEL → CML → signals pipeline
   */
  async preprocessIssue(
    issue: Issue,
    scopeTier: import('@harness-engineering/types').ScopeTier,
    escalationConfig: EscalationConfig
  ): Promise<PreprocessResult> {
    // autoExecute: skip everything — no LLM cost for obvious dispatch
    if (escalationConfig.autoExecute.includes(scopeTier)) {
      return { spec: null, score: null, signals: [] };
    }

    // Both alwaysHuman and signalGated run SEL
    const workItem = toRawWorkItem(issue);
    const spec = await this.enrich(workItem);

    // alwaysHuman: SEL for context, skip CML (routing already decided)
    if (escalationConfig.alwaysHuman.includes(scopeTier)) {
      return { spec, score: null, signals: [] };
    }

    // signalGated: full pipeline
    const complexityScore = this.score(spec);
    const signals = scoreToConcernSignals(complexityScore);
    return { spec, score: complexityScore, signals };
  }
}
