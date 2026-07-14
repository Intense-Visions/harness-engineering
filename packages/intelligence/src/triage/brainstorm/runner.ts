// packages/intelligence/src/triage/brainstorm/runner.ts
//
// Roadmap Auto-Triage — Phase 2, Task 3: the pure autonomous-brainstorm decision core.
//
// `runAutoBrainstorm` drives forks from an injected `ForkGenerator` up to a `DepthBudget`,
// auto-accepting a fork ONLY when its confidence is `'high'` (after the generator's own
// self-consistency downgrade), else HALTING at that fork and handing it to a human. On a
// clean run it accumulates the accepted decisions into a proposal-shaped `SpecDraft`.
//
// The three load-bearing invariants (Task 0 spike directives):
//   1. `confidence === 'high'` is the ONLY auto-accept (mirror `derive-tier.ts` — uncertainty
//      escalates, never green-lights). `medium`/`low` ⇒ halt.
//   2. The function is TOTAL: a throwing/rejecting generator maps to `halted{ reason:'error' }`,
//      never a throw, never a spec (SC5). A false `completed` is the dangerous error; a false
//      `halted` only costs a human glance — so we bias hard toward halting.
//   3. Overconfidence hardening (self-consistency N-sampling) is the GENERATOR's contract: it
//      forces `confidence:'low'` when the recommendation flips across samples. The runner just
//      reads the (already-downgraded) enum — which keeps the halt behavior exhaustively
//      testable with a stub that reports a flip. See `brainstorm-wiring.ts` for the real
//      N-sampling generator.
//
// Pure: no live model, no IO, no GraphStore. The generator is the only seam.

import type {
  BrainstormInput,
  BrainstormOutcome,
  DepthBudget,
  ForkDecision,
  ForkGenerator,
  SpecDraft,
} from './types.js';

/**
 * Drive an autonomous brainstorm for one item. Returns exactly one `BrainstormOutcome`
 * (SC1): `completed{ spec }` when every explored fork was confidently recommended, or
 * `halted{ fork, reason }` at the first fork it couldn't. NEVER throws (SC5).
 *
 * @param input     the item identity + text + Phase-1 level
 * @param generator the injected fork-decision seam (the thing that calls the model)
 * @param depth     the bounded fork budget (SC3 — scaled from the complexity level upstream)
 */
export async function runAutoBrainstorm(
  input: BrainstormInput,
  generator: ForkGenerator,
  depth: DepthBudget
): Promise<BrainstormOutcome> {
  const accepted: ForkDecision[] = [];
  // The budget is a CEILING (never a required count): the loop stops at the first of
  // (a) generator exhaustion (`null`), (b) a non-high fork (halt), or (c) maxForks reached.
  const ceiling = Math.max(0, depth.maxForks);

  for (let index = 0; index < ceiling; index++) {
    let decision: ForkDecision | null;
    try {
      decision = await generator.next(index, accepted);
    } catch (err) {
      // SC5: any generator error/timeout ⇒ a halt to a human, never a spec, never a throw.
      // We synthesize a legible fork so the handoff still names *where* it stopped.
      return {
        kind: 'halted',
        fork: { id: `fork-${index}`, question: 'brainstorm errored before deciding', options: [] },
        reason: 'error',
        detail: errMsg(err),
      };
    }

    // The generator signals "no more forks — done" with `null`: complete cleanly.
    if (decision === null || decision === undefined) break;

    // The gate: `high` is the ONLY value that auto-accepts. Confidence is a conservative
    // INPUT, never authority — anything short halts at this fork (SC2, the no-go trigger).
    if (decision.confidence !== 'high') {
      return {
        kind: 'halted',
        fork: decision.fork,
        reason: 'low-confidence',
        detail:
          `fork '${decision.fork.id}' recommended '${decision.recommendation}' at ` +
          `confidence '${decision.confidence}' (below the 'high' bar) — ${decision.rationale}`,
      };
    }

    accepted.push(decision);
  }

  // Clean completion: accumulate the accepted decisions into a proposal-shaped spec draft.
  const spec: SpecDraft = {
    externalId: input.externalId,
    title: input.title,
    summary: input.summary,
    decisions: accepted,
  };
  return { kind: 'completed', spec };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
