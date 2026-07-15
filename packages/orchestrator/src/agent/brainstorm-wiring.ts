// packages/orchestrator/src/agent/brainstorm-wiring.ts
//
// Roadmap Auto-Triage — Phase 2, Task 4: the orchestrator-side wiring for the pure
// autonomous-brainstorm decision core.
//
// The pure `runAutoBrainstorm` (intelligence) is generator-injected and orchestrator-free.
// THIS module supplies the real `ForkGenerator` over the SEL `AnalysisProvider` — with the
// two Task-0 spike hardenings baked in:
//
//   1. Structured per-fork output (mirror `complexity/tiebreak.ts`): the model fills a Zod
//      schema `{ done, fork?, recommendation?, confidence?, rationale? }`. Confidence is a
//      CONSERVATIVE input — the runner halts unless it is `'high'`.
//   2. Self-consistency N-sampling (overconfidence hardening): each fork is sampled N=3×. We
//      force `confidence:'low'` (regardless of what the model reported → the runner halts) on
//      ANY of these degeneracies:
//        • the recommended OPTION flips across samples (classic self-consistency instability);
//        • the samples DRIFT to a different fork — a mismatched `forkId` or `question` — so a
//          shared recommendation LABEL is coincidence, not agreement (fork-identity gate);
//        • the recommendation is EMPTY/whitespace, or is NOT one of the fork's offered
//          `options` — a content-free or off-menu value is not a confident decision.
//      A rubric in the prompt names the human-only triggers (product/UX tradeoffs, unrevealed
//      business priorities, security/irreversibility) so the model is biased toward LOW on
//      exactly the forks a human must own.
//
// On a clean `completed`, this module renders a proposal-shaped spec to docs and then
// RE-SCORES the now-substantive item via the Phase-1 `runScopingProbe` (through `triageIssue`)
// — SC4: the re-score reads real content, not the original length proxy.
//
// Everything impure (live provider, doc I/O, re-score) lives HERE; the decision core stays
// pure + exhaustively testable. Mirrors `triage-wiring.ts`'s pure-core / wiring split.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import type { Issue } from '@harness-engineering/types';
import type { GraphStore } from '@harness-engineering/graph';
import {
  runAutoBrainstorm,
  depthForLevel,
  type AnalysisProvider,
  type BrainstormInput,
  type BrainstormOutcome,
  type Fork,
  type ForkConfidence,
  type ForkDecision,
  type ForkGenerator,
  type SpecDraft,
  type TriageVerdict,
} from '@harness-engineering/intelligence';
import { triageIssue, type TriageWiringDeps } from './triage-wiring.js';

// ---------------------------------------------------------------------------
// The per-fork structured-output schema (mirrors tiebreak.ts).
// ---------------------------------------------------------------------------

/**
 * One structured decision the SEL provider fills for a single brainstorm step. `done`
 * signals "no more forks — the brainstorm is complete"; otherwise the model names the fork,
 * its options, the recommended option, a self-assessed confidence, and a rationale.
 */
const ForkStepSchema = z.object({
  done: z.boolean().describe('true when there are no more design forks to decide'),
  forkId: z.string().describe('short stable id for this fork, e.g. "storage-backend"').optional(),
  question: z.string().describe('the design question this fork decides').optional(),
  options: z.array(z.string()).describe('the mutually-exclusive options considered').optional(),
  // The AUTHORITATIVE recommendation validity checks (non-empty AND one of `options`) live in
  // the GENERATOR, where `fork.options` is known and where a degenerate value must map to a
  // `confidence:'low'` DOWNGRADE (→ runner halts with reason 'low-confidence'), not a hard
  // schema/provider throw. We deliberately keep this `optional()`/unconstrained so an empty or
  // absent recommendation still reaches the generator's semantic gate rather than short-
  // circuiting to `halted{ reason:'error' }`. See makeSelForkGenerator's SAFETY GATE 2.
  recommendation: z.string().describe('the recommended option (one of options)').optional(),
  confidence: z
    .enum(['high', 'medium', 'low'])
    .describe('self-assessed confidence in the recommendation')
    .optional(),
  rationale: z.string().describe('why this option').optional(),
});

type ForkStep = z.infer<typeof ForkStepSchema>;

/** The human-only rubric — named triggers that MUST bias the model to low confidence. */
export const BRAINSTORM_RUBRIC =
  'You are running an AUTONOMOUS brainstorm over one backlog item: enumerate each design ' +
  'fork (a decision with mutually-exclusive options), then recommend a default for the NEXT ' +
  'unresolved fork with a self-assessed confidence. Report confidence HIGH only when the ' +
  'recommendation is clearly correct on technical grounds alone. Report LOW (so a human ' +
  'decides) whenever the fork involves ANY of: a product or UX tradeoff, an unrevealed ' +
  'business priority, a security-sensitive or irreversible/outward-facing action, or a ' +
  'genuine judgment call between comparable options. Never invent forks to pad the spec; ' +
  'set done=true once every real fork is resolved. Be conservative — a false "high" is far ' +
  'more costly than asking a human.';

