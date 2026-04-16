import type { GraphStore } from '@harness-engineering/graph';
import type { ScopeTier } from '@harness-engineering/types';
import type { AnalysisProvider } from '../analysis-provider/interface.js';
import type { EnrichedSpec, ComplexityScore, SimulationResult } from '../types.js';
import { runGraphOnlyChecks } from './graph-checks.js';
import { runLlmSimulation } from './llm-simulation.js';

/** Tiers that get graph-only checks by default (no LLM cost). */
const GRAPH_ONLY_TIERS: ReadonlySet<ScopeTier> = new Set(['quick-fix', 'diagnostic']);

export interface PeslSimulatorOptions {
  /** Override model for PESL LLM calls. */
  model?: string;
}

/**
 * Top-level PESL simulator that routes to graph-only or full LLM simulation
 * based on scope tier and CML recommended route.
 *
 * Tiered behavior (per D5 in spec):
 * - quick-fix / diagnostic: graph-only checks (CascadeSimulator + impact)
 * - guided-change: full LLM simulation (plan expansion, failure injection, test projection)
 * - simulation-required override: full LLM simulation regardless of tier
 */
export class PeslSimulator {
  private readonly provider: AnalysisProvider;
  private readonly store: GraphStore;
  private readonly options: PeslSimulatorOptions;

  constructor(provider: AnalysisProvider, store: GraphStore, options: PeslSimulatorOptions = {}) {
    this.provider = provider;
    this.store = store;
    this.options = options;
  }

  /**
   * Run pre-execution simulation for a spec.
   *
   * @param spec - Enriched spec from SEL
   * @param score - Complexity score from CML
   * @param tier - Scope tier of the issue
   * @returns SimulationResult with tier, confidence, and abort recommendation
   */
  async simulate(
    spec: EnrichedSpec,
    score: ComplexityScore,
    tier: ScopeTier
  ): Promise<SimulationResult> {
    const needsFullSimulation =
      score.recommendedRoute === 'simulation-required' || !GRAPH_ONLY_TIERS.has(tier);

    if (needsFullSimulation) {
      return runLlmSimulation(spec, score, this.store, this.provider, this.options.model);
    }

    return runGraphOnlyChecks(spec, score, this.store);
  }
}
