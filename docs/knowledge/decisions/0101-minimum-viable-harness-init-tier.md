---
number: 0101
title: Minimum-Viable-Harness init tier — a formal "start simple" floor for adoption
date: 2026-08-19
status: proposed
tier: medium
source: docs/architecture/harness-ecosystem-pattern-adoption/analysis.md
---

## Context

Every community harness-engineering reference preaches "start simple, add complexity only
when needed" (10xChengTu), and the field defines a concrete **Minimum Viable Harness**: five
things — a repo guide (AGENTS.md), runnable local checks, one hard architectural rule, one
verification loop, and one permission boundary on what the agent may change without asking a
human (OpenAI; Augment Code).

`harness-initialize-project` already has an adoption ladder ("basic → intermediate →
load-bearing-minimum → advanced"), so the concept of tiers exists. But the skill front-loads
heavy, high-value-later steps before any enforcement lands: Phase 0 offers a 10–20 minute
STRATEGY.md interview, followed by framework confirmation (~10 options) and a design-system
step (`agents/skills/claude-code/harness-initialize-project/SKILL.md`). For an adopter who
just installed the marketplace plugin and wants the agent to stop making the same mistake,
the time-to-first-guardrail is high. This is friction precisely where the field has
standardized on a fast, minimal on-ramp — and it matters more for us than most, because our
skills are adopter-portable and must degrade gracefully.

## Decision

Formalize a **`minimal` tier** as the documented floor of the existing adoption ladder,
mapped one-to-one to the field's 5-item MVH, reachable via `harness init --tier minimal`
(and offered as the fast path in the skill's Phase 1 when the human wants to start small).

The `minimal` tier scaffolds exactly, and only:

1. **Repo guide** — a generated `AGENTS.md` via the existing `generateAgentsMap()` (we already
   validate + link-check it), kept short.
2. **One runnable local check** — a single `harness verify`-style command wired into the project.
3. **One hard architectural rule** — a single enforced arch constraint with `check-arch`
   fail-closed, baseline seeded.
4. **One verification loop** — a pre-commit (or pre-push) hook running the check above.
5. **One permission boundary** — `block-no-verify` (or an equivalent single guarded action).

STRATEGY.md, framework selection, design-system, telemetry identity, and Tier-0 MCP
integrations are **deferred, not skipped** — the tier prints an explicit, ordered upgrade path
("run `/harness:strategy` … then `harness init --tier intermediate` to add …") so nothing is
lost, only sequenced. Re-running init at a higher tier is additive over a `minimal` install.

## Alternatives Considered

- **Treat the existing "basic" level as the MVH.** Rejected as insufficient without inspection:
  "basic" is not documented as, nor guaranteed to match, the field's 5-item contract, and the
  skill still routes through the front-loaded Phase 0/framework/design steps first. The value is
  a _named, guaranteed-minimal, fast_ floor with an explicit upgrade path.
- **Just reorder init to defer STRATEGY/design.** Rejected: reordering the full flow risks the
  higher tiers losing their strategic grounding (`STRATEGY.md` deliberately runs first so
  brainstorm/ideate/roadmap-pilot are anchored). A separate minimal tier preserves that for
  adopters who want the full flow while giving a fast path to those who don't.
- **Do nothing; document the manual 5 steps.** Rejected: the field's leverage is a _turnkey_
  minimal harness; a prose checklist reintroduces the exhortation-over-enforcement gap.

## Consequences

**Positive:**

- Time-to-first-guardrail drops from a ~20-minute interview to a single scaffold command —
  matching the field's fast on-ramp and lowering adoption friction for portable installs.
- Additive upgrade path means `minimal` is a genuine floor, not a dead-end fork; nothing is lost.
- Gives us a clean answer to "isn't the harness too heavy to start?" — a standing external critique.

**Negative:**

- A `minimal` install lacks strategic grounding until upgraded — mitigated by the printed upgrade
  path and by init remaining re-runnable at a higher tier.
- One more tier to maintain and test in the init matrix.

**Neutral:**

- Existing full-flow init behavior is unchanged; `minimal` is opt-in via `--tier`.

## Related

- ADR 0100 — Rule-to-failure provenance (sibling adoption from the same analysis)
- ADR 0102 — Trajectory→eval harvesting (sibling adoption from the same analysis)
- Analysis: `docs/architecture/harness-ecosystem-pattern-adoption/analysis.md`
- `agents/skills/claude-code/harness-initialize-project/SKILL.md`; `generateAgentsMap()`

## Action Items

- [ ] Define the `minimal` tier contract (the 5 artifacts) in the init adoption-level model — owner: TBD
- [ ] Wire `harness init --tier minimal` to scaffold exactly those 5 and print the upgrade path — owner: TBD
- [ ] Add a fast-path branch in `harness-initialize-project` Phase 1 for "start minimal" — owner: TBD
- [ ] Verify re-run at a higher tier is additive over a `minimal` install — owner: TBD