// ---------------------------------------------------------------------------
// The real SEL fork generator (with self-consistency N-sampling).
// ---------------------------------------------------------------------------

export interface SelForkGeneratorOptions {
  /** Samples per fork for the self-consistency check (default 3; min 2 to detect a flip). */
  samples?: number;
  /** Optional model override threaded to the provider. */
  model?: string;
  /**
   * Max tokens per sample (default 4096). Sized for reasoning models (Qwen3 et al.): they emit
   * a `<think>` trace before the JSON fork step, so a tight cap truncates mid-reasoning →
   * `finish_reason: length` → a thrown provider error → the runner halts the fork as `error`.
   * `maxTokens` is a ceiling (a non-thinking model still stops early), so the headroom is free
   * on the fast path and only spent when reasoning occurs.
   */
  maxTokens?: number;
}

/**
 * Build a real `ForkGenerator` over an `AnalysisProvider`. For each fork index the generator
 * samples the model N times; it accepts the fork (passing through the model's reported `high`)
 * only when EVERY sample agrees on the SAME fork identity (`forkId` + normalized `question`)
 * AND the SAME recommended option, AND that recommendation is non-empty AND is one of the
 * fork's offered `options`. Any drift, instability, or degenerate/off-menu recommendation
 * forces `confidence:'low'` (the runner then halts and a human owns the fork). The generator
 * NEVER throws for a well-formed provider; a provider error propagates and the pure runner maps
 * it to `halted{ reason:'error' }`.
 */
export function makeSelForkGenerator(
  provider: AnalysisProvider,
  input: BrainstormInput,
  opts: SelForkGeneratorOptions = {}
): ForkGenerator {
  const samples = Math.max(2, opts.samples ?? 3);
  const maxTokens = opts.maxTokens ?? 4096;

  return {
    async next(
      index: number,
      priorDecisions: readonly ForkDecision[]
    ): Promise<ForkDecision | null> {
      const prompt = buildForkPrompt(input, priorDecisions, index);

      // Self-consistency: sample the SAME fork N times.
      const steps: ForkStep[] = [];
      for (let s = 0; s < samples; s++) {
        const { result } = await provider.analyze<ForkStep>({
          prompt,
          systemPrompt: BRAINSTORM_RUBRIC,
          responseSchema: ForkStepSchema,
          maxTokens,
          ...(opts.model !== undefined ? { model: opts.model } : {}),
        });
        steps.push(result);
      }

      // If ANY sample says done, treat the brainstorm as complete (bias toward stopping —
      // a shorter spec that halts is safer than one that invents forks).
      if (steps.some((st) => st.done)) return null;

      const first = steps[0];
      if (!first) return null;

      const fork: Fork = {
        id: first.forkId ?? `fork-${index}`,
        question: first.question ?? 'unspecified fork',
        options: first.options ?? [],
      };

      const recommendation = first.recommendation ?? '';

      // SAFETY GATE 1 — fork-identity agreement. Self-consistency is only meaningful across
      // samples that decide the SAME fork. If the model drifts to a different forkId or
      // question (even while sharing a recommendation LABEL), a matching label is a coincidence,
      // not agreement — so we do NOT read it as "stable → high". Compare identity BEFORE the
      // recommendation so a drifted-but-same-label fork can never masquerade as stable.
      const normQ = (q: string | undefined): string => (q ?? '').trim().toLowerCase();
      const firstForkId = first.forkId ?? '';
      const firstQuestion = normQ(first.question);
      const identityStable = steps.every(
        (st) => (st.forkId ?? '') === firstForkId && normQ(st.question) === firstQuestion
      );

      // Self-consistency downgrade: the recommended option must be identical across every
      // sample (overconfidence hardening).
      const recStable = steps.every((st) => (st.recommendation ?? '') === recommendation);

      // SAFETY GATE 2 — the recommendation must be a real, offered decision. An empty/whitespace
      // recommendation is content-free (definitionally NOT a confident decision), and a value
      // that is not one of `fork.options` is not a decision the fork actually offered. Either is
      // forced to low so the runner halts and a human owns it. (Skip the options membership check
      // when the model supplied no options — there is nothing authoritative to check against.)
      const recEmpty = recommendation.trim() === '';
      const recNotAnOption =
        !recEmpty && fork.options.length > 0 && !fork.options.includes(recommendation);

      const stable = identityStable && recStable && !recEmpty && !recNotAnOption;
      const reported: ForkConfidence = first.confidence ?? 'low';
      const confidence: ForkConfidence = stable ? reported : 'low';

      let downgradeReason = '';
      if (!identityStable) {
        downgradeReason =
          `fork identity drift across ${samples} samples (self-consistency downgrade to low): ` +
          steps.map((st) => `${st.forkId ?? '∅'}:"${(st.question ?? '∅').trim()}"`).join(' / ');
      } else if (recEmpty) {
        downgradeReason =
          'recommendation was empty/absent (a content-free recommendation is not a ' +
          'confident decision; downgrade to low)';
      } else if (recNotAnOption) {
        downgradeReason =
          `recommendation '${recommendation}' is not one of the offered options ` +
          `[${fork.options.join(', ')}] (downgrade to low)`;
      } else if (!recStable) {
        downgradeReason =
          `recommendation was unstable across ${samples} samples (self-consistency downgrade to low): ` +
          steps.map((st) => st.recommendation ?? '∅').join(' / ');
      }

      return {
        fork,
        recommendation,
        confidence,
        rationale: stable ? (first.rationale ?? '') : downgradeReason,
      };
    },
  };
}

