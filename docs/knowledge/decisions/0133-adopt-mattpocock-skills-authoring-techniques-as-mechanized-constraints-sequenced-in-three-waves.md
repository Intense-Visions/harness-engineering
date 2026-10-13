---
number: 0133
title: Adopt mattpocock/skills authoring techniques as mechanized constraints, sequenced in three waves
date: 2026-10-13
status: accepted
tier: medium
source: docs/architecture/mattpocock-skills-comparison/proposal.md
---

## Context

A technique-level comparison of mattpocock/skills (v1.3.1 @ 49dd158d, MIT) against harness (docs/architecture/mattpocock-skills-comparison/analysis.md) found harness categorically stronger as a system (enforcement, state, verification, graph, orchestration, review depth) and mattpocock/skills stronger as a skill-authoring practice. Measured gaps: harness's always-loaded command descriptions total 25.8k chars across 89 commands vs 2.3k across 11 model-invoked skills; 0 of 89 harness commands use `disable-model-invocation` or "Use when" trigger phrasing; tier-1/2 SKILL.md median is 239 lines vs under 100; negation density is 6.7% vs 2.8%; `packages/cli/src/commands/skill/validate.ts` only requires sections and checks no size/density; harness keeps no record of rejected ideas. Five per-skill techniques have no harness counterpart: a reproduction-command gate in debugging, seam negotiation in TDD, vertical-slice planning, a durable project glossary, and a deep-module vocabulary. Neither system measures skill behavior. mattpocock's "prompt the positive" principle conflicts with the mandatory Rationalizations/Red-Flags framing adopted in docs/architecture/agent-skills-comparative/ADR-001.md; no evidence exists either way. A prior feature-level pass (docs/ideation/external-source-feature-matrix-2026-08-10.md) already filed frontier-round interviews; it is excluded here.

## Decision

Adopt Option C (sequenced hybrid): enforce mattpocock's authoring discipline mechanically, rather than as prose, and transplant the strongest per-skill techniques via progressive disclosure so bodies do not grow.

Wave 1: (1) user-vs-model invocation split in skill.yaml rendered per host; (2) trigger-phrased descriptions plus an always-loaded context-cost budget as a ratcheted baseline; (3) skill-content lint (canonical cross-skill call phrasing; size/negation/disclosure as report-only); (4) out-of-scope rejected-idea records checked by ideation, triage, and skill proposals; (5) reproduction-command gate in harness-debugging; (6) seam negotiation in harness-tdd; (7) vertical-slice slicing in harness-planning. Wave 2: (8) durable project glossary read by pipeline skills; (9) deep-module vocabulary as shared architecture reference. Wave 3: (10) skill-behavior eval harness (trigger accuracy + fixture outcomes) that decides whether the negation-density threshold becomes blocking and whether the mandatory Rationalizations/Red-Flags framing from the agent-skills ADR is kept.

Alternatives considered: Option A (mechanize the whole catalog including the eval harness up front) was rejected as gating cheap wins behind the largest item; Option B (per-skill transplants only) was rejected because it grows already-long skills and does not compound to future skill authors. Bulk-importing mattpocock skills was ruled out at discovery (sprawl is the stated regret condition).

## Consequences

Positive: measurable reduction in per-turn context cost for every adopter session; future skills inherit the discipline with no reviewer attention (Harness Coverage KPI); debugging/TDD/planning gain gates and vocabulary they currently lack; rejected ideas stop being re-proposed (this session itself rediscovered a forgotten prior pass on the same repo).

Negative: one-time rewrite of 89 command descriptions and baselining of tier-1/2 bodies (mitigated by ratcheting, not blocking); lint thresholds are unproven until wave 3 (mitigated by report-only mode); ten roadmap items need sequencing (mitigated by wave labels and blocked_by edges).

Neutral: the existing Rationalizations/Red-Flags mandate stays in force until the wave-3 eval produces evidence. Each item is built spec-first through harness-brainstorming then harness-autopilot.

Action items: file the ten roadmap items (Intake lane) with wave-ordering edges; brainstorm wave-1 items first.
