import { readFile } from 'node:fs/promises';
import type { AnalysisProvider } from '../analysis-provider/interface.js';
import { resolveSection } from '../outcome-eval/section-resolver.js';
import type { AcceptanceEvalInput, AcceptanceVerdict, JudgedAgainst } from './types.js';
import { deriveAcceptanceAuthority } from './authority.js';
import {
  ACCEPTANCE_EVAL_SYSTEM_PROMPT,
  buildUserPrompt,
  acceptanceVerdictSchema,
} from './prompts.js';
import type { LlmAcceptanceVerdict } from './prompts.js';

export interface AcceptanceEvaluatorOptions {
  /** Override model for the acceptance-eval LLM call. */
  model?: string;
}

/**
 * Pre-execution acceptance-criteria judge — the upstream twin of
 * OutcomeEvaluator. Built on the cli AnalysisProvider. The LLM returns only
 * measurability/confidence/criteriaFindings/coverageFindings/rationale;
 * `authority` is derived in TypeScript and never read from the model.
 *
 * Unlike OutcomeEvaluator it holds no GraphStore: there is no acceptance
 * outcome node type and Phase 1 does not persist (see plan D-P1-3).
 */
export class AcceptanceEvaluator {
  private readonly provider: AnalysisProvider;
  private readonly options: AcceptanceEvaluatorOptions;

  constructor(provider: AnalysisProvider, options: AcceptanceEvaluatorOptions = {}) {
    this.provider = provider;
    this.options = options;
  }

  async evaluate(input: AcceptanceEvalInput): Promise<AcceptanceVerdict> {
    let resolved: { judgedAgainst: JudgedAgainst; body: string } | null;
    try {
      resolved = await this.resolveJudgmentSection(input);
    } catch {
      return this.degradedVerdict('overview');
    }

    if (resolved === null) {
      return this.buildVerdict(
        'INCONCLUSIVE',
        'low',
        'No judgable spec section found.',
        'overview',
        [],
        []
      );
    }

    return this.judge(resolved, input);
  }

  private async judge(
    resolved: { judgedAgainst: JudgedAgainst; body: string },
    input: AcceptanceEvalInput
  ): Promise<AcceptanceVerdict> {
    try {
      const response = await this.provider.analyze<LlmAcceptanceVerdict>({
        prompt: buildUserPrompt(resolved.body, input.testContent),
        systemPrompt: ACCEPTANCE_EVAL_SYSTEM_PROMPT,
        responseSchema: acceptanceVerdictSchema,
        ...(this.options.model !== undefined && { model: this.options.model }),
      });
      // Defensive strict re-parse: rejects any extra key (e.g. an injected
      // `authority`) even if the provider did not enforce strict mode.
      const llm = acceptanceVerdictSchema.parse(response.result);
      return this.buildVerdict(
        llm.measurability,
        llm.confidence,
        llm.rationale,
        resolved.judgedAgainst,
        llm.criteriaFindings,
        llm.coverageFindings
      );
    } catch {
      return this.degradedVerdict(resolved.judgedAgainst);
    }
  }

  private degradedVerdict(judgedAgainst: JudgedAgainst): AcceptanceVerdict {
    return this.buildVerdict(
      'INCONCLUSIVE',
      'low',
      'Evaluation could not be completed; defaulting to an inconclusive, advisory verdict.',
      judgedAgainst,
      [],
      []
    );
  }

  private async resolveJudgmentSection(
    input: AcceptanceEvalInput
  ): Promise<{ judgedAgainst: JudgedAgainst; body: string } | null> {
    if (input.specSection !== undefined) {
      return input.specSection.trim() === ''
        ? null
        : { judgedAgainst: 'success-criteria', body: input.specSection };
    }
    const markdown = await readFile(input.specPath, 'utf8');
    return resolveSection(markdown);
  }

  private buildVerdict(
    measurability: AcceptanceVerdict['measurability'],
    confidence: AcceptanceVerdict['confidence'],
    rationale: string,
    judgedAgainst: JudgedAgainst,
    criteriaFindings: AcceptanceVerdict['criteriaFindings'],
    coverageFindings: AcceptanceVerdict['coverageFindings']
  ): AcceptanceVerdict {
    return {
      measurability,
      confidence,
      rationale,
      judgedAgainst,
      criteriaFindings,
      coverageFindings,
      authority: deriveAcceptanceAuthority(measurability, confidence),
    };
  }
}