/** Compose the per-fork user prompt from the item text + the forks already resolved. */
function buildForkPrompt(
  input: BrainstormInput,
  priorDecisions: readonly ForkDecision[],
  index: number
): string {
  const resolved =
    priorDecisions.length === 0
      ? '(none yet)'
      : priorDecisions
          .map((d, i) => `${i + 1}. ${d.fork.question} → ${d.recommendation}`)
          .join('\n');
  return (
    `Item: ${input.title}\n` +
    `Summary: ${input.summary}\n` +
    `Complexity: ${input.level}\n\n` +
    `Forks already resolved:\n${resolved}\n\n` +
    `Decide fork #${index + 1}: the NEXT unresolved design fork. If every real fork is ` +
    `already resolved, return { "done": true }.`
  );
}

// ---------------------------------------------------------------------------
// The wired brainstorm: run → (on completion) write spec + re-score.
// ---------------------------------------------------------------------------

export interface BrainstormWiringDeps {
  /**
   * An explicit `ForkGenerator` to drive the brainstorm. INJECTED in tests (no live model).
   * When absent, `provider` is required and a real SEL generator is built.
   */
  generator?: ForkGenerator;
  /** The SEL provider used to build the real generator when `generator` is absent. */
  provider?: AnalysisProvider | null;
  /** Self-consistency / model options for the built generator. */
  generatorOptions?: SelForkGeneratorOptions;
  /**
   * Docs root under which a completed spec is written (`<docsRoot>/changes/<slug>/proposal.md`).
   * Absent ⇒ no spec is written (dry run) but the outcome is still returned.
   */
  docsRoot?: string;
  /** Re-score deps threaded to `triageIssue` (SC4). Absent ⇒ re-score is skipped. */
  rescore?: { graphStore?: GraphStore | null } & Pick<
    TriageWiringDeps,
    'provider' | 'precedent' | 'config' | 'models'
  >;
}

/** The wired result: the pure outcome + (on completion) the written path + the re-score verdict. */
export interface WiredBrainstormResult {
  /** The pure decision-core outcome (completed{spec} | halted{fork,reason}). */
  outcome: BrainstormOutcome;
  /** Absolute path of the written spec, when a spec was completed AND `docsRoot` was set. */
  specPath?: string;
  /** The re-score verdict over the enriched content (SC4), when the brainstorm completed. */
  rescore?: TriageVerdict;
}

/**
 * Build a `BrainstormInput` from an `Issue` + its Phase-1 complexity level. Pure over the Issue.
 */
export function brainstormInputFromIssue(
  issue: Issue,
  level: BrainstormInput['level']
): BrainstormInput {
  return {
    externalId: issue.externalId ?? issue.identifier ?? issue.id,
    title: issue.title ?? issue.identifier ?? issue.id,
    summary: issue.description ?? '',
    level,
  };
}

/**
 * Run the autonomous brainstorm for one issue and, on a clean completion, write a
 * proposal-shaped spec + re-score the enriched item (SC4). The generator is injected (tests)
 * or built over the SEL provider (production). Never throws — the pure runner is total, and
 * the doc-write / re-score are guarded.
 */
