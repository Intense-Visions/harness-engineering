import { readFile } from 'node:fs/promises';
import type { GraphStore } from '@harness-engineering/graph';
import type { AnalysisProvider } from '../analysis-provider/interface.js';
import type { OutcomeEvalInput, OutcomeVerdict, JudgedAgainst } from './types.js';
import { deriveAuthority } from './authority.js';
import { resolveSection } from './section-resolver.js';
import { OUTCOME_EVAL_SYSTEM_PROMPT, buildUserPrompt, verdictSchema } from './prompts.js';
import type { LlmVerdict } from './prompts.js';

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

    const response = await this.provider.analyze<LlmVerdict>({
      prompt: buildUserPrompt(resolved.body, input.diff, input.testOutput),
      systemPrompt: OUTCOME_EVAL_SYSTEM_PROMPT,
      responseSchema: verdictSchema,
      ...(this.options.model !== undefined && { model: this.options.model }),
    });

    // Defensive strict re-parse: rejects any extra key (e.g. an injected
    // `authority`) even if the provider did not enforce strict mode. This is
    // the false-positive-critical seam — authority is derived in TS below.
    const llm = verdictSchema.parse(response.result);

    const verdict = this.buildVerdict(
      llm.verdict,
      llm.confidence,
      llm.rationale,
      resolved.judgedAgainst,
      llm.unmetCriteria
    );
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
    // No-op until Phase 4. `this.store` is held for the execution_outcome write.
    void this.store;
    return;
  }
}
