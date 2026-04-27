---
number: 0001
title: Tiered integration rigor
date: 2026-04-27
status: accepted
tier: large
source: docs/changes/integration-phase/proposal.md
---

## Context

The harness workflow produces verified code through brainstorming, planning, execution, and verification phases. However, integration -- ensuring features are properly wired into the system, documented, and discoverable -- was not systematically verified. A single integration rigor level for all changes would be disproportionate: a typo fix does not warrant an ADR, while a new package absolutely should have one.

The question was whether to apply a uniform integration gate to all changes or to scale integration requirements proportionally to change size.

## Decision

Integration rigor is tiered into three levels -- small, medium, and large -- estimated at plan time and confirmed from execution results, with the higher tier winning any conflict.

- **Small** (bug fix, config change, fewer than 3 files, no new exports): Wiring checks only. Barrel export verification and `harness validate` always run.
- **Medium** (new feature within existing package, new exports, 3-15 files): Wiring checks plus project updates (roadmap sync, changelog verification, knowledge graph enrichment).
- **Large** (new package, new skill, new public API surface, architectural change): Wiring checks plus project updates plus knowledge materialization (ADR authoring, documentation updates, full graph enrichment).

The tier is set by the planner during plan creation and re-derived after execution from actual git diff signals (new packages, new public exports, files changed). The effective tier is `max(planned, derived)` to prevent under-classification when scope creeps during execution.

## Consequences

**Positive:**

- Proportional effort matches how real projects work. Small changes pass integration quickly with only default wiring checks.
- Large changes are forced to produce durable knowledge artifacts (ADRs, documentation, graph nodes) that benefit future development.
- Dual-estimate classification catches scope creep -- if execution produces more changes than planned, the tier escalates automatically.

**Negative:**

- Planner must estimate the tier during planning, adding a small cognitive overhead to plan creation.
- Tier escalation during execution may surprise the developer with additional integration requirements.

**Neutral:**

- The WIRE sub-phase always runs its default checks regardless of tier, providing a consistent baseline.
- Existing small changes (bug fixes) experience no additional overhead beyond the always-on barrel export and validate checks.
