# Audit Component Anatomy

> Detect missing required anatomy parts in component definitions and missing-anatomy-component patterns in composition. First programmatic enforcer of component-anatomy rules — finds what design-component-anatomy reference content prescribes.

## When to Use

- Reviewing component-library code for completeness of slots, states, sizes
- Detecting compositional patterns where a needed anatomy component is missing (e.g., `.map()` over data with no empty branch; async actions with no loading boundary)
- After component-library changes to verify anatomy contracts still hold
- Before merging UI changes to catch anatomy regressions
- When `on_new_feature` triggers fire and the feature touches a component definition or usage
- NOT for token validation (use harness-design-system)
- NOT for accessibility compliance (use harness-accessibility — overlap is documented; this skill defers label-association findings to a11y)
- NOT for aesthetic critique or polish suggestions (use harness-design-craft)
- NOT for declared-anti-pattern enforcement (use harness-design)

## Process

### Phase 1: SCAN — Identify component types and run audits

1. **Read project configuration.** Check `harness.config.json` for:
   - `design.strictness` — `strict`/`standard`/`permissive` (default `standard`)
   - `design.audit.componentAnatomy.enabled` — gate for the entire audit AND the harness-accessibility deferral (default `true`)
   - `design.audit.componentAnatomy.catalog` — `"default"` or path to project-supplied catalog
   - `design.audit.componentAnatomy.patterns` — `"all"`, `"none"`, or explicit list of pattern codes
   - `design.audit.componentAnatomy.fastMode.{patterns,maxFiles}` — fast-mode controls

2. **Load source-of-truth catalogs (resolution order, most specific wins):**
   - Component author's JSDoc `@component-type X` + `@anatomy-slot ...` etc. — file-level self-declaration
   - `design-system/DESIGN.md` `## Component Registry` + `## Component Anatomy Overrides` — project-level
   - Built-in convention library (20 component types: Button, Input, Select, Modal/Dialog, EmptyState, Card, Tabs, Menu, Toast, Form, Accordion, Tooltip, Popover, Drawer, Slider, Switch, Checkbox, Radio, Avatar, Badge) — fallback default
   - No match for a file's component-type → silent skip (no false positives)

3. **Identify component type per file** using the same resolution order:
   - JSDoc `@component-type X` tag → file IS X
   - DESIGN.md Component Registry mapping → use that
   - Top-level export name matches a catalog entry → use that
   - No match → skip silently

4. **Run convention audit (definition findings, `ANAT-D*` codes).** For each catalogued component file:
   - Parse component definition via TypeScript Compiler API (AST)
   - Extract exported component's prop type / interface
   - Check that each required anatomy part (slot, state, variant, size) is exposed as a prop or sub-component
   - Emit `ANAT-D{NNN}` finding for each missing required part
   - Emit `ANAT-D000` info finding when JSDoc declaration diverges from catalog convention

5. **Run pattern audit (pattern-presence findings, `ANAT-P*` codes).** For each file matching pattern targets:
   - Parse via tree-sitter (`tree-sitter-typescript` + `tree-sitter-tsx`)
   - Run each enabled pattern's S-expression query
   - Post-process captures to confirm pattern presence (e.g., `.map()` without an empty-branch guard)
   - Emit `ANAT-P{NNN}` finding for each match
   - Skip patterns NOT enabled in `design.audit.componentAnatomy.patterns`

6. **Check for harness-accessibility overlap deferral.** When `design.audit.componentAnatomy.enabled = true`, this skill OWNS label-slot definition findings; harness-accessibility defers A11Y-010 and A11Y-050 for catalogued components. Track deferrals in `meta.deferralsToHarnessDesign` count.

### Phase 2: EVALUATE — Apply severity model

1. **Map finding severity using `design.strictness`:**
   - `strict` — all findings are `error` severity (CI blocks)
   - `standard` — required-part missing → `error`; optional-part missing → `warn`; info findings → `info`
   - `permissive` — all findings → `info` (nothing blocks)

