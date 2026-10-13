---
slug: "skill-behavior-eval-harness-trigger-accuracy-and-fixture-outcomes"
milestone: "Intake"
order: 57
---

### Skill-behavior eval harness: trigger accuracy and fixture outcomes

- **Status:** planned
- **Spec:** —
- **Summary:** Wave 3 of ADR-0133. Neither harness nor mattpocock/skills measures skill *behavior*. Harness measures adoption (adoption.jsonl, catalog-retrospective, trust scoring); mattpocock says "There is no automated eval." As a result, every authoring decision runs on judgment, including whether the negation-density threshold should block and whether the mandatory Rationalizations/Red-Flags framing (docs/architecture/agent-skills-comparative/ADR-001.md) helps or hurts. mattpocock argues that prohibitions make the forbidden behavior more available. Deliverables: (1) trigger-accuracy evals: a labeled prompt set mapped to the expected skill (or none), run against the rendered model-invoked descriptions per host, reporting precision/recall and confusions; this guards the description-budget work against routing regressions; (2) outcome evals: small fixture repos and tasks per tier-1/2 workflow skill (e.g. debugging finds a seeded bug via a repro command; tdd writes seam-level tests), scored by deterministic checks first, with an LLM judge only where needed; (3) A/B mode: run the same fixtures against two skill variants (e.g. Red-Flags section vs positive phrasing) and report significance, reusing packages/stats SPRT; (4) a CI-optional, cost-bounded runner with cached results and no-credential degradation (the comprehension-substrate rule: CI never requires an API token); (5) the first decision it must settle: promote the report-only lint thresholds to blocking, or drop them. Blocked by the content lint and description-budget items (it evaluates their output). Serves the Compounding feedback loops track. Analysis: docs/architecture/mattpocock-skills-comparison/analysis.md §3, §8.
- **Blockers:** Skill-content lint: canonical call phrasing and size\, negation\, disclosure baselines, Trigger-phrased skill descriptions with an always-loaded context-cost budget
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#2249
