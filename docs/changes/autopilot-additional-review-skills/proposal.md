---
title: 'harness-autopilot: project-declared additional review skills'
status: draft
tier: low
roadmap: autopilot-additional-review-skills
external-id: github:Intense-Visions/harness-engineering#1481
keywords: autopilot, review, final-review, config, review.additionalSkills, domain-reviewer
---

> **Superseded (2026-08-25, PR #1485).** Before merge, the narrow
> `review.additionalSkills` seam described below was **generalized** into the
> top-level `skillHooks` cross-skill lifecycle-hook framework, and the
> `review.additionalSkills` field was **removed** (it never shipped). The
> acceptance criteria that reference `review.additionalSkills` are **historical**
> and no longer parse — the equivalent config is now
> `skillHooks["harness-autopilot"]["after:REVIEW"]` and `["after:FINAL_REVIEW"]`.
> For the shipped design see `docs/reference/configuration.md` (the `skillHooks`
> section) and the `skill-lifecycle-hooks` changeset.

## Overview

`harness-autopilot`'s `REVIEW` and `FINAL_REVIEW` states hardcode a single
reviewer — `subagent_type: "harness-code-reviewer"`. The generic reviewer is good
at generic findings, but the risks that actually sink a given project are usually
domain-shaped (e.g. a detector for vacuous, false-green tests). There is no
supported way to put a project's own detector in the autopilot review loop.

Harness personas already model "a role composes several skills" one layer up; this
spec reuses that spirit but exposes an explicit **config seam** so autopilot can
consult it.

## Decision (answered in CONFIRM — not re-litigated here)

- **Declaration surface:** a new optional config field
  `review.additionalSkills: string[]` in `harness.config.json`.
- **Where they run:** the extra reviewers run at **both `REVIEW` and
  `FINAL_REVIEW`**, alongside (never replacing) the built-in
  `harness-code-reviewer`.

## Root-cause / gap confirmation

- `agents/skills/claude-code/harness-autopilot/SKILL.md` — the Persona Agents
  table maps `REVIEW, FINAL_REVIEW` to the single fixed `harness-code-reviewer`;
  the state definitions dispatch only that reviewer.
- `packages/cli/src/config/schema.ts` — `ReviewConfigSchema` carries only
  `model_tiers`; a grep for `additionalSkills` / `reviewSkills` on main returns
  nothing. The seam does not yet exist.

## Observable Truths (Acceptance Criteria)

1. `review.additionalSkills` is an optional `string[]` in the harness config
   schema, validated (non-empty strings) and defaulting to `[]`.
2. A config with no `review` block, or an empty `additionalSkills`, parses and
   preserves today's exact single-reviewer behavior (no regression).
3. A config declaring `additionalSkills: ["canary-cassandra"]` round-trips
   through the schema unchanged.
4. Non-string / empty-string entries are rejected by validation.
5. The `harness-autopilot` SKILL.md documents the seam and wires each declared
   skill into **both** `REVIEW` and `FINAL_REVIEW`, alongside the mandatory
   baseline reviewer.
6. The SKILL.md states that a declared-but-unresolvable skill is a review
   **failure, not a silent skip** (false-green guard).
7. `docs/reference/configuration.md` documents the new field.

## Non-goals

- Swapping out or disabling the baseline `harness-code-reviewer` (additive only).
- A per-state `when` selector — the decision fixed the answer to "both", so no
  `when` field is introduced.
- Implementing dispatch inside TypeScript: autopilot is a prose-driven skill, so
  the wiring lives in its SKILL.md; the schema is the code surface.
