/**
 * Auto-triggered retrospection → applyable proposals.
 *
 * Fires at the session terminus (session archive). Reads the archived session
 * corpus, asks an `AnalysisProvider` to conduct a grounded retrospective, and
 * persists each resulting *applyable* proposal into the existing proposals store
 * (`.harness/proposals/`) via `createProposal`.
 *
 * Emission only — nothing is auto-applied. Each proposal lands with
 * `status: 'open'`; approval runs the soundness gate and promotion writes the
 * skill into the catalog. That apply step stays a separate, human-gated action
 * (the proposals queue), exactly as for agent-emitted proposals.
 *
 * The proposal records are ordinary `SkillProposal`s — the same shape produced
 * by `emit_skill_proposal` — so they surface, gate, and promote through the
 * unchanged pipeline. No parallel proposal type is introduced.
 */
import {
  RetrospectionProposalsResponseSchema,
  type RetrospectionProposalsResponse,
  type RetrospectionConfig,
  Ok,
  Err,
  type Result,
} from '@harness-engineering/types';
import { createProposal, type SkillProposal } from '@harness-engineering/core';
import type { AnalysisProvider } from '@harness-engineering/intelligence';
import { readInputCorpus, truncateForBudget } from './summarize.js';

/** Provenance stamped onto every retrospection-emitted proposal. */
export const RETROSPECTION_PROPOSED_BY = 'retrospection:session-terminus';

const DEFAULT_MAX_PROPOSALS = 3;
const DEFAULT_INPUT_BUDGET_TOKENS = 16_000;
const DEFAULT_TIMEOUT_MS = 60_000;

const SYSTEM_PROMPT = `You conduct a retrospective over a completed harness-engineering session and propose concrete, *applyable* improvements to the skill catalog.

Emit only proposals that are genuinely actionable and grounded in the session's artefacts — quote skill names, file names, and error messages verbatim. Each proposal is exactly one of:
- "refinement" of an EXISTING skill: set targetSkill and content.diff (a unified diff against that skill's files). Do NOT set skillYaml/skillMd.
- "new-skill": set content.skillYaml (full skill.yaml) and content.skillMd (full SKILL.md). Do NOT set targetSkill or content.diff.

Every proposal needs content.name (kebab-case) and content.description (20–280 chars) and a justification (20–2000 chars) explaining why the change is worth promoting. Do not invent. If the session yields no worthwhile catalog change, return an empty list. Never exceed the requested maximum.`;

function buildUserPrompt(corpus: string, maxProposals: number): string {
  return (
    `Below are the archived files for a single completed harness-engineering session. ` +
    `Return at most ${maxProposals} applyable skill proposal(s) capturing durable, ` +
    `catalog-worthy learnings from this session. Prefer refinements to existing skills ` +
    `the session actually used; propose a new skill only when no existing skill fits.\n\n---\n\n` +
    corpus
  );
}

export interface RetrospectionContext {
  /** Absolute path of the archived session directory. */
  archiveDir: string;
  /** Archived session id (used as proposal provenance). */
  sessionId: string;
  /** Project root containing `.harness/`. */
  projectPath: string;
  /** Resolved AnalysisProvider — caller skips this step when none is available. */
  provider: AnalysisProvider;
  /** Optional retrospection config; defaults applied per-field. */
  config?: RetrospectionConfig | undefined;
  /** Optional logger; diagnostics only. */
  logger?: { warn?: (msg: string, meta?: Record<string, unknown>) => void } | undefined;
}

export interface RetrospectionResult {
  /** Proposals successfully written to `.harness/proposals/`. */
  written: SkillProposal[];
  /** Drafts dropped because they failed validation or collided with an open proposal. */
  skipped: number;
}

/**
 * Resolve whether auto-triggered retrospection should run for the given config.
 * Mirrors `isSummaryEnabled`: off when no config block is present, off when
 * `enabled === false`, on otherwise (provider availability is checked by the
 * caller). Opt-in and safe by default.
 */
export function isRetrospectionEnabled(config?: RetrospectionConfig): boolean {
  if (!config) return false;
  if (config.enabled === false) return false;
  return true;
}

/**
 * Run a retrospection over one archived session and persist the applyable
 * proposals it yields. Never throws for expected failure modes (missing corpus,
 * provider error, invalid/colliding drafts) — those resolve to `Err` or a
 * per-draft skip so the archive lifecycle is never disrupted.
 */
export async function retrospectArchivedSession(
  ctx: RetrospectionContext
): Promise<Result<RetrospectionResult, Error>> {
  const corpus = readInputCorpus(ctx.archiveDir);
  if (corpus.trim().length === 0) {
    return Err(new Error(`no retrospection input files found in ${ctx.archiveDir}`));
  }

  const maxProposals = ctx.config?.maxProposals ?? DEFAULT_MAX_PROPOSALS;
  const inputBudgetTokens = ctx.config?.inputBudgetTokens ?? DEFAULT_INPUT_BUDGET_TOKENS;
  const timeoutMs = ctx.config?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const prompt = buildUserPrompt(truncateForBudget(corpus, inputBudgetTokens), maxProposals);

  let response;
  try {
    response = await Promise.race([
      ctx.provider.analyze<RetrospectionProposalsResponse>({
        prompt,
        systemPrompt: SYSTEM_PROMPT,
        responseSchema: RetrospectionProposalsResponseSchema,
        ...(ctx.config?.model && { model: ctx.config.model }),
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`provider call timed out after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);
  } catch (e) {
    return Err(new Error(`retrospection failed: ${e instanceof Error ? e.message : String(e)}`));
  }

  const parsed = RetrospectionProposalsResponseSchema.safeParse(response.result);
  if (!parsed.success) {
    return Err(new Error(`retrospection schema validation failed: ${parsed.error.message}`));
  }

  const drafts = parsed.data.proposals.slice(0, maxProposals);
  const written: SkillProposal[] = [];
  let skipped = 0;

  for (const draft of drafts) {
    try {
      // `createProposal` re-validates the full record (including the strict
      // kind↔content cross-field rules and the one-open-refinement-per-skill
      // collision check), so a malformed or duplicate draft throws here and is
      // counted as skipped rather than persisted.
      const proposal = await createProposal(ctx.projectPath, {
        kind: draft.kind,
        ...(draft.targetSkill !== undefined && { targetSkill: draft.targetSkill }),
        proposedBy: RETROSPECTION_PROPOSED_BY,
        justification: draft.justification,
        sessionId: ctx.sessionId,
        content: draft.content,
      });
      written.push(proposal);
    } catch (e) {
      skipped += 1;
      ctx.logger?.warn?.('session retrospection: dropped draft', {
        sessionId: ctx.sessionId,
        name: draft.content?.name,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return Ok({ written, skipped });
}
