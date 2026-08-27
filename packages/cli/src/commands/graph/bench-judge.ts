import { z } from 'zod';
import type { AnalysisProvider } from '@harness-engineering/intelligence';
import { resolveAnalysisProvider } from '../../mcp/utils/analysis-provider.js';

/**
 * Answer-quality judge for `harness graph bench` (deferred slice of issue #1271).
 *
 * The two objective bench axes (tokens, tool calls) measure retrieval *cost*. This
 * third axis measures whether the retrieved payload actually *suffices to answer* the
 * query — the comparator's "83%" axis. It reuses the shared harness eval/judge seam
 * (`resolveAnalysisProvider` + `AnalysisProvider.analyze<T>()`, the exact plumbing
 * `outcome_eval` / `acceptance_eval` use) rather than a bespoke judge.
 *
 * It degrades honestly: any provider rejection or malformed response yields an
 * INCONCLUSIVE grade (`sufficient: null`) rather than a fabricated score, and no judge
 * ever fails the benchmark — the axis is advisory, exactly like a low-confidence
 * `outcome_eval` verdict.
 */

/** Which retrieval strategy produced the payload being graded. */
export type BenchStrategy = 'graph' | 'naive';

/**
 * A single answer-quality grade. `sufficient: null` is the honest INCONCLUSIVE state —
 * the judge was unreachable or returned an unusable response. A grade is NEVER fabricated.
 */
export interface QualityGrade {
  /** true = payload suffices to answer the query; false = it does not; null = inconclusive. */
  sufficient: boolean | null;
  confidence: 'low' | 'medium' | 'high';
  rationale: string;
}

export interface BenchJudge {
  /** Grade whether `payloadText` is sufficient to answer `query`. Total: never throws. */
  grade(query: string, strategy: BenchStrategy, payloadText: string): Promise<QualityGrade>;
}

/**
 * Character budget for the payload handed to the judge. The naive payload is whole files
 * (can be ~900k tokens); the graph payload is a scoped summary. Both are truncated to the
 * same budget so the judgment is comparable and the call is bounded. Surfaced in the
 * result note so the axis is honest about what the judge actually saw.
 */
export const JUDGE_PAYLOAD_CHAR_BUDGET = 12_000;

const INCONCLUSIVE: QualityGrade = {
  sufficient: null,
  confidence: 'low',
  rationale:
    'Answer-quality judge unreachable or returned an unusable response; axis is inconclusive.',
};

/** Strict schema — the LLM returns only sufficiency/confidence/rationale, never authority. */
const qualityVerdictSchema = z
  .object({
    sufficient: z.boolean(),
    confidence: z.enum(['low', 'medium', 'high']),
    rationale: z.string(),
  })
  .strict();

type LlmQualityVerdict = z.infer<typeof qualityVerdictSchema>;

const JUDGE_SYSTEM_PROMPT =
  'You are a retrieval-sufficiency judge for a code-navigation benchmark. Given a developer ' +
  'query and the text a retrieval strategy surfaced into context, decide whether that text ' +
  'contains ENOUGH information to answer the query. Judge sufficiency of the retrieved payload, ' +
  'not whether a final prose answer is perfectly worded. A scoped summary that names the right ' +
  'files/symbols/relationships can be sufficient even if terse. Reply strictly as JSON matching ' +
  'the schema: {"sufficient": boolean, "confidence": "low"|"medium"|"high", "rationale": string}.';

function truncate(text: string): string {
  if (text.length <= JUDGE_PAYLOAD_CHAR_BUDGET) return text;
  return text.slice(0, JUDGE_PAYLOAD_CHAR_BUDGET) + '\n…[truncated for judging]';
}

function buildJudgePrompt(query: string, strategy: BenchStrategy, payloadText: string): string {
  return [
    `Query: ${query}`,
    `Retrieval strategy: ${strategy}`,
    'Retrieved payload (may be truncated):',
    '---',
    truncate(payloadText),
    '---',
    'Is this payload sufficient to answer the query?',
  ].join('\n');
}

/**
 * One provider call + strict re-parse. Mirrors `OutcomeEvaluator.judge()`: ANY failure
 * (provider rejection, malformed or authority-injected payload) degrades to INCONCLUSIVE
 * rather than throwing. The strict re-parse rejects any extra key even if the provider
 * did not enforce strict mode — the judge cannot smuggle an `authority` field.
 */
async function gradeOnce(
  provider: AnalysisProvider,
  model: string | undefined,
  query: string,
  strategy: BenchStrategy,
  payloadText: string
): Promise<QualityGrade> {
  try {
    const response = await provider.analyze<LlmQualityVerdict>({
      prompt: buildJudgePrompt(query, strategy, payloadText),
      systemPrompt: JUDGE_SYSTEM_PROMPT,
      responseSchema: qualityVerdictSchema,
      ...(model !== undefined && { model }),
    });
    const llm = qualityVerdictSchema.parse(response.result);
    return { sufficient: llm.sufficient, confidence: llm.confidence, rationale: llm.rationale };
  } catch {
    return { ...INCONCLUSIVE };
  }
}

/** Build a real judge over an `AnalysisProvider`. Total: each grade never throws. */
export function buildBenchJudge(provider: AnalysisProvider, model?: string): BenchJudge {
  return {
    grade: (query, strategy, payloadText) =>
      gradeOnce(provider, model, query, strategy, payloadText),
  };
}

/**
 * Resolve the real judge from the shared eval provider chain (Anthropic key → local
 * `/v1` endpoint → null). Returns `null` when no provider is configured, so the caller
 * reports the axis as INCONCLUSIVE/advisory without fabricating a score.
 */
export async function resolveBenchJudge(model?: string): Promise<BenchJudge | null> {
  const provider = await resolveAnalysisProvider(model);
  if (!provider) return null;
  return buildBenchJudge(provider as AnalysisProvider, model);
}
