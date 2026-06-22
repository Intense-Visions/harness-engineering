import { readFile } from 'node:fs/promises';
import type { GraphStore } from '@harness-engineering/graph';
import type { AnalysisProvider } from '../analysis-provider/interface.js';
import type { OutcomeEvalInput, OutcomeVerdict, JudgedAgainst } from './types.js';
import { deriveAuthority } from './authority.js';
import { resolveSection } from './section-resolver.js';

export interface OutcomeEvaluatorOptions {
  /** Override model for the outcome-eval LLM call. */
  model?: string;
}

/**
 * Post-execution spec-satisfaction judge. Mirrors PeslSimulator's
 * (provider, store, options) constructor shape. The store is held for the
 * Phase 4 execution_outcome graph write; see `persistOutcome`.
 */
export class OutcomeEvaluator {
  private readonly provider: AnalysisProvider;
  private readonly store: GraphStore;
  private readonly options: OutcomeEvaluatorOptions;

  constructor(
    provider: AnalysisProvider,
    store: GraphStore,
    options: OutcomeEvaluatorOptions = {}
  ) {
    this.provider = provider;
    this.store = store;
    this.options = options;
  }

  async evaluate(input: OutcomeEvalInput): Promise<OutcomeVerdict> {
    const resolved = await this.resolveJudgmentSection(input);

    // No judgable section: never call the LLM, never block.
    if (resolved === null) {
      const verdict = this.buildVerdict(
        'INCONCLUSIVE',
        'low',
        'No judgable spec section found.',
        'overview',
        []
      );
      await this.persistOutcome(verdict, input);
      return verdict;
    }

    // Provider path added in Task 3.
    const verdict = this.buildVerdict('INCONCLUSIVE', 'low', 'pending', resolved.judgedAgainst, []);
    await this.persistOutcome(verdict, input);
    return verdict;
  }

  private async resolveJudgmentSection(
    input: OutcomeEvalInput
  ): Promise<{ judgedAgainst: JudgedAgainst; body: string } | null> {
    if (input.specSection !== undefined) {
      return { judgedAgainst: 'success-criteria', body: input.specSection };
    }
    const markdown = await readFile(input.specPath, 'utf8');
    return resolveSection(markdown);
  }

  private buildVerdict(
    verdict: OutcomeVerdict['verdict'],
    confidence: OutcomeVerdict['confidence'],
    rationale: string,
    judgedAgainst: JudgedAgainst,
    unmetCriteria: string[]
  ): OutcomeVerdict {
    return {
      verdict,
      confidence,
      rationale,
      judgedAgainst,
      unmetCriteria,
      authority: deriveAuthority(verdict, confidence),
    };
  }

  /**
   * Phase 4 seam: writes the execution_outcome node via ExecutionOutcomeConnector.
   * Intentionally a no-op in Phase 3 — Phase 4 fills the body using `this.store`.
   */
  private async persistOutcome(_verdict: OutcomeVerdict, _input: OutcomeEvalInput): Promise<void> {
    // No-op until Phase 4. `this.store` is held for that write.
    // `this.provider`/`this.options` are consumed by the provider path (Task 3).
    void this.store;
    void this.options;
    void this.provider;
    return;
  }
}
