---
'@harness-engineering/types': minor
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Rule-to-failure provenance linking (ADR 0100) — link every enforced constraint to the
incident that motivated it.

Additive, optional, and advisory by design: nothing gates on it, and every existing
document and rule stays valid with no provenance (fill-forward).

- `@harness-engineering/types` + `@harness-engineering/core`: optional `enforces?: string[]`
  on the solution-doc frontmatter (`SolutionDocFrontmatter` / `SolutionDocFrontmatterSchema`)
  — the rule ids a `harness-compound` solution produced or hardened.
- `@harness-engineering/core`: optional `origin?: string` on the `StrengthRule` type (the
  reciprocal back-pointer to a solution slug or issue ref), plus a new `provenance` module
  (`buildProvenanceReport`, `collectSolutionEnforcements`) that joins the two sides.
- `@harness-engineering/cli`: `harness rules provenance` — an advisory reporter that flags
  unexplained constraints (enforced rules with no origin) and candidate dead rules (a rule
  whose origin resolves to no known solution, or a solution enforcing a STRENGTH id absent
  from the registry). Never exits non-zero on findings; supports `--json`.
- Producer wiring (ADR 0100 Action Item #4): the `harness-compound` capture phase (Phase 4
  ASSEMBLE, all platform mirrors) now captures the optional `enforces:` list when a fix
  produced or hardened an enforced rule — advisory, fill-forward, never blocks capture. The
  resolution template and human schema mirror document the field.
