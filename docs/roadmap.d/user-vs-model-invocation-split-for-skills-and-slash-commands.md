---
slug: "user-vs-model-invocation-split-for-skills-and-slash-commands"
milestone: "Intake"
order: 50
---

### User-vs-model invocation split for skills and slash commands

- **Status:** planned
- **Spec:** —
- **Summary:** Wave 1 of ADR-0133 (mattpocock/skills technique adoption). Add an `invocation: user | model` field to skill.yaml (schema in packages/cli/src/skill/schema.ts) and render it per host: Claude Code commands emit `disable-model-invocation: true` for user-invoked skills (render-claude-code.ts), Codex emits the equivalent implicit-invocation policy (render-codex.ts), Cursor/Gemini get the closest available mapping or a documented no-op. Today 0 of the 89 generated `.claude-plugin/commands/*.md` opt out, so every command description is always-loaded context (24.6k chars total, measured at 91f09fd17, vs a reported 2.3k for mattpocock's 11 model-invoked skills [UNVERIFIED]). Default rule to encode, from mattpocock's SKILL-MECHANICS.md [UNVERIFIED]: model-invocation only when the agent must reach the skill on its own, or another skill must; otherwise user-invoked and zero context load. Deliverables: schema field + default (model, for backward compat), renderer support across all four platform trees, an initial classification pass over the 89 tier-1/2 commands (orchestrators like fleets, autopilot, strategy, onboarding are user-invoked candidates), a composition rule that user-invoked skills may call model-invoked ones but not each other (validator check), and before/after always-loaded char counts as the success metric. Constraint: `harness` router and search_skills discovery must still reach user-invoked skills. Analysis: docs/architecture/mattpocock-skills-comparison/analysis.md §2.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#2240
