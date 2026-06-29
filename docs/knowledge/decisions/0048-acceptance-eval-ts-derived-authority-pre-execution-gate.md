---
number: 0048
title: TS-derived authority extended to a pre-execution acceptance gate
date: 2026-06-26
status: accepted
tier: large
source: docs/changes/harness-pm-persona/proposal.md
---

## Context

outcome-eval established that a judgment skill's merge `authority` is computed in
TypeScript from `(verdict, confidence)` and NEVER read from the LLM (ADR 0037,
tiered confidence-to-authority). acceptance-eval introduces the same discipline
at the OTHER end of the lifecycle — a PRE-execution gate over spec measurability,
before any work begins. The question (D3): should a pre-execution gate inherit
the TS-derived-authority contract, or may the LLM assert blocking/advisory for a
spec it just judged?

## Decision

acceptance-eval derives `authority` in TypeScript via `deriveAcceptanceAuthority(measurability, confidence)`,
identical in spirit to outcome-eval's `deriveAuthority`. The LLM returns only
`measurability / confidence / criteriaFindings / coverageFindings / rationale`;
`authority` is omitted from `acceptanceVerdictSchema` and computed after parse.
The gate is `blocking` IFF `measurability === 'NOT_MEASURABLE' && confidence === 'high'`;
every other combination (all INCONCLUSIVE, all MEASURABLE, all medium/low
NOT_MEASURABLE) is `advisory`. Provider failure / missing section / empty
evidence degrade to INCONCLUSIVE/low/advisory and never block.

## Consequences

**Positive:** one authority-derivation contract now spans both ends of the
lifecycle (acceptance before, outcome after); the gate cannot be talked out of
blocking by a model. Conservative confidence avoids taste-blocks-merge false
positives.

**Negative:** the pre-execution gate can only block on high-confidence
NOT_MEASURABLE; weak-but-present criteria pass as advisory by design.

**Neutral:** acceptance-eval reuses outcome-eval's `Confidence`/`JudgedAgainst`/
`Authority` types and section resolver rather than forking them.

## Related

- ADR 0037: tiered confidence-to-authority
- ADR 0038: execution_outcome provenance from a judgment skill
- [`docs/changes/harness-pm-persona/proposal.md`](../../changes/harness-pm-persona/proposal.md) Decision D3
- `packages/intelligence/src/acceptance-eval/authority.ts`, `packages/cli/src/mcp/tools/acceptance-eval.ts`
