# Plan: audit-component-anatomy

**Date:** 2026-05-23 | **Spec:** `docs/changes/design-pipeline/audit-component-anatomy/proposal.md` | **Tasks:** 71 | **Time:** ~19 days of focused work (Phase 0 ~1d, Phase 1 ~5-7d, Phase 2 ~10-12d, Phase 3 ~3-5d) | **Integration Tier:** large

## Goal

Ship the first programmatic enforcer of component-anatomy rules — a `harness-audit-component-anatomy` skill that emits `ANAT-D*` (definition) and `ANAT-P*` (pattern-presence) findings via skill, MCP tool (`mcp__harness__audit_anatomy`), graph (`VIOLATES` edges through `DesignConstraintAdapter`), and `harness validate` surfaces, with a comprehensive v1 catalog (20 conventions + 10 patterns) and an i18n-style deferral patch to `harness-accessibility` so the two skills do not double-count label findings.

## Observable Truths (Acceptance Criteria)

Numbering mirrors `proposal.md` § Success Criteria so every truth traces back to the spec.

1. **(SC-1) Convention findings produced for known types.** A fixture `Button.tsx` that omits the `loading` state produces an `ANAT-D*` finding identifying `Button`, the missing `loading` state, and a fix hint.
2. **(SC-2) Silent skip for unrecognized types.** `MyRandomThing.tsx` (no JSDoc tag, no registry entry, no export-name match) emits zero `ANAT-D*` findings.
3. **(SC-3) JSDoc overrides convention.** A Button file declaring only 3 of 5 conventional states is treated as ground truth; the two omitted-but-conventional states do not appear as findings; a single `ANAT-D000` info finding records the divergence.
4. **(SC-4) DESIGN.md overrides convention but not JSDoc.** A fixture project with all three layers resolves in the order JSDoc → DESIGN.md → conventions.
5. **(SC-5) Each of the 10+ pattern rules has a positive fixture (pattern present → finding) and a negative fixture (pattern absent → no finding).**
6. **(SC-6) Pattern false-positive rate ≤ 5%** measured against a 50-fixture quality corpus.
7. **(SC-7) 20 convention files ship in `catalog/conventions/`** (Button, Input, Select, Modal/Dialog, EmptyState, Card, Tabs, Menu, Toast, Form, Accordion, Tooltip, Popover, Drawer, Slider, Switch, Checkbox, Radio, Avatar, Badge).
8. **(SC-8) 10+ pattern files ship in `catalog/patterns/`** (ANAT-P001 through ANAT-P010 minimum), each with S-expr query, formatter, fix hint, and source citation.
9. **(SC-9) Every convention cites `source: { ref, url }`** populated from APG, Open UI, Radix, or design-component-anatomy.
10. **(SC-10) MCP tool returns the documented `AuditAnatomyOutput`** with at least one finding, populated `summary`, `catalog`, and `meta.deferredToA11y` fields.
11. **(SC-11) `harness validate` runs fast-mode anatomy check** and respects `design.audit.componentAnatomy.enabled` plus `design.strictness`.
12. **(SC-12) `VIOLATES` edges are written and idempotent** — re-running audit does not duplicate edges.
13. **(SC-13) harness-accessibility deferral works** — Button with no label produces 1 anatomy finding, 0 A11Y-010 findings when `enabled = true`.
14. **(SC-14) Disabling the audit restores a11y behavior** — `enabled = false` causes A11Y-010 to fire for the same Button and anatomy emits nothing.
15. **(SC-15) Fast-mode ≤ 3s on a 500-file repo**, captured in `benchmark-baselines.json`.
16. **(SC-16) Full-mode ≤ 30s on the same 500-file repo.**
17. **(SC-17) Tree-sitter parses are cached per file** — verified by a test that asserts one parse call when 5 pattern rules run on the same file.
18. **(SC-18) Every finding includes a concrete fix hint.**
19. **(SC-19) Markdown report formatter produces a navigable report** grouped by file with finding codes linked to `finding-codes.md`.
20. **(SC-20) `SKILL.md` passes the harness skill validator** with required frontmatter, When-to-Use, and Gates.
21. **(SC-21) AGENTS.md, designer-quickstart.md, finding-codes.md updated** to reference the audit.
22. **(SC-22) DESIGN.md schema documents the two new optional sections** with examples.
23. **(SC-23) Three ADRs filed** under `docs/knowledge/decisions/` (hybrid parser, finding-code namespace, cross-skill deferral).
24. **(SC-24) Three knowledge entries filed** under `docs/knowledge/design/` (component-anatomy-rules, pattern-presence-audit, cross-skill-deferral).
25. **(SC-25) MCP tool API stable and versioned** so sub-project #4 can wrap it without internal coupling.
26. **(SC-26) `getCatalogTypes()` is a stable named export** so harness-accessibility can depend on it.
27. **(SC-27) Findings carry a `runId`** so sub-project #4 can detect fixpoint.
28. **(SC-28) No `ANAT-U*` codes in any output.**
29. **(SC-29) No source files modified by the audit** — fix hints only.
30. **(SC-30) No regression in existing a11y fixtures** outside of explicit deferral cases.

## Uncertainties

- **[ASSUMPTION]** The implementation module lives at `packages/cli/src/skills/audit-component-anatomy/` (per spec § File layout). Today no `packages/cli/src/skills/` directory exists — skills currently live only under `agents/skills/<agent>/`. Plan creates the new `packages/cli/src/skills/` parent on first task. If the project insists the runnable code lives elsewhere (e.g. `packages/cli/src/audit/`), all file-path tasks need a path rename (mechanical) but no logic change.
- **[ASSUMPTION]** `agents/skills/claude-code/harness-audit-component-anatomy/` is the correct authoring location for `SKILL.md` and `skill.yaml` (mirrors `harness-accessibility`). The implementation module under `packages/cli/src/skills/...` is the TypeScript runtime; the agents skill is the prompt-side authored skill. Both ship.
- **[ASSUMPTION]** Tree-sitter Node bindings (`tree-sitter`, `tree-sitter-typescript`) are installable as runtime dependencies of `@harness-engineering/cli`. If native-binding installation fails on CI runners we lock the version and document the contingency in ADR-001.
- **[ASSUMPTION]** `harness.config.json` validation lives in `packages/cli/src/config/schema.ts` (confirmed by inspection). The plan extends that file directly.
- **[ASSUMPTION]** `DesignConstraintAdapter` accepts arbitrary `code` strings; the plan adds an `ANAT-*` aware `recordFindings(findings: AnatomyFinding[])` method that constructs the `VIOLATES` edges using existing primitives. If the adapter contract forbids new methods, Phase 1 step "Adapter wiring" needs a small refactor — fallback is a sibling `AnatomyConstraintEmitter` class that calls into the existing adapter.
- **[ASSUMPTION]** harness-accessibility's config-resolution path can read `design.audit.componentAnatomy.enabled` without a schema-side change beyond the one already planned. If A11y has its own typed view of the config we extend that type too (small edit).
- **[DEFERRABLE]** Exact tree-sitter S-expression queries for each ANAT-P00N pattern — Phase 0 spike captures two example queries; remaining 8 are authored during catalog expansion and may iterate.
- **[DEFERRABLE]** Specific source URLs for some convention citations (e.g. EmptyState has no canonical APG entry — fallback to design-component-anatomy knowledge skill).

No **[BLOCKING]** uncertainties — Phase 0 schema spike validates the only architectural unknowns.

## File Map

### Phase 0 — Schema Spike (paper specs only, no code yet)

- CREATE `docs/changes/design-pipeline/audit-component-anatomy/spikes/2026-05-23-schema-spike.md`

### Phase 1 — Vertical Slice

Source module (TypeScript runtime):

- CREATE `packages/cli/src/skills/audit-component-anatomy/index.ts`
- CREATE `packages/cli/src/skills/audit-component-anatomy/parsers/ast.ts`
- CREATE `packages/cli/src/skills/audit-component-anatomy/parsers/tree-sitter.ts`
- CREATE `packages/cli/src/skills/audit-component-anatomy/resolvers/source-of-truth.ts`
- CREATE `packages/cli/src/skills/audit-component-anatomy/resolvers/component-type.ts`
- CREATE `packages/cli/src/skills/audit-component-anatomy/rules/convention-rule.ts`
- CREATE `packages/cli/src/skills/audit-component-anatomy/rules/pattern-rule.ts`
- CREATE `packages/cli/src/skills/audit-component-anatomy/catalog/index.ts` (catalog registry)
- CREATE `packages/cli/src/skills/audit-component-anatomy/catalog/conventions/button.ts`
- CREATE `packages/cli/src/skills/audit-component-anatomy/catalog/patterns/ANAT-P001-map-without-empty.ts`
- CREATE `packages/cli/src/skills/audit-component-anatomy/findings/finding.ts`
- CREATE `packages/cli/src/skills/audit-component-anatomy/findings/severity.ts`
- CREATE `packages/cli/src/skills/audit-component-anatomy/integrations/design-constraint-adapter.ts`
- CREATE `packages/cli/src/skills/audit-component-anatomy/integrations/validate.ts`
- CREATE `packages/cli/src/skills/audit-component-anatomy/exports.ts` (re-export `getCatalogTypes`)

Source module tests:

- CREATE `packages/cli/src/skills/audit-component-anatomy/parsers/ast.test.ts`
- CREATE `packages/cli/src/skills/audit-component-anatomy/parsers/tree-sitter.test.ts`
- CREATE `packages/cli/src/skills/audit-component-anatomy/resolvers/source-of-truth.test.ts`
- CREATE `packages/cli/src/skills/audit-component-anatomy/resolvers/component-type.test.ts`
- CREATE `packages/cli/src/skills/audit-component-anatomy/rules/convention-rule.test.ts`
- CREATE `packages/cli/src/skills/audit-component-anatomy/rules/pattern-rule.test.ts`
- CREATE `packages/cli/src/skills/audit-component-anatomy/catalog/conventions/button.test.ts`
- CREATE `packages/cli/src/skills/audit-component-anatomy/catalog/patterns/ANAT-P001-map-without-empty.test.ts`
- CREATE `packages/cli/src/skills/audit-component-anatomy/integrations/design-constraint-adapter.test.ts`
- CREATE `packages/cli/src/skills/audit-component-anatomy/integrations/validate.test.ts`
- CREATE `packages/cli/src/skills/audit-component-anatomy/index.test.ts` (MCP-shaped end-to-end test)

