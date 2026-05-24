# detect-design-drift (v1)

> Detects design-system drift in source code: hardcoded values where tokens exist (token bypass) and raw HTML primitives where a registered design-system component exists (primitive adoption). The third verifier in `harness check-design` after audit-anatomy (#2) and design-craft critique (#6). The align-design-system FIX skill is a separate sub-project follow-on (deferred from v1).

## Overview

**Project:** detect-design-drift (v1)
**Initiative:** design-pipeline (sub-project #1 of 6 — detect half only; align-design-system deferred to a follow-on)
**Date:** 2026-05-24
**Estimated effort:** ~1 week, single PR

### Goals

1. **Token bypass detection** (`DRIFT-T*` codes) — find hardcoded values where tokens exist in `design-system/tokens.json`. Beats `@lapidist/design-lint`'s scope (also catches pixel-margin bypass and deprecated-token usage).
2. **Primitive adoption detection** (`DRIFT-P*` codes) — find raw HTML elements (`<button>`, `<input>`, `<textarea>`, `<a>`) where a registered component exists in `design-system/DESIGN.md` `## Component Registry`. Differentiates from lapidist (they don't have this).
3. **Composes by check-design as the 3rd verifier** — `harness check-design` invokes detect-drift alongside audit-anatomy + design-craft critique. One-line edit to check-design.ts.
4. **Coexists with `DesignConstraintAdapter.checkAll`** legacy DESIGN-001/002 hardcoded-color/font checks. `architecture.ts` caller of `checkAll` stays untouched. Migration to single-owner deferred to v1.x (see Migration path).
5. **Mirrors audit-anatomy structure** (`packages/cli/src/drift/` parallel to `packages/cli/src/audit/component-anatomy/`) — same parser stack, same finding emission, same Verifier-shape convention.
6. **Persists findings via the established graph adapter** — `DesignConstraintAdapter.recordFindings()` (entry point shipped in PR #390).

### Non-Goals

- **align-design-system FIX skill** — separate sub-project follow-on. v1 ships detect only.
- **Variant proliferation detection** — Q3 deferred; requires declared-variants registry schema work in DESIGN.md beyond what audit-anatomy added; not in v1.
- **Subsumption of `DesignConstraintAdapter.checkAll`** — v1 coexists; v1.x extracts the legacy regex checks into the drift module when `architecture.ts` migration is ready.
- **Variant codemod or auto-fix** — that's align-design-system's domain.
- **Custom token-format support** — v1 reads W3C DTCG `tokens.json` only.
- **Cross-file dependency analysis** — pattern detection is single-file scope. Cross-file analysis (e.g., "this component imports Button so the same file's `<button>` is suspicious") is v1.x.

### Keywords

`detect-design-drift`, `token-bypass`, `primitive-adoption`, `DRIFT-T`, `DRIFT-P`, `tree-sitter`, `design-system`, `verifier`, `check-design-integration`

---

## Decisions

| #   | Decision                                           | Choice                                                                                                                                                                            | Rationale                                                                                                                                                                                                                                      |
| --- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | v1 scope split                                     | **A** — detect-only; align-design-system deferred to a separate sub-project                                                                                                       | Detect alone is a clean defensible ship; align needs careful fix-safety design that benefits from real-world detect findings first; matches roadmap entry's "detect can land independently" hint.                                              |
| 2   | Relationship to `DesignConstraintAdapter.checkAll` | **A** — coexist; new module at `packages/cli/src/drift/`; persist via `recordFindings`; legacy `checkAll` untouched (still used by `architecture.ts`); migration deferred to v1.x | Mirrors audit-anatomy structure (proven pattern); AST/tree-sitter tooling stays in CLI package (graph stays dep-light); architecture.ts caller untouched (zero migration risk); long-term single-owner path documented but not paid for in v1. |
| 3   | Rule domains in v1                                 | **B** — token bypass + primitive adoption (defer variant proliferation to v1.x)                                                                                                   | Beats `@lapidist/design-lint` on primitive adoption; uses inputs that already exist (tokens.json + DESIGN.md Component Registry); variant proliferation needs schema decisions that are a separate brainstorm.                                 |

### Rationalizations rejected

| Rationalization                                         | Why rejected                                                                                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Subsume DESIGN-001/002 in v1"                          | Active caller in `architecture.ts`; migration cost real; coexistence with deferred subsumption is honest.                                                                       |
| "Ship detect + align together for full roadmap closure" | Align needs fix-safety classification + codemod templates + revert logic — substantial design surface that benefits from observing detect findings first.                       |
| "Variant proliferation in v1"                           | Requires declared-variants registry (where? DESIGN.md new section?) and proliferation heuristics ("3+ ways to mark intent" is ambiguous). Real brainstorm-sized problem. Defer. |
| "Use regex like the existing legacy checks"             | Primitive adoption needs JSX parsing (`<button>` vs `<Button>` — same regex catches both). Tree-sitter does it cleanly; regex doesn't.                                          |
| "Extract Verifier interface in this PR"                 | Trigger condition (3rd check-\* command) is met by this PR — but extraction is a separate refactor. Bundle would balloon scope. Follow-on PR.                                   |

---

## Technical Design

### File layout

```
packages/cli/src/drift/                            # NEW module (mirrors audit/component-anatomy/)
  findings/
    finding.ts                                     # DriftFinding type + DRIFT-* code namespace
  rules/
    token-bypass-rule.ts                           # DRIFT-T* — runs vs tokens.json
    primitive-adoption-rule.ts                     # DRIFT-P* — runs vs DESIGN.md Component Registry
  resolvers/
    tokens.ts                                      # Load + parse design-system/tokens.json
    component-registry.ts                          # Load + parse DESIGN.md ## Component Registry
  parsers/
    tree-sitter.ts                                 # Reused / extracted from audit-anatomy if compatible
  index.ts                                         # runDetectDrift entry point (Verifier shape)

packages/cli/src/mcp/tools/detect-drift.ts         # NEW — MCP tool wrapper

packages/cli/src/commands/check-design.ts          # MODIFIED — compose detect-drift as 3rd verifier
packages/cli/src/mcp/server.ts                     # MODIFIED — register detect_drift MCP tool

packages/cli/tests/drift/                          # NEW tests dir
  rules/token-bypass.test.ts
  rules/primitive-adoption.test.ts
  resolvers/component-registry.test.ts
  integration/runDetectDrift.test.ts

packages/cli/tests/commands/check-design.test.ts   # MODIFIED — extend for 3-verifier composition
```

### Data structures

```ts
// findings/finding.ts
export type DriftFindingCode = `DRIFT-T${string}` | `DRIFT-P${string}`;
export type DriftSeverity = 'error' | 'warn' | 'info';

export interface DriftFinding {
  code: DriftFindingCode;
  severity: DriftSeverity;
  file: string;
  line: number | null;
  column?: number;
  message: string;
  evidence: { snippet: string; contextLines?: string };
  rule: { id: string; category: 'token-bypass' | 'primitive-adoption' };
  fix: { kind: 'manual' | 'codemod-todo'; description: string };
}

// index.ts (runDetectDrift entry point — Verifier shape)
export interface DetectDriftInput {
  path: string;
  mode?: 'fast' | 'full'; // both equivalent in v1 (no slow patterns yet)
  files?: string[]; // optional scoping
  designStrictness?: 'strict' | 'standard' | 'permissive';
  rules?: {
    tokenBypass?: boolean; // default true
    primitiveAdoption?: boolean; // default true
  };
}

export interface DetectDriftOutput {
  findings: DriftFinding[];
  summary: {
    totalFiles: number;
    durationMs: number;
    bySeverity: Record<DriftSeverity, number>;
    byCode: Record<string, number>;
  };
  catalog: { rulesApplied: string[] };
  meta: { mode: 'fast' | 'full'; tokensLoaded: boolean; registryLoaded: boolean };
}
```

### Code namespace

Token bypass (`DRIFT-T*`):

- `DRIFT-T001` — Hex color value outside the declared color token palette
- `DRIFT-T002` — Font-family outside declared typography tokens
- `DRIFT-T003` — Pixel margin/padding outside declared spacing scale
- `DRIFT-T004` — Reference to a deprecated token

Primitive adoption (`DRIFT-P*`):

- `DRIFT-P001` — Raw `<button>` JSX where a `Button` component is registered
- `DRIFT-P002` — Raw `<input>` JSX where an `Input` component is registered
- `DRIFT-P003` — Raw `<textarea>` JSX where a `Textarea` component is registered
- `DRIFT-P004` — Raw `<a href="…">` JSX where a `Link` or `Anchor` component is registered

Severity defaults (per `design.strictness`):

- `strict` — all findings `error`
- `standard` — `T001/T002/P001` are `error`; `T003/T004/P002-P004` are `warn`
- `permissive` — all `info`

### Parser strategy

Reuses tree-sitter setup from `packages/cli/src/audit/component-anatomy/parsers/tree-sitter.ts` if it's structurally available; otherwise extracts a shared parser into `packages/cli/src/shared/parsers/` as a small refactor. Pattern detection is single-file (no cross-file analysis in v1).

Token bypass detection: regex-based for v1 simplicity (mirrors legacy DESIGN-001/002 plus new T003/T004). Token set loaded from `design-system/tokens.json` via `resolvers/tokens.ts`.

Primitive adoption detection: tree-sitter query `(jsx_element open_tag: (jsx_opening_element name: (identifier) @tag))` filtered to lowercase tags; cross-references against component registry. Identifies raw HTML primitives, not imports of registered components.

### Inputs

| Input              | Source                                                                                         | Required?                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Design tokens      | `design-system/tokens.json` (W3C DTCG format)                                                  | Optional — token bypass checks skip silently if absent       |
| Component Registry | `design-system/DESIGN.md` `## Component Registry` section                                      | Optional — primitive adoption checks skip silently if absent |
| Strictness         | `harness.config.json` `design.strictness` (default `standard`)                                 | Always                                                       |
| Config gate        | `harness.config.json` `design.audit.driftDetection.enabled` (default `true`, new schema field) | Always                                                       |

### check-design integration

One-line edit to `runCheckDesign()` in `packages/cli/src/commands/check-design.ts`:

```ts
// existing:
const anatomyOut = await runAnatomyAudit({ ... });
const craftResult = await runDesignCraft({ ... });

// added:
const driftOut = await runDetectDrift({ path: cwd, mode, ... });
```

Plus aggregation extensions:

- `findingsByVerifier.drift: DriftFinding[]`
- `summary.verifiersRun` includes `'detect-drift'`
- Persistence via existing `DesignConstraintAdapter.recordFindings` path

`check-design.test.ts` extended with a 3-verifier composition test.

### MCP tool

`packages/cli/src/mcp/tools/detect-drift.ts` exposes `mcp__harness__detect_drift`. Mirrors `audit_anatomy` shape exactly — same input args, same output shape, same registration pattern.

### Verifier-shape convention (still informal)

This is the **third** check-\* verifier (audit-anatomy + design-craft critique + detect-drift). Trigger condition from #4's spec is met. Interface extraction is a **separate follow-on PR** scoped to:

- Extract `Verifier<F>` interface in `packages/cli/src/shared/verifier.ts` (or similar)
- Update audit-anatomy, design-craft, detect-drift to implement it
- Update check-design.ts to compose `Verifier[]` instead of named calls
- Pure refactor; no behavior change

NOT bundled in this PR. Tracked as a follow-on issue when this PR merges.

---

## Integration Points

### Entry Points

| Kind          | Path                                                                     | New / Modified |
| ------------- | ------------------------------------------------------------------------ | -------------- |
| Module        | `packages/cli/src/drift/` (~6 files)                                     | NEW            |
| MCP tool      | `mcp__harness__detect_drift`                                             | NEW            |
| Programmatic  | `runDetectDrift()` from `packages/cli/src/drift/index.ts`                | NEW            |
| Command       | `packages/cli/src/commands/check-design.ts` adds 3rd verifier            | MODIFIED       |
| MCP server    | `packages/cli/src/mcp/server.ts` registers new tool                      | MODIFIED       |
| Config schema | `harness.config.json` adds `design.audit.driftDetection.{enabled,rules}` | MODIFIED       |

### Registrations Required

1. **MCP tool registration** in `mcp/server.ts` — three-line addition (import + `TOOL_DEFINITIONS` + `TOOL_HANDLERS`); same pattern as audit_anatomy / design_craft.
2. **`ALL_MCP_TOOLS` sync** in `setup-mcp.ts` — one-line addition.
3. **Tool-count test assertions** in `tests/mcp/server.test.ts` (`toHaveLength(70 → 71)`) and `tests/mcp/server-integration.test.ts` (same).
4. **Config schema** in `packages/cli/src/config/schema.ts` — add `driftDetection` subblock alongside `componentAnatomy` (mirrors the existing pattern from PR #390).
5. **Skill markdown** at `agents/skills/claude-code/detect-design-drift/{SKILL.md,skill.yaml}` — paralels existing `detect-doc-drift` skill structure; documents the agent-driven flow that invokes the MCP tool.

### Documentation Updates

| Doc                                                                       | Update                                                                     |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `AGENTS.md`                                                               | Brief mention of detect-design-drift under design-skills section           |
| `docs/changes/design-pipeline/detect-design-drift/finding-codes.md` (NEW) | Reference page for `DRIFT-T*` and `DRIFT-P*` codes                         |
| `docs/changes/design-pipeline/REFERENCES.md`                              | Mark sub-project #1 (detect half) as in-progress when implementation lands |
| `docs/reference/cli-commands.md` + `mcp-tools.md`                         | Auto-regenerated by `pnpm generate-docs`                                   |

### Architectural Decisions

**None warranted.** Same rationale as #4 — tier-small change; relevant patterns already codified in ADRs 0018-0021. The Verifier interface extraction is the next ADR-worthy decision; it lands when the extraction PR ships.

### Knowledge Impact

**Graph state:** no new node/edge types. detect-drift persists findings via `DesignConstraintAdapter.recordFindings` — same path as anatomy + craft. Uses existing `design_constraint` nodes + `violates_design` edges. `DRIFT-*` codes get human-readable labels via `CODE_PREFIX_LABELS` (extend with `DRIFT-T` → "Design drift (token bypass)" and `DRIFT-P` → "Design drift (primitive adoption)").

**Knowledge entries (optional):** None required for v1. When the Verifier interface lands (follow-on PR), `docs/knowledge/design/verifier-pattern.md` becomes worthwhile.

---

## Success Criteria

### Functional — detection correctness

1. **Token bypass — hex color outside palette.** Fixture file with `color: '#ff0000'` where `#ff0000` is not in `tokens.json` color set → 1 DRIFT-T001 finding with line/severity/message.
2. **Token bypass — font outside palette.** Fixture with `fontFamily: 'Comic Sans'` where it's not in tokens.json typography → 1 DRIFT-T002 finding.
3. **Token bypass — pixel margin outside scale.** Fixture with `margin: '13px'` where the spacing scale is `{4,8,16,24,32}` → 1 DRIFT-T003 finding.
4. **Token bypass — deprecated token reference.** Fixture using a token marked `$deprecated: true` in tokens.json → 1 DRIFT-T004 finding.
5. **Primitive adoption — raw button.** Fixture with `<button>Save</button>` where `Button` is in `DESIGN.md ## Component Registry` → 1 DRIFT-P001 finding.
6. **Primitive adoption — raw input.** Fixture with `<input type="text" />` where `Input` is registered → 1 DRIFT-P002 finding.
7. **Primitive adoption — raw anchor.** Fixture with `<a href="...">link</a>` where `Link` (or `Anchor`) is registered → 1 DRIFT-P003/004 finding.
8. **Negative — no findings when component not registered.** Fixture with `<button>` in project where `Button` is NOT in the Registry → 0 findings (we don't impose adoption rules the project hasn't declared).
9. **Negative — no findings when token matches palette.** Fixture with `color: '#3b82f6'` where it IS in the palette → 0 findings.
10. **Empty tokens.json + no DESIGN.md** → both rules skip silently; `meta.tokensLoaded=false`, `meta.registryLoaded=false`; 0 findings; non-error exit.

### Integration

11. **MCP tool returns `DetectDriftOutput` shape.** Invocation via `mcp__harness__detect_drift` returns documented shape.
12. **check-design composes detect-drift as 3rd verifier.** Updated test asserts `summary.verifiersRun` includes `detect-drift`; findings aggregate across all three.
13. **DesignConstraintAdapter.recordFindings persists DRIFT-T/DRIFT-P findings.** `getEdges({ from: <file>, to: 'design_constraint:DRIFT-T001', type: 'violates_design' })` returns the recorded edge.
14. **Idempotent on re-run.** Same as anatomy/craft pattern.
15. **`harness.config.json` `design.audit.driftDetection.enabled = false`** disables the rules entirely (skipped, no findings).
16. **Per-rule disable.** `design.audit.driftDetection.rules.tokenBypass = false` skips token bypass; primitive adoption still runs.

### Architecture

17. **Coexistence verified.** `DesignConstraintAdapter.checkAll` still produces DESIGN-001/DESIGN-002 findings when called (untouched by this PR); `architecture.ts` caller works.
18. **No layer-boundary violation.** Tree-sitter / TypeScript Compiler API stay in `packages/cli`; `packages/graph` doesn't gain new dependencies.

### Output + UX

19. **Each finding includes a fix hint** with concrete next-step text (not "fix this").
20. **`harness check-design` text output groups detect-drift findings under their own verifier section** alongside anatomy + craft.

### Documentation

21. **`agents/skills/claude-code/detect-design-drift/{SKILL.md,skill.yaml}`** ship (mirrors detect-doc-drift skill).
22. **`docs/changes/design-pipeline/detect-design-drift/finding-codes.md`** lists all DRIFT-T + DRIFT-P codes defined in v1 (4 + 4 = 8) with rationale, severity default, fix hint.
23. **`pnpm generate-docs`** updates `mcp-tools.md` + `cli-commands.md`.

### Tests

24. **Unit tests cover SC 1-10** with positive + negative fixtures.
25. **Integration test** for full `runDetectDrift` end-to-end.
26. **check-design.test.ts extended** for 3-verifier composition.
27. **Skills package parity tests pass** (detect-design-drift exists in all 4 platforms byte-identically; markdown-only).

### Build + validate

28. `pnpm typecheck` clean.
29. `harness validate` clean.
30. Full CLI suite passes (pre-existing env flakes excluded — same set documented in prior PRs).

### Negative criteria

31. **No align logic.** No fix application, no codemod templates, no revert logic. align-design-system is a separate sub-project.
32. **No variant proliferation detection.** Deferred per Q3.
33. **No subsumption of DESIGN-001/002.** DesignConstraintAdapter.checkAll stays untouched.
34. **No Verifier interface extraction.** Separate follow-on PR.

---

## Implementation Order

Single PR end-to-end (~1 week / 3 days agent-time).

### Phase 1: Module skeleton + token bypass <!-- complexity: low -->

(~1 day)

**Deliverables:**

- `packages/cli/src/drift/` skeleton with `findings/finding.ts`, `index.ts`, `resolvers/tokens.ts`
- `rules/token-bypass-rule.ts` implementing DRIFT-T001 (hex), DRIFT-T002 (font), DRIFT-T003 (px), DRIFT-T004 (deprecated)
- `runDetectDrift` entry point in `index.ts`
- `tests/drift/rules/token-bypass.test.ts` with positive + negative fixtures for SC 1-4, 9

**Exit criteria:**

- All 4 token bypass codes emit correctly
- `meta.tokensLoaded` accurately reflects presence/absence of tokens.json
- typecheck clean

### Phase 2: Primitive adoption <!-- complexity: low -->

(~1 day)

**Deliverables:**

- `rules/primitive-adoption-rule.ts` with tree-sitter query for JSX identifiers
- `resolvers/component-registry.ts` parsing DESIGN.md `## Component Registry`
- `tests/drift/rules/primitive-adoption.test.ts` for SC 5-8

**Exit criteria:**

- All 4 primitive adoption codes emit correctly
- Negative case (component not registered) produces zero findings
- `meta.registryLoaded` accurately reflects presence/absence

### Phase 3: MCP tool + check-design integration + polish <!-- complexity: low -->

(~1 day)

**Deliverables:**

- `packages/cli/src/mcp/tools/detect-drift.ts` (Definition + Handler exports + tree of imports)
- Register in `mcp/server.ts` (TOOL_DEFINITIONS + TOOL_HANDLERS + import)
- Update `ALL_MCP_TOOLS` in `setup-mcp.ts`
- Bump tool-count assertions (server.test.ts + server-integration.test.ts)
- Edit `check-design.ts` to add `runDetectDrift` as 3rd verifier
- Update `check-design.test.ts` for 3-verifier case
- Config schema: add `design.audit.driftDetection.*` block in `config/schema.ts`
- Validate tests for the new config block
- 4-platform skill markdown at `agents/skills/{claude-code,gemini-cli,cursor,codex}/detect-design-drift/`
- `pnpm generate-docs` to update reference docs
- Changeset entry (`@harness-engineering/cli`: minor)

**Exit criteria:**

- All Success Criteria pass
- Full CLI suite green (modulo pre-existing env flakes)
- `harness check-design` invokes detect-drift visibly

---

## Migration path (post-v1)

Documented for future reference; not in scope for this spec:

- **v1.x** — Subsume `DesignConstraintAdapter.checkAll` legacy DESIGN-001/002 into detect-design-drift. Update `packages/cli/src/mcp/tools/architecture.ts:91` to call `runDetectDrift` instead of `checkAll`. Mark `DESIGN-001`/`DESIGN-002` as deprecated aliases of `DRIFT-T001`/`DRIFT-T002`. Remove the legacy methods in a follow-on cleanup PR after one release cycle.
- **v1.x** — Variant proliferation detection (`DRIFT-V*` codes) — requires declared-variants registry schema in DESIGN.md (separate brainstorm-sized decision).
- **v1.x** — align-design-system (the FIX half of sub-project #1). Composes detect-design-drift's findings; per-finding codemod templates; safe/unsafe partition; revert on test failure. Now unblocked by #4 check-design verifier.
- **v1.5 (Verifier interface extraction)** — extract `Verifier<F>` interface to `packages/cli/src/shared/verifier.ts` after this PR makes detect-design-drift the 3rd verifier (triggering condition from #4's spec).
- **v2** — `harness validate` calls `check-design --fast` internally (one impl, two surfaces).
- **v3** — check-\* commands become graph-query facades; `harness findings --domain design`.
