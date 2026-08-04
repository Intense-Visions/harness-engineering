---
slug: "feat-design-support-path-exclusions-for-the-design-token-drift-linter-design-exc"
milestone: "Maintenance: Lint & Deps"
order: 7
---

### feat(design): support path exclusions for the design-token drift linter (design.exclude)

- **Status:** planned
- **Spec:** docs/changes/design-drift-exclude/proposal.md
- **Summary:** Problem Since v4, `harness validate` runs the design-token drift linter (DRIFT-T001..T004) over every `.ts/.tsx/.js/.jsx/.css/.scss` file under the project root (skipping only `node_modules`/`dist`/`build`/`coverage`/dot-dirs). The only configuration surface is `design.strictness` and `design.audit.driftDetection.enabled`. In a real monorepo this produces thousands of unavoidable findings: - **The token palette sources themselves** (e.g. a `tokens-reference.ts` or generated `theme/tokens.ts`) by definition contain raw hex literals — ours account for 350+ DRIFT-T001 errors. - **Test files** asserting on rendered colors/fonts. - **Non-UI code** (backend service definitions, DSL/DAG files) where hex strings aren't design tokens at all. With no way to scope the linter, the practical options today are `strictness: permissive` (gate passes but output is still swamped) or disabling drift detection entirely — losing the signal where it *is* valuable (component source in the UI package). Proposal Support an exclusion/scoping config for drift detection, mirroring the existing `security.exclude` shape, e.g.: An `include` allowlist (or per-path severity, e.g. error in `packages/ui`, warn elsewhere) would be even better, but plain excludes would unblock most monorepos. Context harness-engineering CLI 4.1.0. Observed while re-greening `harness validate` after the 2.8 → 4.x upgrade: 1,614 findings, 1,545 errors, 100% from `driftDetection`.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#742