Fixtures (read by tests):

- CREATE `packages/cli/src/skills/audit-component-anatomy/tests/fixtures/button/missing-loading.tsx`
- CREATE `packages/cli/src/skills/audit-component-anatomy/tests/fixtures/button/complete.tsx`
- CREATE `packages/cli/src/skills/audit-component-anatomy/tests/fixtures/button/jsdoc-override.tsx`
- CREATE `packages/cli/src/skills/audit-component-anatomy/tests/fixtures/button/raw-html-button.tsx`
- CREATE `packages/cli/src/skills/audit-component-anatomy/tests/fixtures/random/MyRandomThing.tsx`
- CREATE `packages/cli/src/skills/audit-component-anatomy/tests/fixtures/design-md/three-layer-project/DESIGN.md`
- CREATE `packages/cli/src/skills/audit-component-anatomy/tests/fixtures/design-md/three-layer-project/Button.tsx`
- CREATE `packages/cli/src/skills/audit-component-anatomy/tests/fixtures/pattern-p001/map-without-empty.tsx`
- CREATE `packages/cli/src/skills/audit-component-anatomy/tests/fixtures/pattern-p001/map-with-empty-guard.tsx`

Skill authoring (prompt-side):

- CREATE `agents/skills/claude-code/harness-audit-component-anatomy/SKILL.md`
- CREATE `agents/skills/claude-code/harness-audit-component-anatomy/skill.yaml`

MCP tool:

- CREATE `packages/cli/src/mcp/tools/audit-anatomy.ts`
- CREATE `packages/cli/src/mcp/tools/audit-anatomy.test.ts`
- MODIFY `packages/cli/src/mcp/server.ts` (register `audit_anatomy` tool)

Config schema:

- MODIFY `packages/cli/src/config/schema.ts` (add `design.audit.componentAnatomy` block)
- MODIFY `packages/cli/tests/config/schema.test.ts` *(or create `schema.componentAnatomy.test.ts` if no general schema test exists — task verifies before deciding)*

Validate integration:

- MODIFY `packages/cli/src/commands/validate.ts` (call anatomy fast-mode hook in design group)
- MODIFY `packages/cli/src/commands/validate.test.ts` (assert anatomy findings surface when enabled)

CLI command registry (no new top-level command — anatomy runs via existing `harness skill run` and `harness validate`):

- MODIFY `packages/cli/src/commands/_registry.ts` (only if a new command is registered; expected: NO change, validated in task)

Harness-accessibility deferral patch:

- MODIFY `agents/skills/claude-code/harness-accessibility/SKILL.md` (add Phase 1 step 2.6)
- MODIFY `agents/skills/cursor/harness-accessibility/SKILL.md`
- MODIFY `agents/skills/codex/harness-accessibility/SKILL.md`
- MODIFY `agents/skills/gemini-cli/harness-accessibility/SKILL.md`

Package deps:

- MODIFY `packages/cli/package.json` (add `tree-sitter`, `tree-sitter-typescript`, `typescript` if not already a runtime dep)

Skill index regeneration:

- TRIGGER `harness validate` or `pnpm run skill:index` (regenerates `.harness/skills-index.json` — file-write happens automatically)

### Phase 2 — Catalog Expansion

19 convention files + 9 pattern files (each with a positive + negative fixture):

- CREATE `packages/cli/src/skills/audit-component-anatomy/catalog/conventions/{input,select,modal-dialog,empty-state,card,tabs,menu,toast,form,accordion,tooltip,popover,drawer,slider,switch,checkbox,radio,avatar,badge}.ts` (19 files)
- CREATE matching `.test.ts` for each (19 files)
- CREATE matching `tests/fixtures/<component>/{missing-required.tsx,complete.tsx}` (38 fixture files)
- CREATE `packages/cli/src/skills/audit-component-anatomy/catalog/patterns/ANAT-P{002..010}-<slug>.ts` (9 files)
- CREATE matching `.test.ts` for each (9 files)
- CREATE matching `tests/fixtures/pattern-p<NNN>/{positive,negative}.tsx` (18 fixture files)
- MODIFY `packages/cli/src/skills/audit-component-anatomy/catalog/index.ts` (auto-register entries)

### Phase 3 — Polish