export async function runBrainstormForIssue(
  issue: Issue,
  level: BrainstormInput['level'],
  deps: BrainstormWiringDeps
): Promise<WiredBrainstormResult> {
  const input = brainstormInputFromIssue(issue, level);
  const generator =
    deps.generator ??
    (deps.provider
      ? makeSelForkGenerator(deps.provider, input, deps.generatorOptions ?? {})
      : undefined);
  if (!generator) {
    // No way to generate forks ⇒ a halt to a human (never a silent pass).
    return {
      outcome: {
        kind: 'halted',
        fork: { id: 'no-generator', question: 'no fork generator or provider wired', options: [] },
        reason: 'error',
        detail: 'runBrainstormForIssue requires either an injected generator or a SEL provider',
      },
    };
  }

  const depth = depthForLevel(level);
  const outcome = await runAutoBrainstorm(input, generator, depth);

  if (outcome.kind !== 'completed') {
    return { outcome };
  }

  // Clean completion: (a) write the spec doc, (b) re-score the enriched item (SC4).
  const result: WiredBrainstormResult = { outcome };

  if (deps.docsRoot) {
    try {
      result.specPath = writeSpecDoc(deps.docsRoot, outcome.spec);
    } catch {
      // A doc-write failure must not turn a completion into a throw; the outcome still stands.
    }
  }

  if (deps.rescore) {
    try {
      const enrichedIssue = enrichIssueWithSpec(issue, outcome.spec);
      result.rescore = await triageIssue(enrichedIssue, {
        ...(deps.rescore.graphStore ? { graphStore: deps.rescore.graphStore } : {}),
        ...(deps.rescore.provider ? { provider: deps.rescore.provider } : {}),
        ...(deps.rescore.precedent ? { precedent: deps.rescore.precedent } : {}),
        ...(deps.rescore.config ? { config: deps.rescore.config } : {}),
        ...(deps.rescore.models ? { models: deps.rescore.models } : {}),
      });
    } catch {
      // Re-score is best-effort; a failure leaves `rescore` unset (the caller holds to human).
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Spec rendering + enrichment.
// ---------------------------------------------------------------------------

/** Slugify an item identity into a docs directory name. */
export function slugFor(spec: SpecDraft): string {
  const base = spec.title || spec.externalId;
  return (
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'item'
  );
}

/**
 * Render a `SpecDraft` as a proposal-shaped markdown spec: a decision record where each
 * accepted fork becomes an "Approach" section (question → recommended option + rationale).
 */
export function renderSpecMarkdown(spec: SpecDraft): string {
  const lines: string[] = [];
  lines.push(`# ${spec.title}`);
  lines.push('');
  lines.push('Status: **Auto-drafted (autonomous brainstorm — awaiting human review)**');
  lines.push('');
  lines.push(`Item: \`${spec.externalId}\``);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(spec.summary || '_No summary provided._');
  lines.push('');
  lines.push('## Design decisions');
  lines.push('');
  if (spec.decisions.length === 0) {
    lines.push('_No forks required a decision — the item was unambiguous._');
  } else {
    for (const [i, d] of spec.decisions.entries()) {
      lines.push(`### ${i + 1}. ${d.fork.question}`);
      lines.push('');
      if (d.fork.options.length > 0) {
        lines.push(`Options considered: ${d.fork.options.map((o) => `\`${o}\``).join(', ')}`);
        lines.push('');
      }
      lines.push(`**Recommendation:** ${d.recommendation} (confidence: ${d.confidence})`);
      lines.push('');
      if (d.rationale) {
        lines.push(d.rationale);
        lines.push('');
      }
    }
  }
  lines.push('---');
  lines.push('');
  lines.push(
    '_This spec was drafted autonomously. Every fork above cleared the high-confidence ' +
      'bar; any fork the system could not confidently resolve would have halted the ' +
      'brainstorm and handed that fork to a human instead._'
  );
  lines.push('');
  return lines.join('\n');
}

/** Write the rendered spec to `<docsRoot>/changes/<slug>/proposal.md`; returns the abs path. */
function writeSpecDoc(docsRoot: string, spec: SpecDraft): string {
  const dir = path.join(docsRoot, 'changes', slugFor(spec));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'proposal.md');
  fs.writeFileSync(file, renderSpecMarkdown(spec), 'utf-8');
  return file;
}

/**
 * Produce an enriched `Issue` whose description carries the drafted spec's substance, so the
 * re-score (SC4) reads REAL content — the resolved decisions + rationale — not the original
 * one-line length proxy. Pure over the inputs.
 */
export function enrichIssueWithSpec(issue: Issue, spec: SpecDraft): Issue {
  const decisionText = spec.decisions
    .map((d) => `${d.fork.question} → ${d.recommendation}. ${d.rationale}`)
    .join('\n');
  const enrichedDescription = [issue.description ?? '', decisionText].filter(Boolean).join('\n\n');
  return {
    ...issue,
    description: enrichedDescription,
    // The item now HAS a drafted spec — reflect it so the re-score's spec-exists signal is true.
    spec: issue.spec ?? `changes/${slugFor(spec)}/proposal.md`,
  };
}
