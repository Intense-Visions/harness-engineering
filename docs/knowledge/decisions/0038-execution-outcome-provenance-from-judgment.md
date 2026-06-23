---
number: 0038
title: execution_outcome provenance from a judgment skill
date: 2026-06-22
status: accepted
tier: large
source: docs/changes/outcome-eval/proposal.md
---

## Context

`execution_outcome` nodes have historically recorded task-execution results
(success/failure of an agent completing an issue), consumed by
`effectiveness/scorer.ts` to compute per-(persona, system) effectiveness.
outcome-eval is a new producer of `execution_outcome` nodes: it records a
spec-satisfaction _judgment_, not a task execution. The effectiveness loop now
depends on verdicts compounding into baselines, and dropped verdicts cannot be
backfilled.

## Decision

Every `OutcomeEvaluator.evaluate()` persists exactly one `execution_outcome`
node via the existing `ExecutionOutcomeConnector`, tagged with
`metadata.source: 'outcome-eval'` plus the full 3-valued verdict
(`verdict / confidence / judgedAgainst`). The node id carries a `randomUUID()`
so concurrent evaluations never collide under upsert-by-id. In v1 the node
OMITS `agentPersona` and writes `affectedSystemNodeIds: []`, which makes it
**scorer-non-counting** — the scorer's `gatherOutcomes` skips nodes missing
`agentPersona` or `outcome_of` edges. The verdict is therefore durable for
future analytics while not yet feeding persona effectiveness.

The connector strips a reserved-key allowlist from caller metadata before merge
so caller-supplied keys can never shadow core/scorer-read fields.

## Consequences

**Positive:** the highest-value compounding signal (did the spec get met?) is
durable from v1; no backfill debt.

**Negative:** the `INCONCLUSIVE -> result: 'failure'` mapping is a latent hazard.
It is harmless ONLY because the node is currently scorer-non-counting. Any future
change that attaches persona/affected-system attribution MUST first change
INCONCLUSIVE modeling (do not persist INCONCLUSIVE, or use a distinct result
value the scorer excludes) before turning attribution on.

**Neutral:** outcome-eval and task-execution share the `execution_outcome` node
type, disambiguated by `metadata.source`.

## Related

- [`docs/changes/outcome-eval/proposal.md`](../../changes/outcome-eval/proposal.md) Decision 4
- ADR 0037: tiered confidence-to-authority
- `packages/intelligence/src/outcome/connector.ts`, `effectiveness/scorer.ts`
