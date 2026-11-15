---
number: 0136
title: Advisory skill families attach at a review moment by mirroring the review-hook resolver, not by extending the review fan-out
date: 2026-11-13
status: accepted
tier: medium
source: docs/changes/auto-wire-craft-at-review/proposal.md
---

## Context

Harness had exactly one way to add a reviewer at a review moment: the `skillHooks` framework,
plus the canary detector resolver (`packages/core/src/hooks/canary-review-hooks.ts`) layered
on top of it as a zero-config default. The eleven `-craft` skills needed the same attachment,
and there were two ways to build it.

The rejected alternative was to extend the existing review fan-out. `ConditionalSubagent`
(`packages/core/src/review/depth-calibrator.ts:16`) is the union of conditionally-activated
reviewers — today `'adversarial' | 'typescript-strict' | 'frontend-races'`. It is consumed by
`fan-out.ts` (`ConditionalAgentResult.subagent`, `:74`), by `pipeline-orchestrator.ts:314`, and
it is mirrored member-for-member by `ReviewSubagent`
(`packages/core/src/review/types/fan-out.ts:22-31`) — the finding schema's own union, which is a
SEPARATE type rather than a consumer of this one. Adding ten craft domains to it would therefore
have meant mutating TWO unions that between them gate every review in the product, and every
consumer of both would have had to learn that some members do not count toward severity. Craft
output is ADVISORY — surfaced, never blocking, never counted (spec D2). Advisory output does not
justify mutating the code that gates every review.

Measured while writing this record, and worth stating because the spec assumed otherwise: NO ADR
DECIDES the canary resolver this decision mirrors. No ADR body names
`resolveReviewHooksWithCanary` at all. The three ADRs that mention canary are 0039
(cross-ecosystem adapter), 0086 (results from a documented artifact) and 0111 (e2e framework),
none of them about review-hook wiring; 0111 does name the file
`packages/core/src/hooks/canary-review-hooks.ts` twice (`:42`, `:172`), but only as an inventory
item in a list of what canary already integrates, inside a decision about the e2e testing
framework. And `docs/changes/canary-review-detectors/` holds `plans/` and `provenance.json` but
no `proposal.md`. The shape being mirrored here therefore shipped with no spec and no decision
record. This record is the first, which is also why the D5 note below lands here rather than as
the amendment the spec directed.

## Decision

Mirror the canary resolver. `packages/core/src/hooks/craft-review-hooks.ts` is a direct sibling
of `canary-review-hooks.ts`: pure, IO-free, inert until a host calls it. It publishes
`CRAFT_REVIEW_DOMAINS` (the domain table), `planCraftReviewDomains` (the diff-driven,
capability-gated activation plan) and `resolveReviewHooksWithCraft` (the resolver a host calls
in place of `resolveSkillHooks`). Dispatch stays in the consuming skills' prose; the module only
normalizes and resolves.

The no-regression guarantee is the contract that makes the mirror safe:
`resolveReviewHooksWithCraft` with no craft domain activated returns exactly
`resolveSkillHooks(...)`. A project that installs no craft skill, or whose diff touches nothing
a domain owns, gets byte-identical behaviour to before this feature existed.

NOTE — D5, the multi-host generalization, recorded here rather than as its own record. The
canary twin hardcodes a single host: `CANARY_REVIEW_HOST_SKILL = 'harness-autopilot'`
(`canary-review-hooks.ts:79`), consulted at `:214` as `if (skillName !== CANARY_REVIEW_HOST_SKILL)
return configured;`. Craft generalizes that constant to a set: `CRAFT_REVIEW_EVENTS_BY_HOST`
(`craft-review-hooks.ts:141`), a host -> events map, so `harness-autopilot` (at `after:REVIEW`
and `after:FINAL_REVIEW`) and `harness-code-review` (at `after:mechanical`) are both first-class
and a third host is a map entry. Autopilot-only would have missed interactive and CI review —
and UI work, the motivating case, often does not run through autopilot.

The spec (D5) directed this as an amendment paragraph to "the canary-hook ADR". There is no such
ADR; see the measurement in Context. Recording it as a named note inside the record that DOES
describe the resolver shape follows the precedent set by ADR 0135, which documents a relocation
"as a note here rather than as a second ADR".

## Consequences

- Every future advisory skill family attaches the same way: a sibling module in
  `packages/core/src/hooks/`, a resolver that returns exactly `resolveSkillHooks(...)` when
  nothing activates, and a host that calls it alongside the hooks it already resolves. The
  review fan-out and its severity accounting are untouched, so adding a family cannot change
  what a review blocks on.
- The cost is two resolvers with parallel structure that must not drift. Phase 4 already paid
  down the first instance of that drift by extracting the shared skill-availability module
  both resolvers now use, removing a byte-identical triple of private helpers and an
  unreachable predicate clause.
- Because craft never enters `ConditionalSubagent`, a craft finding can never be mistaken for
  a blocking reviewer finding by a consumer that only knows the union. The corollary obligation
  is on the hosts: `harness-code-review`'s SKILL.md states that craft findings must never enter
  the mechanical exclusion set, because a craft taste judgment at `file:line` discarding a real
  reviewer finding at the same `file:line` would be a false green manufactured by this wiring.
- A third host is now a map entry rather than a code change, which is the point of the D5 note.

## References

- `docs/changes/auto-wire-craft-at-review/proposal.md` — the spec (D2 advisory, D5 multi-host,
  D6 the mirror).
- `packages/core/src/hooks/craft-review-hooks.ts` — `CRAFT_REVIEW_EVENTS_BY_HOST` (`:141`),
  `CRAFT_REVIEW_DOMAINS` (`:304`), `planCraftReviewDomains`, `resolveReviewHooksWithCraft`.
- `packages/core/src/hooks/canary-review-hooks.ts` — the mirrored twin;
  `CANARY_REVIEW_HOST_SKILL` (`:79`) and its single-host guard (`:214`).
- `packages/core/src/review/depth-calibrator.ts:16` and
  `packages/core/src/review/types/fan-out.ts:22-31` — the two unions the rejected alternative
  would have had to mutate.
- ADR 0135 — the precedent for recording a second decision as a named note inside one record.