2. **Cross-reference with graph constraints.** If a graph exists at `.harness/graph/`:
   - Query existing `VIOLATES_CRAFT` edges via extended `DesignConstraintAdapter`
   - Identify NEW violations (not in graph) and RESOLVED violations (in graph but not in current scan)

3. **De-duplicate via deferral.** When this skill produces a finding whose root-cause is also tracked by harness-accessibility, prefer this skill's finding (anatomy-level cause) and increment deferrals counter.

### Phase 3: REPORT — Format and persist findings

1. **Write VIOLATES_CRAFT edges to graph.** Each finding becomes:
   - Source: component file (`code_file` node) or component (`component` node)
   - Target: `design_rule` node keyed by finding code (`ANAT-D023`, `ANAT-P001`)
   - Metadata: severity, line, message, evidence snippet, runId
   - Idempotent: re-running the audit produces no duplicate edges

2. **Format the report.** Grouped by component file, with finding codes linked to `docs/changes/design-pipeline/audit-component-anatomy/finding-codes.md`. Each finding includes:
   - Code (e.g., `ANAT-D023`)
   - Severity per `design.strictness`
   - File path + line number
   - Component type (if identified)
   - Message + evidence snippet
   - Fix hint (concrete next-step text — not "fix this")

3. **Emit summary.** Total findings, breakdown by severity, count of `meta.deferralsToHarnessDesign`, mode (`fast`/`full`), `runId`.

## Harness Integration

- **`harness validate`** — Fast-mode audit hook (convention catalog only; patterns are opt-in via `fastMode.patterns: true`). Findings respect `design.strictness`.
- **`mcp__harness__audit_anatomy`** — Programmatic API (input: path, mode, files, designStrictness, catalog; output: findings, summary, catalog applied, deferrals count). Consumed by harness check-design verifier (sub-project #4) and design-pipeline orchestrator (sub-project #5).
- **`DesignConstraintAdapter`** — Extended to register `ANAT-*` rule code namespace and write VIOLATES_CRAFT edges. Mirrors how harness-accessibility uses it for A11Y-* codes.
- **`harness-accessibility`** — Coordinates via i18n-style deferral pattern. When `design.audit.componentAnatomy.enabled = true`, a11y defers A11Y-010 and A11Y-050 for catalogued components.
- **`design-component-anatomy`** (knowledge skill) — Source of convention vocabulary (slot, variant, state, size, exclusivity, required). This skill's catalog operationalizes that knowledge.

## Success Criteria

See `docs/changes/design-pipeline/audit-component-anatomy/proposal.md` for the full 30 success criteria. Highlights:
- Convention findings produced for known component types only (silent skip for unknown — zero false positives)
- JSDoc self-declaration overrides convention; DESIGN.md overrides convention but not JSDoc
- Pattern false-positive rate ≤ 5% on the 50-fixture corpus
- harness-accessibility deferral works (one finding for one root cause, not two)
- Fast-mode runtime ≤ 3s on 500-file repo

## Gates

- **No findings without a parsed catalog.** If the convention library or DESIGN.md catalog cannot be loaded, stop with an explanatory error — do not emit speculative findings.
- **No usage-side findings in v1.** Only `ANAT-D*` (definition) and `ANAT-P*` (pattern) codes. Usage findings (`ANAT-U*`) ship in v2.
- **No autofix.** Findings include fix-hint text only; source files are never modified by this skill.
- **Strictness from config, not assumed.** Read `design.strictness` from `harness.config.json`; default to `standard` if absent.

## Status

**v1 — in implementation.** See:
- Spec: `docs/changes/design-pipeline/audit-component-anatomy/proposal.md`
- Plan: `docs/changes/design-pipeline/audit-component-anatomy/plans/2026-05-23-audit-component-anatomy-plan.md`
- Finding codes: `docs/changes/design-pipeline/audit-component-anatomy/finding-codes.md`
- Roadmap entry: `design-pipeline sub-project #2` in `docs/roadmap.md`
