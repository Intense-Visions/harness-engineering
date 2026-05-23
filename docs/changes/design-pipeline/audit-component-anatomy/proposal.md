# audit-component-anatomy

> An audit skill that detects missing required anatomy parts in component definitions and missing-anatomy-component patterns in composition. The first programmatic enforcer of component-anatomy rules.

## Overview

**Project:** audit-component-anatomy
**Initiative:** design-pipeline (sub-project #2 of 5)
**Date:** 2026-05-23
**Estimated effort:** ~3 weeks (Sprint 1: vertical slice, Sprint 2: catalog expansion, Sprint 3: polish)

### Goals

1. **Detect missing required anatomy parts in component definitions** for catalogued component types (Button, Input, Select, Modal/Dialog, Card, Tabs, Menu, Toast, Form, Accordion, Tooltip, Popover, Drawer, Slider, Switch, Checkbox, Radio, Avatar, Badge, EmptyState — 20 total). Findings coded `ANAT-D*` (definition).

2. **Detect missing-anatomy-component patterns in composition** — pattern-presence findings such as data lists without empty states, async actions without loading boundaries, conditional renders without fallbacks. 10+ patterns coded `ANAT-P*` (pattern-presence). This is the blue-ocean differentiator — no published tool produces this finding class (REFERENCES.md gap #4).

3. **Coordinate cleanly with harness-accessibility** via the i18n-style deferral pattern. When `design.audit.componentAnatomy.enabled = true`, harness-accessibility defers label-association findings (A11Y-010, A11Y-050) for components in the anatomy catalog. No double-counting.

4. **Provide a stable programmatic API** via MCP tool `mcp__harness__audit_anatomy` so design-pipeline sub-project #4 (check-design verifier) and #5 (orchestrator) consume findings without knowledge of internals.

5. **Source the catalog from public specs** (ARIA APG, Open UI, Radix Primitives, and the existing design-component-anatomy knowledge skill) so the rules are defensible and traceable.

### Non-Goals

- **Usage-side findings** (`<Input>` call site missing label prop): deferred to v2 once the a11y deferral pattern proves out on a smaller surface.
- **Automatic fixes / codemods**: anatomy fixes are structural, not mechanical (adding a `label` prop changes the component contract). Out of scope for v1; align-design-system (sub-project #1a) is the natural home if we ever do this.
- **ESLint plugin packaging**: the skill + MCP + validate surface covers all three consumer types (human/CI/agent). ESLint would be redundant.
- **Visual regression, contrast, token validation**: covered by harness-accessibility and the design-system-skills family. Anatomy audits structure, not appearance.
- **Per-line autofix suggestions**: findings include "how to fix" guidance text but not code patches.

### Keywords

`component-anatomy`, `audit`, `design-system`, `tree-sitter`, `AST`, `anatomy-conventions`, `pattern-presence`, `definition-findings`, `DesignConstraintAdapter`, `design-strictness`, `JSDoc-anatomy-tags`, `a11y-deferral`

---

## Decisions

Compiled from the brainstorming Q&A. Each row records the question, the chosen option, and a one-line rationale.

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Source of truth for anatomy rules | **Hybrid stack:** JSDoc `@anatomy` self-declaration → DESIGN.md per-component override → convention library default → silent skip | Day-1 value via conventions; escape hatch via DESIGN.md; per-component author ownership via JSDoc. Mirrors harness-accessibility. |
| 2 | v1 finding classes | **Definition + pattern-presence** (`ANAT-D*` + `ANAT-P*`). Usage findings deferred to v2. | Pattern-presence is the blue-ocean differentiator (REFERENCES.md gap #4). Skipping usage in v1 avoids a11y overlap noise pre-v2. |
| 3 | Component-type identification | **Hybrid stack** (mirrors #1): JSDoc `@component-type` tag → DESIGN.md `## Component Registry` → top-level export-name catalog match → silent skip | Consistent mental model with #1. Export-name covers 80%+ of well-organized React codebases; explicit overrides for the long tail. |
| 4 | Invocation + output surface | **Skill + MCP tool + graph + validate integration** (mirrors harness-accessibility). MCP: `mcp__harness__audit_anatomy`. Graph: VIOLATES edges via `DesignConstraintAdapter`. | Zero new CLI surface; exact precedent already proven; three consumer types (human/CI/agent) all covered without bespoke plumbing. |
| 5 | Catalog scope (v1) | **Comprehensive: 20 conventions + 10 patterns.** Conventions from APG, Open UI, Radix. Patterns include map-without-empty, fetch-without-loading, error-boundary-missing + 7 more. | "World-class toolset" goal requires comprehensive catalog. v1 ships as the reference (no published competitor at this breadth). |
| 6 | a11y overlap policy | **i18n-style deferral pattern.** When `design.audit.componentAnatomy.enabled = true`, harness-accessibility defers A11Y-010 and A11Y-050 for components in the anatomy catalog. | Pattern already proven in harness-accessibility's i18n integration (Phase 1 step 2.5). Zero new infrastructure; survives into v2. |
| 7 | Pattern detection parser | **Hybrid: tree-sitter for pattern findings (structural, fast) + TypeScript Compiler API (AST) for definition findings (type-aware).** Each parser used where it's strongest. | tree-sitter speed needed for validate-time fast-mode; AST type info needed for "Input prop type missing label" definition checks. |
| 8 | Spec location | **`docs/changes/design-pipeline/audit-component-anatomy/proposal.md`** — nested under the initiative directory alongside REFERENCES.md | Keeps the design-pipeline initiative bundle coherent across all 5 sub-projects. |
| 9 | Build sequencing | **Vertical slice first (Sprint 1: 5-7d), catalog expansion second (Sprint 2: 10-12d), polish third (Sprint 3: 3-5d).** Sprint 1 implements end-to-end pipeline on Button + ANAT-P001. | Architecture risk validated week 1 before scaling catalog work. Catalog entries become ~30-min additions once schema is locked. |

### Rationalizations rejected during brainstorming

| Rationalization | Why rejected |
|-----------------|--------------|
| "Convention library is enough — skip JSDoc/DESIGN.md override layers" | Convention-only fails opinionated projects with renamed components; the hybrid stack costs nothing when unused. |
| "Use regex like harness-accessibility does — simpler" | Regex cannot detect control-flow patterns like map-without-empty; would force dropping ~6 of Q5's 10 patterns. |
| "Build the catalog first since the engine is mechanical" | Specs authored before engine reveal what tree-sitter can/can't express; risk of late rework. Vertical slice mitigates. |
| "Ship usage findings in v1 — that's where the real value is" | Usage findings overlap heavily with a11y and require deferral design upfront. v1 proves the deferral pattern on a smaller surface first. |
| "ESLint plugin is the standard CI tool — package it that way" | Definition + pattern-presence findings are file-level not line-level; ESLint fits poorly. The MCP+validate surface covers CI. |

---

## Technical Design

### File layout

```
packages/cli/src/skills/audit-component-anatomy/
  SKILL.md
  skill.yaml
  src/
    index.ts                          # MCP tool entry + skill orchestrator
    parsers/
      ast.ts                          # TypeScript Compiler API wrapper
      tree-sitter.ts                  # tree-sitter wrapper + query runner
    resolvers/
      source-of-truth.ts              # JSDoc → DESIGN.md → conventions
      component-type.ts               # JSDoc → registry → export-name
    rules/
      convention-rule.ts              # ConventionRule type + runner (AST-based)
      pattern-rule.ts                 # PatternRule type + runner (tree-sitter)
    catalog/
      conventions/
        button.ts
        input.ts
        ...                           # 20 files, one per component type
      patterns/
        ANAT-P001-map-without-empty.ts
        ANAT-P002-fetch-without-loading.ts
        ...                           # 10+ files, one per pattern
    findings/
      finding.ts                      # Finding type + code scheme
      severity.ts                     # design.strictness → severity mapping
      formatter.ts                    # Markdown/JSON formatters
    integrations/
      design-constraint-adapter.ts    # Graph VIOLATES-edge emitter
      validate.ts                     # harness validate fast-mode hook
  tests/
    fixtures/                         # JSX/TSX fixtures for each rule
    parsers/
    resolvers/
    rules/
    catalog/
    integrations/
```

### Data structures

```ts
// findings/finding.ts
export type AnatomyFindingCode = `ANAT-D${string}` | `ANAT-P${string}`;
export type Severity = 'error' | 'warn' | 'info';

export interface AnatomyFinding {
  code: AnatomyFindingCode;          // e.g. 'ANAT-D023', 'ANAT-P001'
  severity: Severity;
  file: string;                       // project-relative path
  line: number | null;                // null for whole-file definition findings
  column?: number;
  componentType: string | null;       // 'Button' if identified, null otherwise
  message: string;                    // human-readable summary
  evidence: { snippet: string; contextLines?: string };
  rule: { id: string; source: string }; // 'ANAT-D023', 'APG/button#anatomy'
  fix: { kind: 'manual' | 'codemod-todo'; description: string };
}

// rules/convention-rule.ts
export interface ConventionRule {
  componentType: string;              // 'Button'
  slots: AnatomyPart[];
  states: AnatomyPart[];
  variants: AnatomyPart[];
  sizes: AnatomyPart[];
  source: { ref: string; url?: string }; // 'APG/button', 'Radix/Button'
}
export interface AnatomyPart {
  name: string;                       // 'label', 'loading'
  required: boolean;
  exclusive?: boolean;                // states only — cannot combine
  fixHint: string;                    // 'Add a `label` prop of type string'
}

// rules/pattern-rule.ts
export interface PatternRule {
  code: AnatomyFindingCode;           // 'ANAT-P001'
  treeSitterQuery: string;            // S-expr query for tree-sitter-tsx
  severityDefault: Severity;
  message: (capture: TreeSitterCapture) => string;
  fixHint: string;
  source: { ref: string; url?: string };
}
```

### MCP tool API

```ts
// mcp__harness__audit_anatomy
interface AuditAnatomyInput {
  path: string;                        // project root
  mode: 'fast' | 'full';
  files?: string[];                    // optional scoping (paths or globs)
  designStrictness?: Strictness;       // override harness.config.json
  catalog?: string[];                  // optional subset of conventions/patterns
}
interface AuditAnatomyOutput {
  findings: AnatomyFinding[];
  summary: {
    totalFiles: number;
    durationMs: number;
    bySeverity: Record<Severity, number>;
    byCode: Record<string, number>;
  };
  catalog: { conventionsApplied: string[]; patternsApplied: string[] };
  meta: { mode: 'fast' | 'full'; deferredToA11y: number };
}
```

Fast mode runs only convention catalog (cheap AST scan, ~10 files/sec). Full mode runs both catalogs plus pattern queries (~1-2 files/sec on tree-sitter side). `harness validate` calls fast mode.

### JSDoc tag grammar

Authoritative for component-level self-declaration (Decision #1 layer 1, Decision #3 layer 1). One tag per line, JSDoc-idiomatic:

```ts
/**
 * Button component. Use for all primary, secondary, and tertiary actions.
 *
 * @component-type Button
 * @anatomy-slot content required
 * @anatomy-slot icon-leading
 * @anatomy-slot icon-trailing
 * @anatomy-state default
 * @anatomy-state hover
 * @anatomy-state focus
 * @anatomy-state disabled exclusive
 * @anatomy-state loading exclusive
 * @anatomy-variant primary|secondary|ghost|danger
 * @anatomy-size sm|md|lg
 */
export const Button = (...) => ...
```

Tags resolve against the convention catalog when present. Missing tags inherit catalog defaults. Contradiction between JSDoc and convention is permitted (JSDoc wins) but emits an `ANAT-D000` info finding so the divergence is visible.

### DESIGN.md schema additions

Two new sections, both optional:

```markdown
## Component Registry (optional)

Type-to-file mapping. Used by component-type resolver when JSDoc tag absent and export-name fallback ambiguous.

| Type   | File                            | Notes        |
|--------|---------------------------------|--------------|
| Button | packages/ui/src/Button.tsx      |              |
| Input  | packages/ui/src/Input/index.tsx | compound     |

## Component Anatomy Overrides (optional)

Per-component overrides of the convention library. Used when project intentionally diverges from APG/Radix conventions.

### Button

slots:
  - content (required)
  - icon-leading
  - icon-trailing
states:
  - default
  - hover
  - focus
  - disabled (exclusive)
  - loading (exclusive)
variants: primary, secondary, ghost
sizes: sm, md, lg
```

### harness.config.json additions

```json
{
  "design": {
    "strictness": "standard",
    "audit": {
      "componentAnatomy": {
        "enabled": true,
        "catalog": "default",
        "patterns": "all",
        "fastMode": {
          "patterns": false,
          "maxFiles": 500
        }
      }
    }
  }
}
```

- `enabled`: gate for the entire audit AND the a11y deferral
- `catalog`: `"default"` or a path to a project-supplied override catalog
- `patterns`: `"all"`, `"none"`, or an explicit list of pattern codes
- `fastMode.patterns`: whether validate-time runs pattern queries (default false — patterns are full-mode only)
- `fastMode.maxFiles`: cap to keep validate fast on large repos

### Parser stack architecture

**AST (TypeScript Compiler API) — definition findings**

- Loaded lazily; only spun up when convention rules need to run.
- Per-file workflow: `ts.createSourceFile` → `forEachChild` walk → extract exported component declarations → resolve prop type to a `ts.TypeLiteralNode` or `ts.InterfaceDeclaration` → check for required anatomy parts as type members.
- Caches per-file ASTs across rules during a single audit run.

**Tree-sitter — pattern findings**

- Grammars vendored: `tree-sitter-typescript`, `tree-sitter-tsx`.
- Each pattern rule supplies an S-expr query; runner compiles and applies per file.
- Tree-sitter parses are fully cached between rules so 10 patterns share one parse per file.
- Query result captures feed into the rule's `message(capture)` function.

Example pattern query (ANAT-P001 map-without-empty):

```scheme
(call_expression
  function: (member_expression
    property: (property_identifier) @method
    (#eq? @method "map"))
  arguments: (arguments
    (arrow_function
      body: (jsx_element) @rendered))) @map-call
```

Postprocessing checks whether `@map-call` is inside a conditional guarding for empty arrays (`items.length === 0 ? <Empty/> : items.map(...)`). No guard → finding.

### Graph integration (DesignConstraintAdapter)

Each finding becomes a `VIOLATES` edge:

- Source node: component file (`code_file`) or component node (`component`) if the graph has it
- Target node: a `design_rule` node keyed by the finding code (`ANAT-D023`, `ANAT-P001`). Created on demand if absent.
- Edge metadata: severity, line, message, evidence snippet, runId.

The adapter exposes `recordFindings(findings: AnatomyFinding[])` which audit-component-anatomy calls once per audit run after computing findings. The adapter handles deduplication against existing edges.

### harness-accessibility deferral patch

The only edit to the a11y skill, mirroring its existing i18n deferral (Phase 1 step 2.5). Add a new step:

```
Phase 1 step 2.6 (NEW) — Check for component-anatomy skill overlap

Read harness.config.json for design.audit.componentAnatomy.enabled.
If true:
  - Load the anatomy catalog component-type set from the audit module
    (the same module the audit skill uses — single source of truth)
  - When scanning, identify each component reference's type using the
    Decision #3 resolver (JSDoc → DESIGN.md registry → export-name match)
  - For components whose identified type is in the catalog:
      - DEFER A11Y-010 (interactive without accessible label)
      - DEFER A11Y-050 (input/select/textarea without label)
    These findings will instead be produced by audit-component-anatomy
    as ANAT-D* (definition-side) in v1, ANAT-U* (usage-side) in v2.
  - For raw HTML elements and unidentified components: scan as normal.
If false or absent: scan A11Y-010 and A11Y-050 as normal.
```

The catalog set is exposed by audit-component-anatomy via a stable named export (`getCatalogTypes(): string[]`) so a11y has zero rule-content duplication.

---

## Integration Points

### Entry Points

| Kind | Path / Identifier | New / Modified |
|------|-------------------|----------------|
| Skill | `packages/cli/src/skills/audit-component-anatomy/{SKILL.md,skill.yaml}` | NEW |
| MCP tool | `mcp__harness__audit_anatomy` | NEW |
| Skill module export | `getCatalogTypes(): string[]` from the skill's `index.ts` | NEW — consumed by harness-accessibility |
| `harness validate` hook | New validation check registered under "design" group | NEW |
| Skill (modified) | `harness-accessibility` — adds Phase 1 step 2.6 (a11y deferral) | MODIFIED |
| Config schema | `harness.config.json` — adds `design.audit.componentAnatomy.*` block | MODIFIED |
| DESIGN.md schema | Two optional sections: `## Component Registry`, `## Component Anatomy Overrides` | MODIFIED (schema extension) |

### Registrations Required

1. **Skill index regeneration** — `.harness/skills-index.json` regenerated to include the new skill (`tier: 2`, `type: rigid`, matching harness-accessibility's classification).
2. **MCP tool registry** — `mcp__harness__audit_anatomy` added to the tool registry (alongside other `mcp__harness__*` tools).
3. **harness validate pipeline** — register the fast-mode anatomy check under the existing "design" validation group; respects `design.audit.componentAnatomy.enabled`.
4. **Config schema validation** — extend the Zod (or equivalent) schema that validates `harness.config.json` to allow the new `design.audit.componentAnatomy.{enabled,catalog,patterns,fastMode}` keys.
5. **DesignConstraintAdapter rule namespace** — register the `ANAT-*` code namespace so the adapter accepts and routes VIOLATES edges with anatomy finding codes.
6. **Skill barrel** — export the skill from the skill registry barrel (whichever module assembles skills for the CLI runner and MCP).
7. **harness-accessibility config check** — add the `design.audit.componentAnatomy.enabled` lookup to its config-resolution path.

### Documentation Updates

| Doc | Update |
|-----|--------|
| `AGENTS.md` | Add audit-component-anatomy under the design-skills section; cross-link from the audit list |
| `docs/guides/designer-quickstart.md` | Add "Running the anatomy audit" subsection; show example finding + fix |
| `docs/changes/design-pipeline/audit-component-anatomy/finding-codes.md` (NEW) | Reference page listing every `ANAT-D*` and `ANAT-P*` code with rationale, source, and fix hint |
| `docs/changes/design-pipeline/REFERENCES.md` | Mark sub-project #2 status as in-progress when implementation starts |
| `harness-accessibility` SKILL.md (in cli package source) | Add Phase 1 step 2.6 documenting the new deferral |
| DESIGN.md template / docs | Document the new `## Component Registry` and `## Component Anatomy Overrides` sections |
| `harness.config.json` schema reference | Document `design.audit.componentAnatomy.*` keys and defaults |

### Architectural Decisions

Three ADRs warranted (medium-large tier change with cross-cutting implications):

| ADR | One-line rationale |
|-----|---------------------|
| **ADR-001: Hybrid parser strategy (tree-sitter + TS AST)** | First introduction of tree-sitter into the harness ecosystem; documents the per-workload parser choice and sets the precedent for future skills that need fast structural matching. |
| **ADR-002: Anatomy finding code namespace (`ANAT-D*`/`ANAT-P*`/`ANAT-U*`)** | Reserves three namespaces (definition/pattern/usage), establishes the stable contract for DesignConstraintAdapter and downstream skills (#4 verifier, #5 orchestrator). |
| **ADR-003: Cross-skill deferral pattern (i18n-style, generalized)** | Formalizes the harness-accessibility/i18n/anatomy three-way deferral as the standard mechanism for resolving overlapping audit findings between skills; reusable for future audits. |

### Knowledge Impact

**New domain concepts** (to enter `docs/knowledge/design/`):

- `component-anatomy-rules.md` — codifies the convention catalog vocabulary (slot, variant, state, size, exclusivity, required), referencing the existing `design-component-anatomy` knowledge skill as foundation
- `pattern-presence-audit.md` — codifies the pattern-presence finding class (the blue-ocean concept); explains why structural patterns require control-flow analysis
- `cross-skill-deferral.md` — codifies the i18n-style deferral as a general technique (lifted from harness-accessibility's i18n integration, now also used for anatomy); references ADR-003

**New graph node types / extensions**:

- `design_rule` node — keyed by finding code (`ANAT-D023`, `ANAT-P001`, also future `A11Y-*` codes if backfilled). Carries `source`, `severity_default`, `description`.
- `component_type` node (optional) — keyed by Decision #3 type (`Button`, `Input`). Links components to their conventions. Skip in v1 if not needed.

**New graph edges**:

- `VIOLATES (code_file → design_rule)` — emitted by DesignConstraintAdapter per finding. Carries `severity`, `line`, `runId`, `evidence`.
- `DEFERS_TO (skill → skill)` (optional, ADR-003 may codify) — declarative record of cross-skill deferrals. Skip in v1 if config-keyed deferral proves enough.

**Existing graph nodes that gain meaning**:

- `code_file` — now associated with anatomy findings via VIOLATES edges, contributing to file-level health scoring
- `skill` — gains the deferral relationship (DEFERS_TO) when ADR-003 lands

**Discovery of business facts**:

- The anatomy catalog itself is structured business knowledge — each convention encodes "what a Button anatomy should be" sourced from authoritative external specs. Each convention spec includes its `source: { ref, url }` field, which an ingestor can use to populate `business_fact` nodes.

---

## Success Criteria

### Functional — finding correctness

1. **Convention findings are produced for known component types.** Given a fixture file `Button.tsx` that omits the `loading` state, the audit produces an `ANAT-D*` finding identifying the missing state, the component type `Button`, and a fix hint.
2. **Convention findings are NOT produced for unrecognized types.** Given a fixture file `MyRandomThing.tsx` not matching any catalog entry (no JSDoc tag, no DESIGN.md registry entry, no export-name match), no `ANAT-D*` findings are emitted (silent skip per Decision #3).
3. **JSDoc self-declaration overrides convention.** Given a Button file whose JSDoc declares only 3 of the 5 conventional states, the audit uses the JSDoc declaration as ground truth and does not flag the 2 omitted-but-conventional states. Divergence emits one `ANAT-D000` info finding pointing to the divergence.
4. **DESIGN.md override beats convention but not JSDoc.** Verified in a fixture project with all three layers populated; resolution order matches Decision #1.
5. **Pattern findings are produced for the v1 catalog.** Each of the 10+ pattern rules has at least one positive fixture (pattern present → finding emitted) and one negative fixture (pattern absent → no finding).
6. **Pattern false-positive rate ≤ 5%** on a corpus of 50 hand-curated "this code is fine" fixtures across the 10+ patterns. Measured during Sprint 3.

### Catalog — completeness

7. **20 conventions ship in `catalog/conventions/`**: Button, Input, Select, Modal/Dialog, EmptyState, Card, Tabs, Menu, Toast, Form, Accordion, Tooltip, Popover, Drawer, Slider, Switch, Checkbox, Radio, Avatar, Badge.
8. **10+ patterns ship in `catalog/patterns/`**: ANAT-P001 through ANAT-P010 minimum. Each has an S-expression tree-sitter query, a message formatter, a fix hint, and a source citation.
9. **Every convention cites its source** via `source: { ref, url }` — sourced from APG, Open UI, Radix Primitives, or design-component-anatomy reference content.

### Integration — wiring works

10. **MCP tool returns structured findings.** `mcp__harness__audit_anatomy` invoked on a fixture project returns the documented `AuditAnatomyOutput` shape with at least one finding, populated `summary` and `catalog` fields, and `meta.deferredToA11y` count.
11. **`harness validate` runs the fast-mode anatomy check.** Validate output includes anatomy findings when `design.audit.componentAnatomy.enabled = true`; omits them when disabled. Findings respect `design.strictness` (strict blocks; standard warns errors; permissive info-only).
12. **DesignConstraintAdapter writes VIOLATES edges.** After an audit run, the graph contains a `VIOLATES` edge per finding, target node is a `design_rule` node keyed by finding code. Re-running the audit is idempotent (no duplicate edges).
13. **harness-accessibility deferral works.** Given a project with `design.audit.componentAnatomy.enabled = true` and a `<Button>` (in the catalog) with no accessible label: a11y emits zero A11Y-010 findings for that Button (deferred). Anatomy emits one definition finding for the missing label slot. Total: 1 finding, not 2.
14. **Disabling the audit restores a11y behavior.** With the same fixture and `enabled = false`: a11y emits A11Y-010 for the Button as usual; anatomy emits nothing.

### Performance — validate is fast

15. **Fast-mode runtime ≤ 3 seconds on a 500-file repo.** Measured on Harness's own repo as a benchmark fixture. Captured in `benchmark-baselines.json` for regression detection.
16. **Full-mode runtime ≤ 30 seconds on the same 500-file repo.** Patterns + conventions combined. Full-mode is opt-in (skill invocation) so this bound is generous but documented.
17. **Tree-sitter parses are cached per file across patterns** — verified by an integration test that asserts one parse call per file when 5 pattern rules all run.

### Quality — output and developer experience

18. **Every finding includes a fix hint** with concrete next-step text (not "fix this" — actual guidance like "Add a `label: string` prop to the Button component, or add `@anatomy-slot label` if the component intentionally omits it").
19. **Markdown report formatter produces a navigable report** grouped by component file, with finding codes linked to `finding-codes.md`.
20. **Skill SKILL.md follows the harness skill format** — passes the skill validator, includes all required frontmatter, has When-to-Use and Gates sections.

### Documentation

21. **AGENTS.md, designer-quickstart.md, finding-codes.md all updated** to reference the audit.
22. **DESIGN.md schema doc** documents the two new optional sections with examples.
23. **Three ADRs filed** under `docs/knowledge/decisions/` covering hybrid parser strategy, finding code namespace, cross-skill deferral pattern.
24. **Knowledge entries added**: `docs/knowledge/design/component-anatomy-rules.md`, `pattern-presence-audit.md`, `cross-skill-deferral.md`.

### Convergence (preparing for sub-projects #4 and #5)

25. **MCP tool API is stable and documented** with a versioned schema so sub-project #4 (check-design verifier) can wrap it in a convergence loop without internal coupling.
26. **getCatalogTypes() export is stable** so harness-accessibility can depend on it without breaking on internal catalog refactors.
27. **Findings include a `runId`** so sub-project #4 can detect fixpoint by comparing finding sets across iterations.

### Negative criteria — what should NOT happen

28. **No usage-side findings emitted in v1.** No `ANAT-U*` codes appear in any output. Verified by inspecting catalog and finding-codes.md.
29. **No autofix / codemod applied.** Findings have fix HINTS only; no source files are modified by the audit.
30. **No regression in harness-accessibility output for unrelated cases.** Existing a11y fixtures continue to produce the same findings except where deferral is explicitly expected.

---

## Implementation Order

Three sprints over ~3 weeks, preceded by a 1-day schema spike to de-risk the rule schema before Sprint 1 commits. Each sprint exits on a named subset of the success criteria.

### Phase 0 — Schema Spike (~1 day)

**Goal:** validate that the v1 rule schemas (ConventionRule, PatternRule, AnatomyFinding, JSDoc tag grammar) can express the representative edge cases before Sprint 1 locks them in code.

**Deliverables:**

- Three convention specs authored on paper (not in code): Button (simple), Tabs (compound component), EmptyState (pattern-and-component hybrid). Each fully specified per Section "Data structures".
- Two pattern specs authored on paper: ANAT-P001 map-without-empty, ANAT-P004 conditional-render-without-fallback.
- Schema-fit review: each spec readable and unambiguous against the schemas in "Data structures".

**Exit criteria:** schemas accept all five specs without ambiguity; any schema gap triggers a one-iteration revision before Sprint 1.

**Risk addressed:** the "rule schema needs revision on edge cases" risk called out in the brainstorming PRIORITIZE phase.

### Phase 1 / Sprint 1 — Vertical Slice (~5-7 days)

**Goal:** end-to-end pipeline working for ONE convention (Button) and ONE pattern (ANAT-P001 map-without-empty), proving architecture across all integration points before scaling.

**Deliverables:**

- Parser stack: TS Compiler API wrapper (`parsers/ast.ts`) + tree-sitter setup with `tree-sitter-typescript` + `tree-sitter-tsx` grammars vendored (`parsers/tree-sitter.ts`).
- Resolvers: source-of-truth resolver + component-type resolver, both fully implemented.
- Rules: ConventionRule type + runner; PatternRule type + runner.
- Catalog: `catalog/conventions/button.ts` + `catalog/patterns/ANAT-P001-map-without-empty.ts`.
- MCP tool: `mcp__harness__audit_anatomy` returning the documented output shape; fast and full modes wired.
- Skill: `SKILL.md` + `skill.yaml` with all required frontmatter and the When-to-Use / Gates sections.
- DesignConstraintAdapter integration writing VIOLATES edges.
- `harness validate` fast-mode hook for Button-only checking.
- harness-accessibility deferral patch (Phase 1 step 2.6) + `getCatalogTypes()` named export.
- Config schema: `harness.config.json` extended with the new `design.audit.componentAnatomy` block; validation passes.
- Integration tests covering all of the above with at least one positive fixture and one negative fixture per rule.

**Exit criteria (subset of Success Criteria):**

- Success criteria 1-5, 10-14, 17, 20 all pass.
- One end-to-end run of `mcp__harness__audit_anatomy` on a fixture project returns expected findings; running it twice produces no duplicate graph edges (idempotent).
- harness-accessibility with `enabled = true` produces zero A11Y-010 findings for a Button with no label; produces normal A11Y-010 for a raw `<button>` element.

**Stop conditions:** if the rule schema or parser stack reveals a blocker that requires architectural rework, halt and re-spec before Sprint 2 begins.

### Phase 2 / Sprint 2 — Catalog Expansion (~10-12 days)

**Goal:** scale the catalog to the comprehensive scope committed in Decision #5.

**Deliverables (catalog only — no architectural changes):**

- 19 additional convention specs: Input, Select, Modal/Dialog, EmptyState, Card, Tabs, Menu, Toast, Form, Accordion, Tooltip, Popover, Drawer, Slider, Switch, Checkbox, Radio, Avatar, Badge.
- 9 additional pattern specs: ANAT-P002 through ANAT-P010.
- Per-entry source citation (APG section, Open UI proposal, Radix component page) populated in `source: { ref, url }`.
- Per-entry positive + negative fixture pair.
- Catalog index regeneration logic (so `getCatalogTypes()` reflects every shipped convention automatically).

**Process per catalog entry (~25-40 min each):**

1. Look up the component in REFERENCES.md tier-1 (APG / Open UI / Radix) and cross-reference design-component-anatomy.
2. Author the spec as a TypeScript module.
3. Write a positive fixture (anatomy missing → finding) and negative fixture (anatomy complete → no finding).
4. Run the audit; confirm finding shape matches expectation.

**Exit criteria:** success criteria 6, 7, 8, 9 all pass. False-positive rate measurement (criterion 6) is recorded as the Sprint 2 baseline even if not yet ≤ 5%.

**Stop conditions:** if false-positive rate exceeds 15% on the benchmark corpus at any point, halt catalog work and triage the pattern engine before continuing.

### Phase 3 / Sprint 3 — Polish (~3-5 days)

**Goal:** ship-ready quality on severity, reporting, documentation, and performance.

**Deliverables:**

- Severity model implementation: `design.strictness` × finding-severity-default → actual severity matrix in `findings/severity.ts`.
- Markdown report formatter producing a grouped, navigable report with code links to `finding-codes.md`.
- JSDoc tag parser hardening: edge cases (comments inside comments, block comments without leading asterisks, multi-export files) all handled.
- Reference documentation:
  - `docs/changes/design-pipeline/audit-component-anatomy/finding-codes.md` listing every code with rationale, source, and fix hint.
  - `AGENTS.md` update.
  - `docs/guides/designer-quickstart.md` update.
  - DESIGN.md schema update.
- Three ADRs filed: hybrid parser, finding code namespace, cross-skill deferral.
- Three knowledge entries filed: component-anatomy-rules, pattern-presence-audit, cross-skill-deferral.
- Performance benchmarks captured in `benchmark-baselines.json`: fast-mode runtime and full-mode runtime on Harness's own repo as the reference corpus.
- False-positive rate measurement against the 50-fixture quality corpus; criterion 6 (≤ 5%) must pass.

**Exit criteria:** all remaining Success Criteria pass (15, 16, 18, 19, 21-30).

**Stop conditions:** if criterion 6 (false-positive rate ≤ 5%) cannot be met without dropping patterns, the spec is amended to drop the underperforming pattern(s) and downgrade Decision #5 from "comprehensive (10+ patterns)" to "comprehensive (N patterns)" in the as-shipped spec.

### Dependencies and parallelism

- Phase 0 must complete before Phase 1.
- Phase 1 must complete before Phase 2.
- Phase 2 and the *documentation* deliverables of Phase 3 can run in parallel during the second half of Phase 2 (catalog entries are routine; docs author can ride alongside).
- harness-accessibility deferral patch lands in Phase 1 — coordinate with anyone touching that skill to avoid merge conflicts.
- Sub-project #4 (check-design verifier) can begin its own brainstorm the moment Phase 1's MCP API stabilizes — does not need to wait for full catalog.

### Re-entry points

If the build is interrupted, restart points are:

- After Phase 0: re-enter at Sprint 1 with the spike artifacts as input.
- After Phase 1: re-enter at Sprint 2; vertical slice is independently shippable and self-contained (1 convention + 1 pattern still has value).
- After Phase 2: re-enter at Sprint 3; catalog-only deliverables can be used immediately by Sub-project #4 even before polish lands.
