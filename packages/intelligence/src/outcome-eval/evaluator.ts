import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { GraphStore } from '@harness-engineering/graph';
import type { AnalysisProvider } from '../analysis-provider/interface.js';
import type { OutcomeEvalInput, OutcomeVerdict, JudgedAgainst, CanaryRunOutcome } from './types.js';
import { deriveAuthority } from './authority.js';
import { resolveSection } from './section-resolver.js';
import { OUTCOME_EVAL_SYSTEM_PROMPT, buildUserPrompt, verdictSchema } from './prompts.js';
import type { LlmVerdict } from './prompts.js';
import { ExecutionOutcomeConnector } from '../outcome/connector.js';
import type { ExecutionOutcome } from '../outcome/types.js';
import { summarizeGuardian } from '../guardian/summary.js';
import type { GuardianAnalysis } from '../guardian/types.js';

/**
 * Fold advisory guardian diff-coverage records into a verdict's rationale as a
 * single deterministic line (#914). Pure and total: an absent/empty guardian
 * input returns the verdict UNCHANGED (referentially identical), preserving the
 * "no guardian wiring" contract byte-for-byte. Never touches `authority` — ship
 * authority stays TS-derived from (verdict, confidence).
 */
export function withGuardianSignal(
  verdict: OutcomeVerdict,
  guardian: GuardianAnalysis[] | undefined
): OutcomeVerdict {
  if (!guardian || guardian.length === 0) return verdict;
  const summary = summarizeGuardian(guardian);
  if (!summary) return verdict;
  const rationale = verdict.rationale ? `${verdict.rationale}\n\n${summary}` : summary;
  return { ...verdict, rationale };
}

/**
 * Fold a structured canary run outcome into a verdict's rationale as a single
 * deterministic line. Pure and total: an absent canaryRun returns the verdict
 * UNCHANGED (referentially identical), preserving the "no canary wiring"
 * contract byte-for-byte. Never touches `authority` — ship authority stays
 * TS-derived from (verdict, confidence). Mirrors withGuardianSignal (#914).
 */
export function withCanaryRunSignal(
  verdict: OutcomeVerdict,
  canaryRun: CanaryRunOutcome | undefined
): OutcomeVerdict {
  if (!canaryRun) return verdict;
  const line = summarizeCanaryRun(canaryRun);
  const rationale = verdict.rationale ? `${verdict.rationale}\n\n${line}` : line;
  return { ...verdict, rationale };
}

/** Human labels for canary's gate exit codes. */
const CANARY_GATE_LABELS: Readonly<Record<number, string>> = {
  0: 'clean',
  1: 'findings',
  2: 'surface',
  3: 'abstained',
};

