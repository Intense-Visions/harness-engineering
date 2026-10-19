---
slug: "skill-content-lint-canonical-call-phrasing-and-size-negation-disclosure-baselines"
milestone: "Intake"
order: 52
---

### Skill-content lint: canonical call phrasing and size, negation, disclosure baselines

- **Status:** planned
- **Spec:** —
- **Summary:** Wave 1 of ADR-0133. The skill validator (packages/cli/src/commands/skill/validate.ts:35-56) is additive only: it requires an h1 plus BEHAVIORAL_REQUIRED_SECTIONS and RIGID_SECTIONS, and checks nothing about size, density or redundancy, so it mechanically drives sediment. Measured at 91f09fd17: tier-1/2 SKILL.md median 244 lines (p90 534, max 1,149) vs mattpocock's reported under 100 [UNVERIFIED]; negation density 4.2% (1,128 of 26,908 lines across the 90 tier-1/2 files, `grep -cE "NOT|Never|STOP|Do not|Don't"`, case-sensitive) vs mattpocock's reported 2.8% [UNVERIFIED], a 1.5x ratio; 5 of 793 skills use sibling reference files for progressive disclosure; cross-skill calls use at least five phrasings ("invoke `/harness:autopilot`", "Run `/harness:planning`", "transition to harness-autopilot", "invoke harness-planning", "Invoke `harness-soundness-review`"). mattpocock standardized a single form [UNVERIFIED] ("Call the Skill tool with \\"x\\"") after finding that bare slash mentions don't reliably load the skill. Deliverables: (1) BLOCKING: one canonical cross-skill invocation phrasing, mechanically checked, with a codemod for existing skills across all four platform trees; (2) REPORT-ONLY ratcheted per-skill baselines: body lines by tier, negation-line density (publishing the exact pattern and case sensitivity it measures, since the figure is highly pattern-sensitive: 4.1%-14.4% across plausible variants of the same intent), and disclosure ratio (body vs sibling reference files), so regressions surface in CI without blocking; (3) a `harness skill lint --report` view ranking the worst offenders; (4) an update to harness-skill-authoring describing progressive disclosure ("inline what every branch needs, push behind a pointer what only some branches reach"). The thresholds stay report-only until the wave-3 skill-behavior eval harness supplies evidence. Analysis: docs/architecture/mattpocock-skills-comparison/analysis.md §3-4.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#2242
