---
number: 0002
title: Shift-left integration design into brainstorming and planning
date: 2026-04-27
status: accepted
tier: large
source: docs/changes/integration-phase/proposal.md
---

## Context

Integration work -- barrel exports, skill registration, documentation updates, ADR authoring -- was historically discovered at the end of the workflow, after code was already written and verified. This late discovery made integration feel like bureaucracy rather than intentional design, and problems caught at the end were more expensive to fix.

The question was whether to add a post-execution discovery phase that identifies integration gaps, or to shift integration thinking earlier into brainstorming and planning so the integration phase becomes a verification gate rather than a discovery phase.

## Decision

Integration design is shifted left into brainstorming and planning. The integration phase (INTEGRATE) is a verification gate, not a discovery phase.

- **Brainstorming** produces an "Integration Points" section in every spec, defining: entry points affected, registrations needed, documentation updates, architectural decisions warranting ADRs, and knowledge impact.
- **Planning** derives integration tasks from the spec's Integration Points section. These tasks are tagged `category: "integration"` and appear alongside implementation tasks in the plan.
- **INTEGRATE phase** (between VERIFY and REVIEW) mechanically verifies that planned integration tasks completed. It does not discover new integration work -- it confirms what was planned.

This follows decision D2 from the integration phase proposal.

## Consequences

**Positive:**

- Integration is intentional and plannable rather than an afterthought discovered during late-stage checking.
- Problems are caught at spec review time (brainstorming) rather than after implementation, when fixes are cheaper.
- The INTEGRATE phase is fast and mechanical because it only verifies planned outcomes rather than exploring for gaps.
- Specs become more complete by requiring authors to think about system connectivity upfront.

**Negative:**

- Brainstorming specs require an additional section (Integration Points), adding work to the spec-writing process.
- Planning must derive integration tasks from the spec, adding complexity to the planning skill.
- If the spec's Integration Points section is incomplete, the INTEGRATE phase will pass but real integration gaps will remain undetected.

**Neutral:**

- The WIRE sub-phase still runs default checks (barrel exports, validate) regardless of what was planned, providing a safety net for the most common wiring issues.
- Existing specs without an Integration Points section are not retroactively affected -- the requirement applies to new specs going forward.