/** Deterministic, secret-free one-line summary of a canary run outcome. */
function summarizeCanaryRun(run: CanaryRunOutcome): string {
  const label = CANARY_GATE_LABELS[run.exitCode] ?? 'unknown';
  return `Canary gate: exit ${run.exitCode} (${label}); ${run.passed} passed, ${run.failed} failed, ${run.flaky} flaky, ${run.skipped} skipped.`;
}

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
    // Section resolution (incl. readFile) is degrade-safe: a missing spec or
    // read error yields a degraded verdict with section unknown ('overview')
    // and the provider is never called.
    let resolved: { judgedAgainst: JudgedAgainst; body: string } | null;
    try {
      resolved = await this.resolveJudgmentSection(input);
    } catch {
      return this.finish(this.degradedVerdict('overview'), input);
    }

    // No judgable section (or empty/whitespace specSection): never call the
    // LLM, never block.
    if (resolved === null) {
      const verdict = this.buildVerdict(
        'INCONCLUSIVE',
        'low',
        'No judgable spec section found.',
        'overview',
        []
      );
      return this.finish(verdict, input);
    }

    const verdict = await this.judge(resolved, input);
    return this.finish(verdict, input);
  }

  /**
   * Run the provider call and strict re-parse. ANY failure here — provider
   * rejection (rate limit/network), or a strict-parse rejection of a malformed
   * or authority-injected payload — degrades safely to INCONCLUSIVE/low/
   * advisory rather than throwing. This reconciles Criterion 3 (never block on
   * noise) with Criterion 4: an injected `authority` key is discarded by the
   * .strict() re-parse, and the degraded verdict's authority is DERIVED from
   * INCONCLUSIVE/low = advisory — so the LLM gains nothing by injecting it.
   */
  private async judge(
    resolved: { judgedAgainst: JudgedAgainst; body: string },
    input: OutcomeEvalInput
  ): Promise<OutcomeVerdict> {
    try {
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

      return this.buildVerdict(
        llm.verdict,
        llm.confidence,
        llm.rationale,
        resolved.judgedAgainst,
        llm.unmetCriteria
      );
    } catch {
      return this.degradedVerdict(resolved.judgedAgainst);
    }
  }

  /**
   * Build the safe-degradation verdict. INCONCLUSIVE/low yields advisory
   * authority via deriveAuthority — never blocking. The rationale names only a
   * coarse reason category, never a stack trace or secret.
   */
  private degradedVerdict(judgedAgainst: JudgedAgainst): OutcomeVerdict {
    return this.buildVerdict(
      'INCONCLUSIVE',
      'low',
      'Evaluation could not be completed; defaulting to an inconclusive, advisory verdict.',
      judgedAgainst,
      []
    );
  }

  /**
   * Fold in the advisory guardian signal, persist (Phase 4 seam), then return
   * the verdict. Applying guardian here (not per-branch) means every path —
   * judged, no-section, and degraded — surfaces the guardian signal uniformly,
   * and the persisted `execution_outcome` node carries the annotated rationale.
   */
  private async finish(verdict: OutcomeVerdict, input: OutcomeEvalInput): Promise<OutcomeVerdict> {
    const withGuardian = withGuardianSignal(verdict, input.guardian);
    const withCanary = withCanaryRunSignal(withGuardian, input.canaryRun);
    await this.persistOutcome(withCanary, input);
    return withCanary;
  }

  private async resolveJudgmentSection(
    input: OutcomeEvalInput
  ): Promise<{ judgedAgainst: JudgedAgainst; body: string } | null> {
    if (input.specSection !== undefined) {
      // An empty/whitespace pre-resolved section is not judgable: take the
      // no-section short-circuit rather than paying a success-criteria LLM call.
      return input.specSection.trim() === ''
        ? null
        : { judgedAgainst: 'success-criteria', body: input.specSection };
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
   * Map an OutcomeVerdict + OutcomeEvalInput to the connector's ExecutionOutcome.
   * - result: SATISFIED -> 'success'; otherwise 'failure'. INCONCLUSIVE is
   *   'failure' for type-validity but omits agentPersona/affected systems so
   *   the effectiveness scorer ignores it (plan D2).
   * - linkedSpecId: input.specPath (metadata only; no spec edge — plan D1).
   * - affectedSystemNodeIds: [] in v1 (not available from OutcomeEvalInput — D4).
   * - id: one node per EVALUATION. GraphStore.addNode upserts by id, so the id
   *   carries a collision-free randomUUID() — two evaluate() calls in the same
   *   millisecond can never overwrite each other (data-loss fix). specPath is
   *   included for human readability only.
   * - taskType: OMITTED. The outcome-eval judge has no task categorization, and
   *   asserting a false 'feature' would mislead specialization analytics (SUG-2).
   * - metadata: the full verdict carried through the connector's additive
   *   pass-through (verdict/confidence/judgedAgainst/rationale/authority/
   *   unmetCriteria/source, plus commit when supplied) so the true 3-valued
   *   verdict is durable and self-describing on the node (Truth 3) and a
   *   sha-keyed consumer can reconstruct the OutcomeVerdict. `authority` is a
   *   copy of the TS-derived value, never trusted from the LLM.
   */
  private toExecutionOutcome(verdict: OutcomeVerdict, input: OutcomeEvalInput): ExecutionOutcome {
    const timestamp = new Date().toISOString();
    return {
      id: `outcome:outcome-eval:${input.specPath}:${randomUUID()}`,
      issueId: 'outcome-eval',
      identifier: `outcome-eval:${input.specPath}`,
      result: verdict.verdict === 'SATISFIED' ? 'success' : 'failure',
      retryCount: 0,
      failureReasons: verdict.unmetCriteria,
      // 0 means "not applicable to outcome-eval" — the judge does not time work.
      durationMs: 0,
      linkedSpecId: input.specPath,
      affectedSystemNodeIds: [],
      timestamp,
      metadata: {
        verdict: verdict.verdict,
        confidence: verdict.confidence,
        judgedAgainst: verdict.judgedAgainst,
        source: 'outcome-eval',
        // The full verdict, carried additively so the node is a faithful,
        // self-describing record and a consumer (e.g. the pre-merge brief's
        // findOutcomeVerdict) can reconstruct the OutcomeVerdict without
        // re-running the judge. `authority` here is the TS-derived value from
        // the verdict — it is a copy of the computed authority, never trusted
        // from the LLM. `unmetCriteria` mirrors failureReasons additively
        // (failureReasons is a reserved/core key the consumer does not read).
        rationale: verdict.rationale,
        authority: verdict.authority,
        unmetCriteria: verdict.unmetCriteria,
        // Head sha (when supplied) lets a sha-keyed consumer match this node.
        ...(input.commit !== undefined && input.commit !== '' ? { commit: input.commit } : {}),
        // Additive canary* metadata (only when a canaryRun is supplied). These
        // keys are NOT in RESERVED_METADATA_KEYS, so they survive the
        // connector's stripReservedKeys merge as genuinely-additive keys. An
        // absent canaryRun emits ZERO extra keys → node byte-identical to today.
        // Authority above stays the TS-derived copy; canary never affects it.
        ...(input.canaryRun !== undefined
          ? {
              canaryGateExitCode: input.canaryRun.exitCode,
              canaryPassed: input.canaryRun.passed,
              canaryFailed: input.canaryRun.failed,
              canaryFlaky: input.canaryRun.flaky,
              canarySkipped: input.canaryRun.skipped,
            }
          : {}),
      },
    };
  }

  /**
   * Phase 4: writes exactly one execution_outcome node via
   * ExecutionOutcomeConnector. Degrade-safe (plan D3): a graph-write failure is
   * swallowed-and-logged, never thrown — the verdict is already computed before
   * this runs, so swallowing keeps evaluate() total. No secrets/stack frames in
   * the log message.
   */
  private async persistOutcome(verdict: OutcomeVerdict, input: OutcomeEvalInput): Promise<void> {
    try {
      const connector = new ExecutionOutcomeConnector(this.store);
      connector.ingest(this.toExecutionOutcome(verdict, input));
    } catch {
      console.warn('[outcome-eval] execution_outcome persistence failed; verdict unaffected.');
    }
  }
}