- CREATE `packages/cli/src/skills/audit-component-anatomy/findings/formatter.ts`
- CREATE `packages/cli/src/skills/audit-component-anatomy/findings/formatter.test.ts`
- CREATE `docs/changes/design-pipeline/audit-component-anatomy/finding-codes.md`
- CREATE `docs/knowledge/design/component-anatomy-rules.md`
- CREATE `docs/knowledge/design/pattern-presence-audit.md`
- CREATE `docs/knowledge/design/cross-skill-deferral.md`
- CREATE `docs/knowledge/decisions/0018-hybrid-parser-strategy.md` (or next free number; task verifies)
- CREATE `docs/knowledge/decisions/0019-anatomy-finding-code-namespace.md`
- CREATE `docs/knowledge/decisions/0020-cross-skill-deferral-pattern.md`
- CREATE `packages/cli/tests/skills/audit-component-anatomy/benchmark.test.ts`
- CREATE `packages/cli/.harness/benchmark-baselines.json` *(or extend existing)*
- CREATE `packages/cli/src/skills/audit-component-anatomy/tests/quality-corpus/` (50 fixtures: organized as `false-positive-bait/*.tsx` and `true-positive/*.tsx`)
- CREATE `packages/cli/src/skills/audit-component-anatomy/tests/quality-corpus.test.ts` (computes false-positive rate)
- MODIFY `AGENTS.md`
- MODIFY `docs/guides/designer-quickstart.md`
- MODIFY `agents/skills/templates/DESIGN.md` *(or the canonical template — task verifies)*
- MODIFY `docs/changes/design-pipeline/REFERENCES.md` (mark sub-project #2 in-progress → done)
- MODIFY `docs/changes/design-pipeline/index.md` (update status if present)

## Skeleton

Skeleton produced for transparency; total task count (71) is far beyond the standard threshold (>=8), so per the SKILL.md rigor rules the skeleton precedes the full task list. Skeleton was self-approved (autopilot context) — if a human reviewer rejects any group, expand the rejected group only.

**Phase 0 — Schema Spike (1 group, ~3 tasks, ~3-4 hrs)**

1. Author + review three convention specs and two pattern specs on paper; lock the schemas before Phase 1.

**Phase 1 — Vertical Slice (8 groups, ~37 tasks, ~5-7 days)**

1. Phase 1.0 — Workspace bootstrap (3 tasks): package deps, dir scaffold, MCP registration plumbing skeleton.
2. Phase 1.1 — Finding + severity types (3 tasks): `finding.ts`, `severity.ts`, `runId` generation utility.
3. Phase 1.2 — Parser stack (5 tasks): TS AST wrapper, tree-sitter wrapper, parse cache, isolation tests, performance smoke.
4. Phase 1.3 — Resolvers (4 tasks): JSDoc tag parser, DESIGN.md parser, component-type resolver, source-of-truth resolver.
5. Phase 1.4 — Rule engine (4 tasks): `ConventionRule` runner, `PatternRule` runner, `Button` catalog entry, `ANAT-P001` catalog entry.
6. Phase 1.5 — MCP + skill surface (4 tasks): MCP `audit_anatomy` tool, `SKILL.md`/`skill.yaml`, skill index regen, `getCatalogTypes()` export.
7. Phase 1.6 — Graph + validate integration (3 tasks): `DesignConstraintAdapter` anatomy wiring, validate fast-mode hook, idempotency test.
8. Phase 1.7 — Cross-skill integration (4 tasks): config schema extension, a11y deferral patch (all four agent variants in one task), end-to-end deferral test, regression sweep.
9. Phase 1.8 — Vertical-slice exit gate (1 task): `[checkpoint:human-verify]` walking SC-1..SC-5, SC-10..SC-14, SC-17, SC-20.

**Phase 2 — Catalog Expansion (3 groups, ~24 tasks, ~10-12 days)**

1. Phase 2.1 — Pattern catalog (9 pattern tasks + 1 catalog-index task = 10): one task per pattern (`ANAT-P002`..`ANAT-P010`), each ships rule + tests + fixtures.
2. Phase 2.2 — Convention catalog (19 tasks bundled in waves of 5 to keep PRs reviewable, plus 1 catalog-index task = 20). Each convention task: spec + tests + positive/negative fixture pair + source citation. **Sub-checkpoint** after wave 2 (~10 conventions in) to spot rule-engine smells before committing the back half.
3. Phase 2.3 — Catalog-expansion exit gate (1 task): `[checkpoint:human-verify]` walking SC-6 baseline, SC-7, SC-8, SC-9. Baseline FP rate recorded.

**Phase 3 — Polish (4 groups, ~13 tasks, ~3-5 days)**

1. Phase 3.1 — Severity model + formatter (3 tasks): severity matrix, Markdown formatter, JSDoc parser hardening.
2. Phase 3.2 — Documentation (4 tasks): finding-codes.md, AGENTS.md, designer-quickstart, DESIGN.md template.
3. Phase 3.3 — ADRs + knowledge (2 tasks): three ADRs in one task (parallel-safe — same dir), three knowledge entries in one task.
4. Phase 3.4 — Performance + quality (3 tasks): benchmarks, 50-fixture corpus, FP-rate enforcement test.
5. Phase 3.5 — Ship gate (1 task): `[checkpoint:human-verify]` running every remaining success criterion + final `harness validate`.

**Estimated total:** ~71 tasks, ~19 days of focused engineering. Skeleton approved (autopilot self-approval).

---

## Tasks

> Conventions used in every task: file paths are absolute repo paths from `/Users/cwarner/Projects/iv/harness-engineering/...`; commit messages use conventional commits with `feat(audit-anatomy): ...` / `test(audit-anatomy): ...` / `docs(audit-anatomy): ...` scope; every code-producing task ends with `harness validate` followed by a `git commit`. TDD: write failing test, watch it fail, implement, watch it pass.

---

### Phase 0 — Schema Spike

#### Task 0.1: Author Button + Tabs + EmptyState convention specs on paper

**Depends on:** none | **Files:** `docs/changes/design-pipeline/audit-component-anatomy/spikes/2026-05-23-schema-spike.md` | **Category:** spike

1. Create the spikes directory: `mkdir -p docs/changes/design-pipeline/audit-component-anatomy/spikes`.
2. Create `2026-05-23-schema-spike.md` with three sections, one per component:
   - **Button** — fill in `componentType: 'Button'`, `slots: [{ name: 'content', required: true, fixHint: 'Add a content prop or children slot' }, { name: 'icon-leading', required: false, ... }, { name: 'icon-trailing', required: false, ... }]`, all five conventional states (`default`, `hover`, `focus`, `disabled` exclusive, `loading` exclusive), variants `primary|secondary|ghost|danger`, sizes `sm|md|lg`, source `{ ref: 'APG/button', url: 'https://www.w3.org/WAI/ARIA/apg/patterns/button/' }`.
   - **Tabs** — compound component. Spec the parent's slots (`list`, `panels`) plus document each child's expected anatomy (Tab, TabPanel). Source: `APG/tabs`.
   - **EmptyState** — pattern-and-component hybrid: slot `illustration` (optional), slot `heading` (required), slot `body` (optional), slot `actions` (optional). Source: Radix EmptyState + design-component-anatomy.
3. After authoring, add a "Schema-fit notes" subsection: for each spec, record any field the `ConventionRule` interface in the proposal cannot express verbatim. If empty for all three, the convention schema is locked.

#### Task 0.2: Author ANAT-P001 + ANAT-P004 pattern specs on paper

**Depends on:** Task 0.1 | **Files:** same spike doc | **Category:** spike

1. Append two pattern subsections to the spike doc:
   - **ANAT-P001 map-without-empty** — copy the S-expression from `proposal.md` §"Example pattern query" verbatim. Author the post-processing description: walk parent chain from `@map-call` looking for a `ConditionalExpression` whose `test` is a `BinaryExpression` matching `<lhs>.length === 0` where `<lhs>` is the same identifier as the `MemberExpression` object on the map call. If no such guard exists and no sibling `if (items.length === 0) return <Empty/>` exists, emit a finding.
   - **ANAT-P004 conditional-render-without-fallback** — draft S-expression: `(jsx_expression (conditional_expression alternate: (null) @null-fallback))` plus narrative: detect `{cond ? <Foo/> : null}` where `<Foo/>` is the rendered output of a likely-async or error-prone source (state hook, query result). The pattern flags missing user-visible fallback UI when the alternative is `null`.
2. Add "Schema-fit notes" — confirm the `PatternRule` interface (`code`, `treeSitterQuery`, `severityDefault`, `message`, `fixHint`, `source`) holds both. If post-processing needs another field (e.g. `postProcess: (matches, source) => Capture[]`), record the addition here — it becomes a Phase 1 implementation requirement.
3. Run: `harness validate`.
4. Commit: `docs(audit-anatomy): land schema spike with 3 conventions + 2 patterns`.

#### Task 0.3: Schema-fit review checkpoint

**Depends on:** Task 0.2 | **Files:** same spike doc | **Category:** review

`[checkpoint:human-verify]`

1. Read the "Schema-fit notes" sections. If any spec required a schema addition, append a "Phase 1 schema deltas" subsection enumerating each delta.
2. Present to a reviewer: "Are the schemas locked, or do the Phase 1 schema deltas require redesign before coding starts?"
3. On approval, mark the spike "Schemas locked — Phase 1 may begin" and proceed.
4. On rejection, iterate Tasks 0.1/0.2 with new constraints.

---

### Phase 1 — Vertical Slice

#### Phase 1.0 — Workspace bootstrap

#### Task 1.0.1: Add runtime dependencies for tree-sitter + TypeScript compiler API

**Depends on:** Task 0.3 | **Files:** `packages/cli/package.json`

1. Read `packages/cli/package.json` to confirm whether `tree-sitter`, `tree-sitter-typescript`, and `typescript` are already runtime deps (versus dev deps).
2. Add to `dependencies` (not `devDependencies`):
   - `"tree-sitter": "^0.21.0"`
   - `"tree-sitter-typescript": "^0.23.0"`
   - `"typescript": "^5.4.0"` (only if not already a runtime dep; if it's a dev-only dep, promote it).
3. From the repo root: `pnpm install --filter @harness-engineering/cli`.
4. Verify install succeeds and native bindings build (tree-sitter has node-gyp deps). On failure, fall back to `tree-sitter@0.20.x` and document in the commit body.
5. Run: `harness validate && harness check-deps`.
6. Commit: `feat(audit-anatomy): add tree-sitter + ts compiler runtime deps`.

#### Task 1.0.2: Scaffold skill source-module directory tree

**Depends on:** Task 1.0.1 | **Files:** `packages/cli/src/skills/audit-component-anatomy/.gitkeep` and child dirs

1. Create the directory tree exactly as listed in spec §"File layout":

   ```bash
   mkdir -p packages/cli/src/skills/audit-component-anatomy/{parsers,resolvers,rules,catalog/{conventions,patterns},findings,integrations,tests/fixtures}
   ```

2. Add a single placeholder `packages/cli/src/skills/audit-component-anatomy/.gitkeep` so the empty tree commits.
3. Run: `harness validate`.
4. Commit: `chore(audit-anatomy): scaffold skill module directory tree`.

#### Task 1.0.3: Add stub `index.ts` re-exporting empty surface

**Depends on:** Task 1.0.2 | **Files:** `packages/cli/src/skills/audit-component-anatomy/index.ts`, `packages/cli/src/skills/audit-component-anatomy/exports.ts`

1. Create `index.ts` with `export {} from './exports.js';` and a top-of-file comment: `// Public entry point for audit-component-anatomy. See SKILL.md.`
2. Create `exports.ts` with `export function getCatalogTypes(): string[] { return []; }` — stub returning an empty array.
3. Run: `pnpm --filter @harness-engineering/cli build` to confirm TypeScript compiles.
4. Run: `harness validate`.
5. Commit: `feat(audit-anatomy): add stub index + exports surface`.

#### Phase 1.1 — Finding + severity types

#### Task 1.1.1: Define `AnatomyFinding` type with runId support (TDD)

**Depends on:** Task 1.0.3 | **Files:** `packages/cli/src/skills/audit-component-anatomy/findings/finding.ts`, `packages/cli/src/skills/audit-component-anatomy/findings/finding.test.ts`
**Skills:** `ts-template-literal-types` (apply — `AnatomyFindingCode` is a literal-template type), `ts-utility-types` (reference)

1. Create `finding.test.ts` with two `describe` blocks:
   - "AnatomyFindingCode type" — assert `'ANAT-D023'` and `'ANAT-P001'` are assignable to `AnatomyFindingCode` and `'A11Y-010'` is not (compile-time test using `// @ts-expect-error`).
   - "createFinding factory" — covers: factory produces a valid `AnatomyFinding`; `runId` is generated when omitted; `line: null` is allowed for whole-file findings; `evidence.snippet` is required.
2. Run: `npx vitest run packages/cli/src/skills/audit-component-anatomy/findings/finding.test.ts` — observe failure.
3. Create `finding.ts` per spec §"Data structures" with the exact types: `AnatomyFindingCode`, `Severity`, `AnatomyFinding`, plus `createFinding(input: Omit<AnatomyFinding, 'runId'> & { runId?: string }): AnatomyFinding` factory that fills `runId` via `crypto.randomUUID()` when missing.
4. Run vitest — observe pass.
5. Run: `harness validate`.
6. Commit: `feat(audit-anatomy): add AnatomyFinding type + factory with runId`.

#### Task 1.1.2: Implement severity matrix (TDD)

**Depends on:** Task 1.1.1 | **Files:** `packages/cli/src/skills/audit-component-anatomy/findings/severity.ts`, `packages/cli/src/skills/audit-component-anatomy/findings/severity.test.ts`

1. Create `severity.test.ts` with one `describe` and a table-driven test covering the spec's strictness rules (mirror harness-accessibility behaviour): `strict` ⇒ all findings `error`; `standard` ⇒ default severity preserved (so a finding with `severityDefault: 'warn'` stays `warn`); `permissive` ⇒ `error` downgrades to `warn`, `warn` downgrades to `info`.
2. Run vitest — observe failure.
3. Create `severity.ts` exporting `function resolveSeverity(severityDefault: Severity, strictness: DesignStrictness): Severity` implementing the table. Import `DesignStrictness` from `packages/graph/src/constraints/DesignConstraintAdapter.ts` *(or redeclare locally if a cross-package import is forbidden; the source-of-truth is the graph package — verify and pick the lighter coupling)*.
4. Run vitest — observe pass.
5. Run: `harness validate`.
6. Commit: `feat(audit-anatomy): add design-strictness → severity resolver`.

#### Task 1.1.3: Add runId provider with deterministic mode (TDD)

**Depends on:** Task 1.1.1 | **Files:** `packages/cli/src/skills/audit-component-anatomy/findings/run-id.ts`, `packages/cli/src/skills/audit-component-anatomy/findings/run-id.test.ts`

1. Create `run-id.test.ts` asserting: (a) `createRunId()` returns a uuid; (b) `createRunId({ deterministic: 'fixture-1' })` returns the same value across calls; (c) all findings produced inside `withRunId(id, () => ...)` share the same `runId`.
2. Run vitest — failure.
3. Create `run-id.ts` exporting `createRunId`, `withRunId` (AsyncLocalStorage-backed). Modify `findings/finding.ts` `createFinding` factory to consult the AsyncLocalStorage if no explicit `runId` is provided.
4. Update `finding.test.ts` to add one test confirming the AsyncLocalStorage integration.
5. Run vitest on both files — pass.
6. Run: `harness validate`.
7. Commit: `feat(audit-anatomy): add runId provider with deterministic-mode for tests`.

#### Phase 1.2 — Parser stack

#### Task 1.2.1: TS Compiler API wrapper with per-file cache (TDD)

**Depends on:** Task 1.0.3 | **Files:** `packages/cli/src/skills/audit-component-anatomy/parsers/ast.ts`, `packages/cli/src/skills/audit-component-anatomy/parsers/ast.test.ts`
**Skills:** `ts-type-guards` (reference)

1. Create `ast.test.ts` with cases: (a) `parseFile(path)` returns a `ts.SourceFile`; (b) calling twice with the same path returns the cached instance (assert via `===`); (c) `getExportedComponents(sourceFile)` finds `export const Button = ...` and `export default function Button(...)`; (d) `getPropTypeMembers(component, sourceFile)` returns property names of the prop type literal.
2. Use a small inline TSX fixture string for each test (write to a temp file via `os.tmpdir()`).
3. Run vitest — failure.
4. Implement `ast.ts`:
   - `createAstParser()` returns `{ parseFile(path: string): ts.SourceFile, getExportedComponents(sf: ts.SourceFile): ExportedComponent[], getPropTypeMembers(c: ExportedComponent, sf: ts.SourceFile): string[], clearCache(): void }`.
   - Use `Map<string, ts.SourceFile>` keyed by absolute path + mtime.
   - `getExportedComponents` walks top-level statements collecting variable declarations whose initializer is an arrow function or function expression returning JSX, plus function declarations / default exports.
5. Run vitest — pass.
6. Run: `harness validate`.
7. Commit: `feat(audit-anatomy): add TS compiler AST wrapper with file cache`.

#### Task 1.2.2: Tree-sitter wrapper + query runner with parse cache (TDD)

**Depends on:** Task 1.0.1, Task 1.0.3 | **Files:** `packages/cli/src/skills/audit-component-anatomy/parsers/tree-sitter.ts`, `packages/cli/src/skills/audit-component-anatomy/parsers/tree-sitter.test.ts`

1. Create `tree-sitter.test.ts` with cases: (a) `createTreeSitterParser()` returns a parser with `parseFile`; (b) parsing a `.tsx` file uses the tsx grammar; (c) calling `runQuery(source, query, 'tsx')` returns capture matches; (d) **cache test:** spying on the internal `tree-sitter` parser's `.parse()` method confirms it is called exactly once when the same file is queried by 5 different patterns (proves SC-17).
2. Use one inline TSX fixture with a known `map(...)` call.
3. Run vitest — failure.
4. Implement `tree-sitter.ts` lazy-loading `tree-sitter` + `tree-sitter-typescript` (so the cost is only paid in full-mode). Cache key is `path + mtime`. Expose: `parseFile(path: string): Tree`, `runQuery(tree: Tree, queryStr: string, language: 'ts' | 'tsx'): QueryCapture[]`, `clearCache()`.
5. Run vitest — pass.
6. Run: `harness validate`.
7. Commit: `feat(audit-anatomy): add tree-sitter wrapper with shared parse cache`.

#### Task 1.2.3: Add parser-stack smoke benchmark (perf guardrail)

**Depends on:** Task 1.2.2 | **Files:** `packages/cli/src/skills/audit-component-anatomy/parsers/parser-smoke.test.ts`

1. Create `parser-smoke.test.ts` that parses 100 generated TSX files (size ~50 LOC each, written into `os.tmpdir()` once) via the AST parser and tree-sitter parser respectively. Assert AST parse < 2 seconds total, tree-sitter parse < 3 seconds total. These thresholds are loose — they catch regressions, not perf tuning.
2. Run vitest — should pass on first commit.
3. Run: `harness validate`.
4. Commit: `test(audit-anatomy): add parser smoke benchmark`.

#### Phase 1.3 — Resolvers

#### Task 1.3.1: JSDoc tag parser (TDD)

**Depends on:** Task 1.2.1 | **Files:** `packages/cli/src/skills/audit-component-anatomy/resolvers/jsdoc-tags.ts`, `packages/cli/src/skills/audit-component-anatomy/resolvers/jsdoc-tags.test.ts`

1. Create `jsdoc-tags.test.ts` with cases parsing the exact JSDoc comment in spec §"JSDoc tag grammar": (a) `@component-type Button` resolves to `'Button'`; (b) every `@anatomy-slot` becomes an `AnatomyPart`; (c) `@anatomy-state disabled exclusive` sets `exclusive: true`; (d) `@anatomy-variant primary|secondary|ghost|danger` produces four variant names; (e) absent JSDoc returns `null` (not error).
2. Run vitest — failure.
3. Implement `jsdoc-tags.ts` exporting `parseAnatomyJsdoc(sourceFile: ts.SourceFile): ParsedAnatomyJsdoc | null` — walks the file's leading comment ranges and pulls the first JSDoc block on an exported declaration.
4. Run vitest — pass.
5. Run: `harness validate`.
6. Commit: `feat(audit-anatomy): add JSDoc anatomy-tag parser`.

#### Task 1.3.2: DESIGN.md schema parser (TDD)

**Depends on:** Task 1.0.3 | **Files:** `packages/cli/src/skills/audit-component-anatomy/resolvers/design-md.ts`, `packages/cli/src/skills/audit-component-anatomy/resolvers/design-md.test.ts`

1. Create `design-md.test.ts` with cases parsing the example markdown in spec §"DESIGN.md schema additions": (a) `parseComponentRegistry(md)` returns `[{ type: 'Button', file: 'packages/ui/src/Button.tsx' }, ...]`; (b) `parseAnatomyOverrides(md)` returns a `Map<componentType, PartialConventionRule>`; (c) absent sections return empty results, not error; (d) malformed table rows are silently skipped (with one collected warning).
2. Run vitest — failure.
3. Implement `design-md.ts`. Use a minimal markdown table parser (regex-based — the schema is constrained and structured). Do not bring in a full markdown lib.
4. Run vitest — pass.
5. Run: `harness validate`.
6. Commit: `feat(audit-anatomy): add DESIGN.md registry + override parser`.

#### Task 1.3.3: Component-type resolver (JSDoc → DESIGN.md → export-name) (TDD)

**Depends on:** Task 1.3.1, Task 1.3.2 | **Files:** `packages/cli/src/skills/audit-component-anatomy/resolvers/component-type.ts`, `packages/cli/src/skills/audit-component-anatomy/resolvers/component-type.test.ts`

1. Create `component-type.test.ts` with cases:
   - JSDoc-only fixture → returns `'Button'` from JSDoc.
   - DESIGN.md-only fixture → returns from registry.
   - Export-name-only fixture (file exports `Button`, type `Button` is in the catalog) → returns `'Button'`.
   - All three present → JSDoc wins.
   - None match → returns `null` (silent skip).
2. Run vitest — failure.
3. Implement `component-type.ts` exporting `resolveComponentType(file: string, ctx: ResolverContext): string | null`. `ResolverContext` includes the catalog type list (so resolver does not import catalog directly — keeps it testable).
4. Run vitest — pass.
5. Run: `harness validate`.
6. Commit: `feat(audit-anatomy): add component-type resolver per Decision #3`.

#### Task 1.3.4: Source-of-truth resolver (JSDoc → DESIGN.md → conventions) (TDD)

**Depends on:** Task 1.3.3 | **Files:** `packages/cli/src/skills/audit-component-anatomy/resolvers/source-of-truth.ts`, `packages/cli/src/skills/audit-component-anatomy/resolvers/source-of-truth.test.ts`

1. Create `source-of-truth.test.ts` with cases:
   - JSDoc declaration replaces convention slots entirely; remaining-from-convention slots are NOT inherited (JSDoc is ground truth).
   - JSDoc covering fewer states than convention emits a single `ANAT-D000` info finding describing the divergence (SC-3).
   - DESIGN.md override beats convention but loses to JSDoc.
   - Missing all layers returns `null` (resolver does not fabricate).
2. Run vitest — failure.
3. Implement `source-of-truth.ts` exporting `resolveAnatomy(file: string, type: string, ctx: ResolverContext): { rule: ConventionRule, divergenceFinding?: AnatomyFinding } | null`.
4. Run vitest — pass.
5. Run: `harness validate`.
6. Commit: `feat(audit-anatomy): add source-of-truth resolver per Decision #1`.

#### Phase 1.4 — Rule engine

#### Task 1.4.1: ConventionRule type + runner (TDD)

**Depends on:** Task 1.3.4, Task 1.2.1 | **Files:** `packages/cli/src/skills/audit-component-anatomy/rules/convention-rule.ts`, `packages/cli/src/skills/audit-component-anatomy/rules/convention-rule.test.ts`

1. Create `convention-rule.test.ts` with fixtures: a Button file missing the `loading` state slot in its prop type; a Button file with the full state set; verify the runner emits 1 finding for missing `loading` and 0 for the complete file. Also verify the finding contains: `code: 'ANAT-D001'` (or whatever code is reserved for missing-state — see Phase 3 finding-codes doc; for now use `'ANAT-D001'`), `componentType: 'Button'`, `fixHint` non-empty, `evidence.snippet` non-empty.
2. Run vitest — failure.
3. Implement `convention-rule.ts` exporting `ConventionRule` interface (per spec §"Data structures") + `runConventionRule(rule: ConventionRule, file: string, ast: ASTParser, resolved: ResolvedAnatomy): AnatomyFinding[]`.
4. Run vitest — pass.
5. Run: `harness validate`.
6. Commit: `feat(audit-anatomy): add ConventionRule type + runner`.

#### Task 1.4.2: PatternRule type + runner (TDD)

**Depends on:** Task 1.4.1, Task 1.2.2 | **Files:** `packages/cli/src/skills/audit-component-anatomy/rules/pattern-rule.ts`, `packages/cli/src/skills/audit-component-anatomy/rules/pattern-rule.test.ts`

1. Create `pattern-rule.test.ts` with a stub `PatternRule` (S-expr `(call_expression) @c`) and a fixture file containing one call expression. Assert: runner returns 1 finding; finding's `evidence.snippet` is the source text of the capture; runner shares the parse cache across calls.
2. Run vitest — failure.
3. Implement `pattern-rule.ts` exporting `PatternRule` interface + `runPatternRule(rule: PatternRule, file: string, parser: TreeSitterParser): AnatomyFinding[]`. Support optional `postProcess?: (captures, sourceText) => Capture[]` hook (added in Phase 0 schema delta if present).
4. Run vitest — pass.
5. Run: `harness validate`.
6. Commit: `feat(audit-anatomy): add PatternRule type + runner with postProcess hook`.

#### Task 1.4.3: Author Button convention catalog entry

**Depends on:** Task 1.4.1 | **Files:** `packages/cli/src/skills/audit-component-anatomy/catalog/conventions/button.ts`, `packages/cli/src/skills/audit-component-anatomy/catalog/conventions/button.test.ts`

1. Create `button.test.ts` exercising the full spec (slots, all 5 states, all variants, all sizes, source ref). One test per anatomy bucket. Use the `button/missing-loading.tsx` and `button/complete.tsx` fixtures (create them in step 2 below).
2. Create fixture files `tests/fixtures/button/missing-loading.tsx` and `tests/fixtures/button/complete.tsx` containing minimal TSX with prop type definitions exposing the expected anatomy parts.
3. Run vitest — failure.
4. Create `catalog/conventions/button.ts` exporting `const buttonConvention: ConventionRule = { componentType: 'Button', slots: [...], states: [...], variants: [...], sizes: [...], source: { ref: 'APG/button', url: 'https://www.w3.org/WAI/ARIA/apg/patterns/button/' } }` matching Phase 0's locked spec.
5. Run vitest — pass.
6. Run: `harness validate`.
7. Commit: `feat(audit-anatomy): add Button convention catalog entry`.

#### Task 1.4.4: Author ANAT-P001 map-without-empty pattern entry

**Depends on:** Task 1.4.2 | **Files:** `packages/cli/src/skills/audit-component-anatomy/catalog/patterns/ANAT-P001-map-without-empty.ts`, matching `.test.ts`, fixtures `tests/fixtures/pattern-p001/map-without-empty.tsx` and `tests/fixtures/pattern-p001/map-with-empty-guard.tsx`

1. Create the two fixture files:
   - Positive: `function List({ items }) { return <ul>{items.map(i => <li key={i.id}>{i.name}</li>)}</ul>; }`
   - Negative: `function List({ items }) { return items.length === 0 ? <Empty /> : <ul>{items.map(i => <li key={i.id}>{i.name}</li>)}</ul>; }`
2. Create `ANAT-P001-map-without-empty.test.ts` asserting: positive fixture → 1 finding with code `'ANAT-P001'`; negative fixture → 0 findings.
3. Run vitest — failure.
4. Create `ANAT-P001-map-without-empty.ts` exporting `const ANAT_P001: PatternRule = { code: 'ANAT-P001', treeSitterQuery: <S-expr from spec>, severityDefault: 'warn', message: cap => 'Data list rendered without an empty-state fallback', fixHint: 'Add a guard like \`items.length === 0 ? <Empty/> : items.map(...)\`', source: { ref: 'design-component-anatomy', url: '...' }, postProcess: (caps, src) => <walk for length-guard> }`.
5. Run vitest — pass.
6. Run: `harness validate`.
7. Commit: `feat(audit-anatomy): add ANAT-P001 map-without-empty pattern`.

#### Phase 1.5 — MCP + skill surface

#### Task 1.5.1: Wire orchestrator `runAudit(input): Promise<AuditAnatomyOutput>` (TDD)

**Depends on:** Task 1.4.3, Task 1.4.4 | **Files:** `packages/cli/src/skills/audit-component-anatomy/index.ts`, `packages/cli/src/skills/audit-component-anatomy/index.test.ts`

1. Create `index.test.ts` with end-to-end cases:
   - `runAudit({ path: <fixture-project>, mode: 'fast' })` on a project containing one Button file with missing `loading` state returns `{ findings: [<one ANAT-D finding>], summary: { totalFiles: 1, durationMs: number, bySeverity: { error: 0, warn: 0, info: 0 } | populated }, catalog: { conventionsApplied: ['Button'], patternsApplied: [] }, meta: { mode: 'fast', deferredToA11y: 0 } }`.
   - `runAudit({ ..., mode: 'full' })` on the pattern fixture returns at least one ANAT-P001 finding.
   - `runAudit({ ..., files: ['Button.tsx'] })` scopes correctly.
   - `runAudit({ ..., catalog: ['Button'] })` filters catalog.
2. Run vitest — failure.
3. Replace `index.ts` stub with the full orchestrator: glob source files, resolve component types, run resolved convention rules in fast mode, additionally run pattern rules in full mode, aggregate findings, populate `summary` and `meta`. Honour `designStrictness` override.
4. Update `exports.ts` `getCatalogTypes` to return the array of registered convention `componentType` values from `catalog/index.ts` (write that registry module here as a thin re-export).
5. Run vitest — pass.
6. Run: `harness validate`.
7. Commit: `feat(audit-anatomy): wire end-to-end audit orchestrator + catalog registry`.

#### Task 1.5.2: Register MCP tool `audit_anatomy` (TDD)

**Depends on:** Task 1.5.1 | **Files:** `packages/cli/src/mcp/tools/audit-anatomy.ts`, `packages/cli/src/mcp/tools/audit-anatomy.test.ts`, `packages/cli/src/mcp/server.ts`
**Skills:** `ts-zod-integration` (apply — Zod schema for tool input)

1. Create `audit-anatomy.test.ts` asserting: tool input schema (Zod) rejects `mode: 'magic'`; tool returns the same `AuditAnatomyOutput` shape as the orchestrator; running on a fixture project returns at least one finding.
2. Run vitest — failure.
3. Create `audit-anatomy.ts` defining the tool: name `audit_anatomy` (MCP convention strips the `mcp__harness__` prefix at server-registration time), input Zod schema mirroring `AuditAnatomyInput`, handler calls `runAudit`.
4. Modify `packages/cli/src/mcp/server.ts` to import and register the new tool alongside existing `mcp__harness__*` tools.
5. Run vitest — pass.
6. Run: `harness validate && harness check-deps`.
7. Commit: `feat(mcp): register audit_anatomy tool`.

#### Task 1.5.3: Author SKILL.md + skill.yaml for harness-audit-component-anatomy

**Depends on:** Task 1.5.2 | **Files:** `agents/skills/claude-code/harness-audit-component-anatomy/SKILL.md`, `agents/skills/claude-code/harness-audit-component-anatomy/skill.yaml`

1. Copy `agents/skills/claude-code/harness-accessibility/skill.yaml` to the new skill directory; edit:
   - `name: harness-audit-component-anatomy`
   - `description: Component anatomy and pattern-presence audit (Decision #5: 20 conventions + 10 patterns)`
   - `mcp.tool: audit_anatomy`
   - `mcp.input.skill: harness-audit-component-anatomy`
   - `tier: 2`, `type: rigid` (per spec §"Registrations Required" #1)
   - `keywords:` add `component-anatomy`, `anatomy-conventions`, `pattern-presence`, `tree-sitter`, `ANAT-D`, `ANAT-P`.
   - `depends_on:` add `harness-accessibility` (for deferral coordination).
2. Author `SKILL.md` mirroring harness-accessibility's structure (Process → Phase 1 SCAN / Phase 2 EVALUATE / Phase 3 REPORT) — adapted for anatomy: SCAN runs conventions + patterns; EVALUATE applies severity matrix; REPORT renders Markdown. Include the required `## When to Use`, `## Process`, `## Gates`, `## Success Criteria` sections. Cite the proposal as `docs/changes/design-pipeline/audit-component-anatomy/proposal.md`.
3. Run skill validator: `harness skill validate harness-audit-component-anatomy` (or `pnpm --filter @harness-engineering/cli run validate-skills`).
4. Run: `harness validate`.
5. Commit: `feat(audit-anatomy): author SKILL.md + skill.yaml`.

#### Task 1.5.4: Regenerate skill index + slash commands

**Depends on:** Task 1.5.3 | **Files:** auto-generated — `.harness/skills-index.json`, `packages/cli/src/commands/_registry.ts` (if a command was added; not expected — verify), generated slash commands under `packages/cli/agents/skills/*/`

1. Run: `pnpm --filter @harness-engineering/cli run generate-slash-commands` (or the canonical command — discover via `package.json` scripts).
2. Run: `harness validate` (re-runs skill index build internally).
3. Confirm `.harness/skills-index.json` now contains `harness-audit-component-anatomy`.
4. Commit: `chore(audit-anatomy): regenerate skill index + slash commands`.

#### Phase 1.6 — Graph + validate integration

#### Task 1.6.1: DesignConstraintAdapter anatomy wiring with idempotency (TDD)

**Depends on:** Task 1.5.1 | **Files:** `packages/cli/src/skills/audit-component-anatomy/integrations/design-constraint-adapter.ts`, matching `.test.ts`

1. Create the integration test asserting: (a) `recordFindings(findings)` writes one VIOLATES edge per finding; (b) target node is a `design_rule` keyed by finding code, created on demand if absent; (c) re-running with the same findings produces no duplicate edges (idempotent — SC-12); (d) edge metadata includes `severity`, `line`, `message`, `evidence`, `runId`.
2. Run vitest — failure.
3. Implement the wrapper module: imports `DesignConstraintAdapter` from `@harness-engineering/graph`. Exposes `recordAnatomyFindings(adapter: DesignConstraintAdapter, findings: AnatomyFinding[])`. If the adapter lacks a primitive for "ensure node exists with type/key", use the lowest-level `GraphStore` write path (the adapter constructor takes a store).
4. Run vitest — pass.
5. Run: `harness validate`.
6. Commit: `feat(audit-anatomy): wire findings into DesignConstraintAdapter with idempotency`.

#### Task 1.6.2: harness validate fast-mode hook (TDD)

**Depends on:** Task 1.6.1 | **Files:** `packages/cli/src/skills/audit-component-anatomy/integrations/validate.ts`, matching `.test.ts`, `packages/cli/src/commands/validate.ts`

1. Create `validate.test.ts` asserting: (a) `runFastModeAnatomyCheck(cwd, config)` invokes the audit in fast mode; (b) respects `design.audit.componentAnatomy.enabled`; (c) returns `[]` quickly when disabled; (d) respects `design.audit.componentAnatomy.fastMode.maxFiles` cap; (e) emits findings tagged with the right severity from the strictness matrix.
2. Run vitest — failure.
3. Implement `integrations/validate.ts` exporting `runFastModeAnatomyCheck`. Modify `packages/cli/src/commands/validate.ts` to import and call it inside the existing "design" group, mapping returned findings into the existing `result.issues` shape.
4. Add/extend `packages/cli/src/commands/validate.test.ts` to assert anatomy findings appear in the issues list when enabled and are absent when disabled.
5. Run vitest — pass.
6. Run: `harness validate`.
7. Commit: `feat(validate): register fast-mode anatomy check under design group`.

#### Task 1.6.3: End-to-end idempotency + graph-shape integration test

**Depends on:** Task 1.6.2 | **Files:** `packages/cli/src/skills/audit-component-anatomy/integrations/end-to-end.test.ts`

1. Create the e2e test: spin up an in-memory `GraphStore`, run `runAudit` on a fixture project twice, assert: total VIOLATES edge count after run #1 == count after run #2; every edge has a populated `design_rule` target node; `meta.runId` is unique per run but edges from run #2 do not duplicate run #1's edges.
2. Run vitest — pass on first commit (logic is already in place; this is a guardrail).
3. Run: `harness validate`.
4. Commit: `test(audit-anatomy): add e2e idempotency + graph-shape guardrail`.

#### Phase 1.7 — Cross-skill integration

#### Task 1.7.1: Extend harness.config.json schema for `design.audit.componentAnatomy` (TDD)

**Depends on:** Task 1.5.1 | **Files:** `packages/cli/src/config/schema.ts`, `packages/cli/tests/config/anatomy-schema.test.ts`

1. Create `anatomy-schema.test.ts` asserting:
   - Valid config with `design.audit.componentAnatomy.enabled: true` parses cleanly.
   - `catalog: 'default'` and `catalog: './my-catalog'` both accepted.
   - `patterns: 'all'` / `patterns: 'none'` / `patterns: ['ANAT-P001', 'ANAT-P005']` all accepted.
   - `fastMode.maxFiles: -1` rejected.
   - Missing block entirely (back-compat) parses cleanly with defaults `{ enabled: false, catalog: 'default', patterns: 'all', fastMode: { patterns: false, maxFiles: 500 } }`.
2. Run vitest — failure.
3. Modify `packages/cli/src/config/schema.ts` adding the Zod object exactly per spec §"harness.config.json additions".
4. Run vitest — pass.
5. Run: `harness validate`.
6. Commit: `feat(config): add design.audit.componentAnatomy schema block`.

#### Task 1.7.2: Patch all four harness-accessibility SKILL.md variants with Phase 1 step 2.6

**Depends on:** Task 1.5.1 | **Files:** `agents/skills/{claude-code,cursor,codex,gemini-cli}/harness-accessibility/SKILL.md`

1. Locate the existing Phase 1 step 2.5 (i18n deferral) section in `agents/skills/claude-code/harness-accessibility/SKILL.md` (line ~28 from inspection).
2. Insert a new step 2.6 with the exact body from spec §"harness-accessibility deferral patch" — citing `getCatalogTypes()` from `@harness-engineering/cli/skills/audit-component-anatomy/exports.js` and the config key `design.audit.componentAnatomy.enabled`.
3. Repeat the identical insertion in the `cursor`, `codex`, `gemini-cli` variants (the prompt text is shared across agents).
4. Run: `harness skill validate harness-accessibility`.
5. Run: `harness validate`.
6. Commit: `feat(a11y): add Phase 1 step 2.6 — defer A11Y-010/050 to audit-component-anatomy when enabled`.

#### Task 1.7.3: End-to-end deferral test (anatomy enabled vs disabled)

**Depends on:** Task 1.7.2, Task 1.7.1 | **Files:** `packages/cli/src/skills/audit-component-anatomy/tests/deferral.e2e.test.ts`

1. Create the e2e test with two fixture sub-projects (in `os.tmpdir()`):
   - Project A: `harness.config.json` with `design.audit.componentAnatomy.enabled: true`. Contains `<Button>` (in catalog) with no accessible label AND `<button>` (raw HTML) with no label.
   - Project B: same files, `enabled: false`.
2. Assert (SC-13):
   - Project A → anatomy emits 1 ANAT-D finding for the missing `label` slot on `<Button>`; a11y emits 0 A11Y-010 findings for `<Button>` and 1 A11Y-010 for raw `<button>`. Total: 2 findings.
3. Assert (SC-14):
   - Project B → a11y emits 1 A11Y-010 for `<Button>` and 1 A11Y-010 for raw `<button>`; anatomy emits nothing. Total: 2 findings.
4. Run vitest — pass once skill plumbing is in place; if a11y's deferral lookup needs a small accessor change inside the a11y runtime (not just SKILL.md), implement it here. Document any runtime change in the commit body.
5. Run: `harness validate`.
6. Commit: `test(audit-anatomy): add e2e deferral test covering SC-13 and SC-14`.

#### Task 1.7.4: Regression sweep — confirm no unrelated a11y findings change

**Depends on:** Task 1.7.3 | **Files:** existing a11y tests + new `packages/cli/src/skills/audit-component-anatomy/tests/a11y-regression.test.ts`

1. Run the existing harness-accessibility test suite: `npx vitest run agents/skills/tests/a11y` (or equivalent — discover the suite location).
2. Create `a11y-regression.test.ts` exercising five existing a11y fixtures unrelated to A11Y-010/050. Assert: with `enabled: true`, finding counts for those five fixtures are unchanged vs. baseline.
3. Run vitest — pass.
4. Run: `harness validate`.
5. Commit: `test(a11y): add regression sweep proving SC-30 (no unrelated changes)`.

#### Phase 1.8 — Vertical-slice exit gate

#### Task 1.8.1: Vertical-slice exit checkpoint

**Depends on:** Task 1.7.4 | **Files:** none (review-only) | **Category:** review

`[checkpoint:human-verify]`

1. Run the full vitest suite: `pnpm --filter @harness-engineering/cli test`.
2. Run `harness validate` and `harness check-deps`.
3. Walk the spec's "Phase 1 exit criteria" line by line. Mark each SC as PASS or FAIL: SC-1, SC-2, SC-3, SC-4, SC-5 (for ANAT-P001 only), SC-10, SC-11, SC-12, SC-13, SC-14, SC-17, SC-20.
4. Present the table to a reviewer with the question: "Vertical slice exits — approve Phase 2?"
5. On approval, proceed. On rejection, capture remediation tasks before continuing.

---

### Phase 2 — Catalog Expansion

#### Phase 2.1 — Pattern catalog (ANAT-P002..ANAT-P010)

The nine pattern tasks all follow the same template; each task description spells out the substitutions.

#### Tasks 2.1.1 – 2.1.9: Author pattern catalog entries (one per task)

**Depends on:** Task 1.8.1 (Task 2.1.N depends on Task 2.1.N-1) | **Files (per task N for code 00N+1):** `packages/cli/src/skills/audit-component-anatomy/catalog/patterns/ANAT-P00<N+1>-<slug>.ts`, matching `.test.ts`, `tests/fixtures/pattern-p<NNN>/positive.tsx`, `tests/fixtures/pattern-p<NNN>/negative.tsx`

Pattern roster (codes locked here; the Phase 3 finding-codes.md may renumber if desired):

| Task | Code | Slug | Rough description |
|------|------|------|-------------------|
| 2.1.1 | ANAT-P002 | fetch-without-loading | Promise / async query rendered without a loading state |
| 2.1.2 | ANAT-P003 | error-boundary-missing | Subtree containing data fetches without an ErrorBoundary ancestor |
| 2.1.3 | ANAT-P004 | conditional-render-without-fallback | `{cond ? <X/> : null}` where `<X/>` is user-visible UI |
| 2.1.4 | ANAT-P005 | form-without-error-summary | Form with validation but no aggregate error region |
| 2.1.5 | ANAT-P006 | infinite-list-without-end-marker | Virtualized/infinite list without explicit end-of-data indicator |
| 2.1.6 | ANAT-P007 | modal-without-focus-trap | `<Modal>` mount without focus-trap or `useFocusTrap` usage |
| 2.1.7 | ANAT-P008 | toast-without-dismiss | `<Toast>` invocation lacking dismissible/autoDismiss configuration |
| 2.1.8 | ANAT-P009 | navigation-without-current-marker | Nav links rendered without `aria-current` consideration |
| 2.1.9 | ANAT-P010 | async-action-without-pending-state | `onClick` handler awaiting a promise without disabling/loading the trigger |

For each task:

1. Create positive + negative fixture files; positive must trigger the pattern, negative must not.
2. Create `<code>-<slug>.test.ts` asserting positive=1 finding, negative=0 findings, finding `code` matches.
3. Run vitest — failure.
4. Implement `<code>-<slug>.ts` exporting a `PatternRule` with `treeSitterQuery` (S-expr), `message`, `fixHint`, `source: { ref, url }`. Citations: APG, Open UI, Radix, or design-component-anatomy.
5. Register the rule in `catalog/index.ts` (single-line addition to the patterns array).
6. Run vitest — pass.
7. Run: `harness validate`.
8. Commit: `feat(audit-anatomy): add <code> <slug> pattern`.

#### Task 2.1.10: Catalog auto-registration smoke test

**Depends on:** Task 2.1.9 | **Files:** `packages/cli/src/skills/audit-component-anatomy/catalog/index.test.ts`

1. Create the test asserting: `getCatalogPatterns()` returns exactly 10 entries with codes ANAT-P001..ANAT-P010; codes are unique; every entry has non-empty `message` and `fixHint`.
2. Run vitest — pass.
3. Run: `harness validate`.
4. Commit: `test(audit-anatomy): assert pattern catalog completeness (10 patterns)`.

#### Phase 2.2 — Convention catalog (19 components in waves of 5)

The 19 convention tasks follow a shared template; bundled into waves of 5 with a mid-phase checkpoint.

#### Tasks 2.2.1 – 2.2.5: Convention wave 1 (Input, Select, Modal/Dialog, EmptyState, Card)

**Depends on:** Task 2.1.10 (within the wave: Task 2.2.N depends on Task 2.2.N-1) | **Files per task:** `packages/cli/src/skills/audit-component-anatomy/catalog/conventions/<slug>.ts`, matching `.test.ts`, fixtures `tests/fixtures/<slug>/{missing-required.tsx,complete.tsx}`

Per task:

1. Look up the component in REFERENCES.md tier-1 (APG / Open UI / Radix) and design-component-anatomy.
2. Create `missing-required.tsx` and `complete.tsx` fixtures matching the convention.
3. Create `<slug>.test.ts` asserting: missing-required → 1+ ANAT-D findings of expected codes; complete → 0 findings.
4. Run vitest — failure.
5. Author `<slug>.ts` exporting the `ConventionRule` (slots, states, variants, sizes, `source: { ref, url }` citing APG/Open UI/Radix).
6. Register the convention in `catalog/index.ts`.
7. Run vitest — pass.
8. Run: `harness validate`.
9. Commit: `feat(audit-anatomy): add <ComponentName> convention`.

#### Task 2.2.6: Mid-phase rule-engine review checkpoint

**Depends on:** Task 2.2.5 | **Files:** none (review-only) | **Category:** review

`[checkpoint:human-verify]`

1. Pause. Walk the 6 conventions shipped so far (Button + Input + Select + Modal/Dialog + EmptyState + Card). For each: confirm slot/state vocabulary is consistent; confirm no convention required a rule-engine change (if any did, the engine has a hidden coupling).
2. If any engine change was required to support a convention, file an "engine refactor before continuing" sub-task before Wave 2.
3. On approval, continue to Wave 2.

#### Tasks 2.2.7 – 2.2.11: Convention wave 2 (Tabs, Menu, Toast, Form, Accordion)

**Depends on:** Task 2.2.6 (within wave: Task 2.2.N depends on Task 2.2.N-1) | **Files:** same template as wave 1 with the appropriate component slugs

Repeat the template from Tasks 2.2.1-2.2.5 substituting each component name and its anatomy.

#### Tasks 2.2.12 – 2.2.16: Convention wave 3 (Tooltip, Popover, Drawer, Slider, Switch)

**Depends on:** Task 2.2.11 (within wave: Task 2.2.N depends on Task 2.2.N-1) | **Files:** same template

Repeat the template substituting each component name and its anatomy.

#### Tasks 2.2.17 – 2.2.20: Convention wave 4 (Checkbox, Radio, Avatar, Badge)

**Depends on:** Task 2.2.16 (within wave: Task 2.2.N depends on Task 2.2.N-1) | **Files:** same template

Repeat the template substituting each component name and its anatomy.

#### Task 2.2.21: Catalog completeness assertion

**Depends on:** Task 2.2.20 | **Files:** `packages/cli/src/skills/audit-component-anatomy/catalog/index.test.ts` (extended)

1. Extend the existing catalog-completeness test: assert `getCatalogTypes()` returns exactly the 20 expected component types listed in SC-7; assert every convention has a non-empty `source.ref`.
2. Run vitest — pass (or fail revealing missing entries — fix before commit).
3. Run: `harness validate`.
4. Commit: `test(audit-anatomy): assert convention catalog completeness (20 components)`.

#### Phase 2.3 — Catalog-expansion exit gate

#### Task 2.3.1: Phase 2 exit checkpoint + baseline FP measurement

**Depends on:** Task 2.2.21 | **Files:** none (review-only) | **Category:** review

`[checkpoint:human-verify]`

1. Run the full test suite: `pnpm --filter @harness-engineering/cli test`.
2. Record the baseline false-positive rate against whatever small corpus exists today (rough number — the rigorous 50-fixture corpus is built in Phase 3.4.2). Flag patterns with apparent high false-positive rates for Phase 3 attention.
3. Walk SC-6 (baseline only), SC-7, SC-8, SC-9 — mark each PASS/FAIL.
4. If FP rate exceeds 15% on the baseline corpus → invoke the spec's "Phase 2 stop condition": halt and triage before continuing.
5. On approval, proceed to Phase 3.

---

### Phase 3 — Polish

#### Phase 3.1 — Severity model + formatter + JSDoc hardening

#### Task 3.1.1: Severity matrix already implemented — verify production wiring (TDD)

**Depends on:** Task 2.3.1 | **Files:** `packages/cli/src/skills/audit-component-anatomy/findings/severity.test.ts` (extend), `packages/cli/src/skills/audit-component-anatomy/index.ts` (verify)

1. Extend `severity.test.ts` with an integration case: `runAudit({ ..., designStrictness: 'strict' })` returns findings whose severities are uniformly `error`; same with `permissive` returns no `error`s.
2. Run vitest — likely failure if `runAudit` does not thread strictness through. If it doesn't, plumb it via `resolveSeverity` on every finding before returning.
3. Run vitest — pass.
4. Run: `harness validate`.
5. Commit: `feat(audit-anatomy): apply strictness matrix to all findings in runAudit`.

#### Task 3.1.2: Markdown report formatter (TDD)

**Depends on:** Task 3.1.1 | **Files:** `packages/cli/src/skills/audit-component-anatomy/findings/formatter.ts`, matching `.test.ts`

1. Create `formatter.test.ts` asserting: formatter returns a Markdown string grouped by component file; each finding code links to `finding-codes.md#<code>`; group headers include file path and finding counts; summary header includes `Strictness: <value>` and `Findings: N (E error, W warn, I info)`.
2. Run vitest — failure.
3. Implement `formatter.ts` exporting `formatMarkdownReport(output: AuditAnatomyOutput, options?: { rootDir?: string }): string`.
4. Run vitest — pass.
5. Run: `harness validate`.
6. Commit: `feat(audit-anatomy): add Markdown report formatter (SC-19)`.

#### Task 3.1.3: JSDoc parser edge-case hardening (TDD)

**Depends on:** Task 3.1.2 | **Files:** `packages/cli/src/skills/audit-component-anatomy/resolvers/jsdoc-tags.test.ts` (extend), `jsdoc-tags.ts` as needed

1. Extend `jsdoc-tags.test.ts` covering: nested block comments, JSDoc without leading asterisks (`/* ... */` instead of `/** ... */`), files with multiple exported components (parser identifies which JSDoc binds to which export), tags on the wrong export (silently ignored, not crash).
2. Run vitest — likely failure on the new cases.
3. Harden `jsdoc-tags.ts` accordingly.
4. Run vitest — pass.
5. Run: `harness validate`.
6. Commit: `feat(audit-anatomy): harden JSDoc parser against multi-export + non-canonical comments`.

#### Phase 3.2 — Documentation

#### Task 3.2.1: Author finding-codes.md reference (SC-19, SC-21)

**Depends on:** Task 3.1.3 | **Files:** `docs/changes/design-pipeline/audit-component-anatomy/finding-codes.md`

1. Create the document with one section per finding code. Each section: `### ANAT-DXXX <Title>` followed by rationale, source citation, fix hint, example positive snippet, example negative snippet. Cover all ANAT-D codes used (ANAT-D000 for divergence + any ANAT-D001…N reserved during catalog work) and ANAT-P001..ANAT-P010.
2. Add anchor IDs matching the Markdown formatter's link targets.
3. Run: `harness validate`.
4. Commit: `docs(audit-anatomy): land finding-codes reference (SC-19, SC-21)`.

#### Task 3.2.2: Update AGENTS.md (SC-21)

**Depends on:** Task 3.2.1 | **Files:** `AGENTS.md`

1. Find the design-skills section in `AGENTS.md`. Add an entry for `harness-audit-component-anatomy` with one-line description and a cross-link from the audit list (alongside harness-accessibility).
2. Run: `harness validate`.
3. Commit: `docs(agents): list harness-audit-component-anatomy in design skills (SC-21)`.

#### Task 3.2.3: Update designer-quickstart.md (SC-21)

**Depends on:** Task 3.2.2 | **Files:** `docs/guides/designer-quickstart.md`

1. Add a "Running the anatomy audit" subsection with: one-paragraph overview; the command (`harness skill run harness-audit-component-anatomy`); a short example showing one ANAT-D finding rendered by the Markdown formatter; a follow-up paragraph on fixing it (per the fix hint).
2. Run: `harness validate`.
3. Commit: `docs(guides): add anatomy-audit quickstart subsection (SC-21)`.

#### Task 3.2.4: Update DESIGN.md template (SC-22)

**Depends on:** Task 3.2.3 | **Files:** `agents/skills/templates/DESIGN.md` *(or the canonical template — task discovers it via `find . -name DESIGN.md -path "*/templates/*"`)*

1. Locate the template via `find`. If multiple candidates, pick the one referenced by `harness init` (`grep -r "DESIGN.md" packages/cli/src/commands/init.ts`).
2. Add the two optional sections from spec §"DESIGN.md schema additions": `## Component Registry (optional)` and `## Component Anatomy Overrides (optional)` with the exact examples from the spec.
3. Run: `harness validate`.
4. Commit: `docs(design.md): document Component Registry + Anatomy Overrides sections (SC-22)`.

#### Phase 3.3 — ADRs + knowledge entries

#### Task 3.3.1: File three ADRs (SC-23)

**Depends on:** Task 3.2.4 | **Files:** `docs/knowledge/decisions/0018-hybrid-parser-strategy.md`, `0019-anatomy-finding-code-namespace.md`, `0020-cross-skill-deferral-pattern.md` *(task verifies next free number via `ls docs/knowledge/decisions/ | sort | tail`)*

1. Compute the next-free ADR number by listing existing ADRs (currently 0017 is the latest). Reserve 0018/0019/0020 in that order.
2. ADR-0018 "Hybrid parser strategy (tree-sitter + TS Compiler API)" — context: anatomy audit needs both type-aware definition checks and structural pattern checks; decision: each parser is used where it's strongest; consequences: tree-sitter joins the runtime dep set; alternatives considered: regex-only (rejected — can't express control-flow), AST-only (rejected — too slow for validate fast-mode).
3. ADR-0019 "Anatomy finding-code namespace (`ANAT-D*`/`ANAT-P*`/`ANAT-U*`)" — reserves three namespaces; documents `ANAT-U*` is reserved for v2 usage findings (none ship in v1 — SC-28); used by DesignConstraintAdapter and downstream sub-projects.
4. ADR-0020 "Cross-skill deferral pattern (i18n-style, generalized)" — formalizes the existing i18n deferral as a reusable mechanism; cites harness-accessibility step 2.5 (i18n) and step 2.6 (anatomy) as the two prior arts; outlines the `DEFERS_TO` graph edge as a future optional layer.
5. Use the existing ADR template (read `docs/knowledge/decisions/0001-tiered-integration-rigor.md` for shape).
6. Run: `harness validate`.
7. Commit: `docs(decisions): file ADRs 0018-0020 for audit-component-anatomy (SC-23)`.

#### Task 3.3.2: File three knowledge entries (SC-24)

**Depends on:** Task 3.3.1 | **Files:** `docs/knowledge/design/component-anatomy-rules.md`, `docs/knowledge/design/pattern-presence-audit.md`, `docs/knowledge/design/cross-skill-deferral.md`

1. Create the `docs/knowledge/design/` directory (does not exist today): `mkdir -p docs/knowledge/design`.
2. `component-anatomy-rules.md` — codifies the convention vocabulary (slot, state, variant, size, exclusivity, required). Reference design-component-anatomy as foundation.
3. `pattern-presence-audit.md` — codifies pattern-presence as a finding class. Explain why structural patterns need control-flow analysis. Reference REFERENCES.md gap #4.
4. `cross-skill-deferral.md` — codifies the i18n-style deferral as a general technique. Cite ADR-0020.
5. Run: `harness knowledge-pipeline --domain design --detect` to confirm the new entries are picked up.
6. Run: `harness validate`.
7. Commit: `docs(knowledge): land three design knowledge entries for anatomy audit (SC-24)`.

#### Phase 3.4 — Performance + quality

#### Task 3.4.1: Benchmark capture for fast-mode + full-mode (SC-15, SC-16)

**Depends on:** Task 3.3.2 | **Files:** `packages/cli/tests/skills/audit-component-anatomy/benchmark.test.ts`, `packages/cli/.harness/benchmark-baselines.json` (extend if present; otherwise create)
**Skills:** `ts-performance-patterns` (apply)

1. Create the benchmark test running `runAudit` against Harness's own repo (`process.cwd()` from CLI package root). Assert fast-mode `durationMs` ≤ 3000ms (SC-15) and full-mode `durationMs` ≤ 30000ms (SC-16). Record actual values in `benchmark-baselines.json` under key `audit-component-anatomy.{fastMode,fullMode}.ms` with a 10% regression tolerance.
2. Run vitest — pass (or fail revealing a real perf gap — fix before commit).
3. Run: `harness validate`.
4. Commit: `test(audit-anatomy): capture fast-mode + full-mode benchmarks (SC-15, SC-16)`.

#### Task 3.4.2: Build 50-fixture quality corpus + FP-rate test (SC-6)

**Depends on:** Task 3.4.1 | **Files:** `packages/cli/src/skills/audit-component-anatomy/tests/quality-corpus/false-positive-bait/*.tsx` (~30 files), `tests/quality-corpus/true-positive/*.tsx` (~20 files), `packages/cli/src/skills/audit-component-anatomy/tests/quality-corpus.test.ts`

1. Hand-curate 30 "this code is fine" fixtures targeting the patterns most prone to FPs (likely ANAT-P001, ANAT-P003, ANAT-P004, ANAT-P010). Each fixture is a small TSX file representing a real-world non-violation.
2. Hand-curate 20 "this code is broken" fixtures spread across the 10 patterns.
3. Create `quality-corpus.test.ts` running the audit over the whole corpus, computing FP rate = `false-positives / total-fixtures-where-no-finding-expected`. Assert FP rate ≤ 5%.
4. Run vitest. If FP rate > 5%, halt and apply the spec's Phase 3 stop condition: drop or refine underperforming patterns and update `proposal.md` (downgrade Decision #5 to "comprehensive (N patterns)") via an amendment in the same commit.
5. Run: `harness validate`.
6. Commit: `test(audit-anatomy): enforce FP-rate ≤ 5% via 50-fixture corpus (SC-6)`.

#### Task 3.4.3: Update REFERENCES.md status

**Depends on:** Task 3.4.2 | **Files:** `docs/changes/design-pipeline/REFERENCES.md`

1. Find the sub-project #2 status line and update it from whatever current marker to "done" / "shipped" (matching the repo's status convention — read the file first).
2. Run: `harness validate`.
3. Commit: `docs(design-pipeline): mark audit-component-anatomy sub-project as shipped`.

#### Phase 3.5 — Ship gate

#### Task 3.5.1: Full success-criteria walk + final validate

**Depends on:** Task 3.4.3 | **Files:** none (review-only) | **Category:** review

`[checkpoint:human-verify]`

1. Run the full test suite: `pnpm --filter @harness-engineering/cli test`.
2. Run the workspace test suite if needed: `pnpm test`.
3. Run `harness validate`, `harness check-deps`, and `harness skill validate harness-audit-component-anatomy`.
4. Walk every Success Criterion 1-30 from the spec. Mark each PASS/FAIL with a one-line note.
5. Present the table with the question: "Anatomy audit v1 ships — approve merge?"
6. On approval, write the session handoff and hand off to downstream (sub-project #4 brainstorming can begin).

---

## Dependencies and parallelism

- Phase 0 → Phase 1 → Phase 2 → Phase 3 (hard sequence at phase level).
- Within Phase 1: tasks 1.0.x are bootstrap; 1.1.x can run in parallel with 1.2.x once 1.0.3 lands; 1.3.x depends on 1.2.x and 1.1.x; 1.4.x depends on 1.3.x; 1.5.x – 1.7.x are mostly serial (each consumes the previous artifact).
- Within Phase 2: the 9 pattern tasks (2.1.1-2.1.9) are independent and can be parallelized across agents if desired — each touches only its own files. The 19 convention tasks are similarly independent within each wave; the inter-wave checkpoint (Task 2.2.6) is the only sync point.
- Within Phase 3: 3.1.x are serial (formatter depends on severity wiring); 3.2.x are serial-by-convention but the four doc updates are independent files and could be parallelized; 3.3.1 and 3.3.2 can run in parallel; 3.4.x are serial.

## Re-entry points

- After Phase 0: re-enter at Task 1.0.1 with the spike doc as input.
- After Phase 1 (Task 1.8.1 approved): re-enter at Task 2.1.1.
- After Phase 2 (Task 2.3.1 approved): re-enter at Task 3.1.1.
- After Phase 3 (Task 3.5.1 approved): handoff to sub-project #4 brainstorming.

## Checkpoints summary

Total: **5 checkpoints**, all `[checkpoint:human-verify]`:

| Task | Purpose |
|------|---------|
| 0.3 | Schema-fit review before Phase 1 commits |
| 1.8.1 | Vertical-slice exit gate |
| 2.2.6 | Mid-catalog rule-engine sanity check |
| 2.3.1 | Catalog-expansion exit gate + baseline FP measurement |
| 3.5.1 | Ship gate — full SC walk |

## Harness Integration

- **`harness validate`** — Run at Phase 4 of planning (just completed); included as the final step of every code-producing task.
- **`harness check-deps`** — Referenced in tasks 1.0.1 and 1.5.2 (any task adding imports across packages).
- **Plan location** — `docs/changes/design-pipeline/audit-component-anatomy/plans/2026-05-23-audit-component-anatomy-plan.md` (this file), alongside `proposal.md`.
- **Skill index regeneration** — Task 1.5.4 regenerates `.harness/skills-index.json` and slash commands once SKILL.md + skill.yaml land.
- **Knowledge baseline** — Phase 3.3.2 creates `docs/knowledge/design/` (does not exist today) with three new entries. After landing, `harness knowledge-pipeline --domain design` will surface the new domain.
- **Integration tier** — `large` per the spec's three-ADR scope + new public API surface (MCP tool, named export, config block).

## Concerns flagged

1. **`packages/cli/src/skills/` does not exist yet.** The spec calls for the new module there, but no precedent exists in the current source tree (skills currently live only under `agents/skills/<agent>/`). The plan creates this parent dir at Task 1.0.2; if the project prefers a different home (e.g. `packages/cli/src/audit-anatomy/` to avoid confusion with the agent-skills authoring location), all "packages/cli/src/skills/audit-component-anatomy" paths need a rename. Mechanical; no logic impact.
2. **Tree-sitter native bindings on CI.** Tree-sitter requires node-gyp at install time. If CI runners lack the toolchain, install will fail. Task 1.0.1 includes a fallback to an older version; if both fail we need a CI runner change before Phase 1 can continue.
3. **`DesignConstraintAdapter` extension surface unclear.** The plan assumes the adapter accepts a new `recordFindings` method or that the lower-level `GraphStore` is reachable. Task 1.6.1 verifies and adapts; worst case is a small refactor inside `packages/graph/`. Plan does not pre-commit to that refactor — flagged as an in-task decision.
4. **a11y deferral runtime path may need a code change** beyond the SKILL.md prose edit. If harness-accessibility resolves config in a runtime module (not just by the SKILL.md prompt), Task 1.7.3 will need to extend that resolution path. Currently no separate runtime is known (a11y appears to be prompt-driven) — this is captured in Task 1.7.3's commit-body note.
5. **Catalog wave sizing is aggressive.** 5 conventions per wave is the upper bound of "atomic-task-per-component" — each is ~25-40 min per the spec. If an executor agent loses context mid-wave, it should split into 5 separate task invocations rather than batching. The wave grouping is for human readability of the plan, not for execution batching.
6. **`docs/knowledge/design/`** directory does not exist. Created by Task 3.3.2's `mkdir -p`. If the knowledge taxonomy requires registration elsewhere (e.g. in `docs/knowledge/README.md`), that registration task is missing from the plan — flag for in-task adjustment.

## Gates

- Every task has exact file paths, exact commands, and (for catalog/code tasks) a complete spec of what to author.
- No task touches more than ~3 files except where wave-bundling is explicit (Wave-of-5 convention tasks each touch 4 files — convention + test + 2 fixtures).
- Every code-producing task starts with TDD (write test → fail → implement → pass).
- Every code-producing task ends with `harness validate` and a conventional commit.
- Observable truths trace to specific tasks via the SC-N labels on each truth and the SC references in task acceptance criteria.
- File map enumerates every file to be created or modified before task decomposition.
- 5 checkpoints placed at all natural human-review boundaries (schema spike, vertical slice, mid-catalog, catalog exit, ship).
- Catalog tasks use a documented template (one task = one component / pattern) so a fresh agent can pick up Task 2.1.5 (for example) and have all the context needed.
