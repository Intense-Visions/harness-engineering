---
slug: "trigger-phrased-skill-descriptions-with-an-always-loaded-context-cost-budget"
milestone: "Intake"
order: 51
---

### Trigger-phrased skill descriptions with an always-loaded context-cost budget

- **Status:** planned
- **Spec:** —
- **Summary:** Wave 1 of ADR-0133. Rewrite model-invoked skill descriptions from capability summaries into when-to-reach trigger phrasing ("Use when the user wants…, mentions…, or …"), and make it mechanical. Today 0 of 89 command descriptions use trigger phrasing; measured at 91f09fd17 the median is 202 chars and the longest is 1,458 (e.g. acceptance-eval's description explains TypeScript authority derivation, which helps no routing decision). Figures count the frontmatter `description:` value with the key prefix excluded; see docs/architecture/mattpocock-skills-comparison/analysis.md §2 for the method. mattpocock principle [UNVERIFIED]: "The pointer's wording, not its target, decides when the agent reaches the material" and "Every word of an always-loaded pointer costs on every turn, so it earns even harder pruning than the body." Deliverables: (a) a validator rule for model-invoked skills requiring a trigger clause and a per-description char ceiling; (b) a whole-catalog always-loaded cost metric (sum of model-invoked description chars, plus token estimate) recorded as a ratcheted baseline that may only go down, surfaced by `harness skill validate` and CI; (c) a one-time rewrite of the tier-1/2 descriptions, keeping capability detail in the SKILL.md body; (d) user-invoked skills get short human-facing one-liners with trigger lists stripped. Blocked by the invocation split, since the budget counts only model-invoked entries. Success metric: always-loaded description chars reduced by at least 50% from the measured 24.6k baseline with no drop in the harness router's dispatch accuracy (spot-check prompts until the wave-3 eval harness exists). Analysis: docs/architecture/mattpocock-skills-comparison/analysis.md §2.
- **Blockers:** User-vs-model invocation split for skills and slash commands
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#2241
