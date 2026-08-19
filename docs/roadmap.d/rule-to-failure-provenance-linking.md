---
slug: "rule-to-failure-provenance-linking"
milestone: "v5.0 — Enforcement Hardening"
order: 14
---

### Rule-to-failure provenance linking

- **Status:** planned
- **Spec:** docs/knowledge/decisions/0100-rule-to-failure-provenance.md
- **Summary:** Adopt the community harness-engineering field's #1 habit (OpenAI/Osmani/AGENTS.md) — link every enforced constraint to the incident that birthed it, so the harness can explain why each rule exists and detect dead rules. Today `harness-compound` writes post-mortems to `docs/solutions/**` and gates/linters enforce rules, but the two are **not linked** (grep for provenance across `packages/core/src` = 0 hits), so the constraint set only ever grows. **Scope if pursued:** (1) Extend the solution frontmatter Zod schema (`packages/core/src/solutions/schema.ts`, human copy `docs/solutions/references/schema.yaml`) with an optional `enforces: string[]` — rule ids a fix produced/hardened (e.g. `strength-002-autobaseline`, `arch:no-cross-package-import`, `sec:INJ-REROL-003`). (2) Add an optional `origin` field to the `StrengthRule` type + modules (`packages/core/src/harness-strength/rules/`); for generated baseline-JSON rules (`.harness/arch/baselines.json`, `.harness/security/`, coverage/benchmark baselines) store provenance in a sidecar map keyed by rule id rather than mutating generated files. (3) Ship a `harness rules provenance` reverse-index reporter that joins both sides and flags (a) "unexplained constraint" = enforced rule with no origin, and (b) "candidate dead rule" = origin solution resolved/obsolete AND failure class shows no recent recurrence. (4) Update the `harness-compound` capture phase to prompt for `enforces:` when a fix landed an enforcement change. **Acceptance:** reporter runs in CI advisory-only (never blocks); new `compound` docs can declare `enforces`; a rule missing `origin` never fails a build; existing rules stay valid with empty provenance (fill-forward — no bulk retrofit required). **Design constraints:** advisory metadata only, authority stays where it is; directly counters the `strength-004-empty-thresholds` / rule-sprawl failure mode by giving the constraint set a shrink path. **Dependencies:** none. **Source analysis:** docs/architecture/harness-ecosystem-pattern-adoption/analysis.md.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** —
</content>
