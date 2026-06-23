---
number: 0037
title: Tiered confidence-to-authority for outcome-eval
date: 2026-06-22
status: accepted
tier: large
source: docs/changes/outcome-eval/proposal.md
---

## Context

The harness has rule-based floors and craft-pipeline ceilings plus pre-execution
simulation (PESL), but no post-execution check answering the binary question
"did the code actually do what the spec said?" — the roadmap's named #1 gap.
outcome-eval introduces that judgment. The open question: what authority should a
judgment-based verdict carry? A hard gate would let one over-cautious verdict
stall every PR; advisory-only would fail the v5.0 "Load-Bearing Harness"
milestone's "required check" intent.

## Decision

Authority is tiered on confidence and **derived in TypeScript, never supplied by
the LLM**. `deriveAuthority(verdict, confidence)` returns `blocking` iff
`verdict === 'NOT_SATISFIED' && confidence === 'high'`; every other combination
— including all `INCONCLUSIVE` and `SATISFIED` cases and all medium/low
`NOT_SATISFIED` — is `advisory`. The LLM returns only
`verdict / confidence / rationale / unmetCriteria`; `verdictSchema` is `.strict()`
so an injected `authority` key is rejected at parse time
(`packages/intelligence/src/outcome-eval/authority.ts`,
`evaluator.ts:90`). This is the harness's **first blocking LLM-judgment gate**
and establishes the precedent that judgment authority is a pure TS function of a
structured verdict, not a value the model can assert.

## Consequences

**Positive:** load-bearing (a confident, specific failure stops ship) while
false-positive-safe (only high-confidence failures block; the conservative
prompt biases toward medium). The blocking seam is unit-testable in TS, isolated
from prompt drift.

**Negative:** a genuinely-broken change held at medium confidence ships with only
an advisory flag — calibration of the prompt's high-confidence bar is now
load-bearing.

**Neutral:** the precedent ("authority is TS-derived") constrains every future
LLM-judgment gate to the same shape.

## Related

- [`docs/changes/outcome-eval/proposal.md`](../../changes/outcome-eval/proposal.md) Decision 1
- ADR 0038: execution_outcome provenance from a judgment skill
- `agents/skills/claude-code/security-craft/SKILL.md` — conservative-confidence precedent
