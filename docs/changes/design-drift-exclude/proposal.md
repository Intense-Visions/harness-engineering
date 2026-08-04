---
feature: design-drift-exclude
status: planned
tier: small
roadmap: github:Intense-Visions/harness-engineering#742
keywords: design-drift, drift-linter, exclude, minimatch, analysis-exclude, harness-config, monorepo-scoping
---

# Support path exclusions for the design-token drift linter (`design.exclude`)

## Overview & Goals

Since v4, `harness validate` runs the design-token drift linter
(DRIFT-T001..T004 / DRIFT-P00x) over every `.ts/.tsx/.js/.jsx/.css/.scss` file
under the project root, skipping only `node_modules`/`dist`/`build`/`coverage`/
dot-dirs. The only configuration surface is `design.strictness` and
`design.audit.driftDetection.enabled`. In a real monorepo this swamps the gate
with unavoidable findings — the token-palette source files themselves (raw hex
by definition), test files asserting on colors, and non-UI code where hex
strings aren't design tokens. The observed case: 1,614 findings, 1,545 errors,
100% from `driftDetection`.

Every **other** analysis scanner (entropy, security, graph ingestion,
doc-coverage) already honors the project-wide `analysis.exclude` glob list, and
`analysis-schema.ts` explicitly names **`design.exclude`** as the intended
precedent — but the drift linter honors neither `analysis.exclude` nor any
design-specific exclude today. This closes that gap.

**Goal:** let a project scope the drift linter out of paths where hex/primitive
findings are noise, via a `design.exclude` glob list, stacked on top of the
existing project-wide `analysis.exclude` — mirroring exactly how `security.ts`
combines `security.exclude` + `analysis.exclude`.

## Decisions Made

1. **Config lives at `design.exclude`** (top-level under `design`), not buried
   under `design.audit.driftDetection`. _Rationale:_ the roadmap item and the
   `analysis-schema.ts` precedent comment both name `design.exclude`; it mirrors
   the sibling `security.exclude` shape (`z.array(z.string().min(1)).default([])`).

2. **Stack `design.exclude` on top of project-wide `analysis.exclude`.** The
   drift runner loads `analysis.exclude` itself (via the existing
   `loadAnalysisExclude`) and unions it with the design-specific patterns —
   exactly as `security.ts:71-74` does. _Rationale:_ a repo declares vendored/
   generated paths once in `analysis.exclude`; `design.exclude` adds
   drift-specific scoping. This also finally makes the drift linter honor the
   project-wide exclude every other scanner already respects.

3. **Match with `minimatch({ matchBase: true })` against the project-relative,
   POSIX-normalized path**, mirroring `skill/dispatcher.ts:158` and the
   `analysis.exclude` semantics. _Rationale:_ reuse the established matcher
   (already a dependency) rather than the drift walker's ad-hoc string checks.

4. **Apply excludes only to the walked file set, not to an explicit `files`
   arg.** When a caller passes an explicit file list it has already scoped the
   scan intentionally. _Rationale:_ mirrors `security.ts:65-66`, which skips
   excludes when `input.files` is provided.

5. **Report-only default behavior is unchanged when no excludes are configured**
   — `design.exclude` defaults to `[]` and `analysis.exclude` is already `[]`
   by default, so the walked set and every finding are identical to today unless
   a project opts in.

## Technical Design

**`packages/cli/src/config/schema.ts`** — add to `DesignConfigSchema`:

```ts
/** Glob patterns (minimatch) excluded from the design-token drift linter. */
exclude: z.array(z.string().min(1)).default([]),
```

**`packages/cli/src/drift/index.ts`**:

- Add `exclude?: string[]` to `DetectDriftInput` (design-specific patterns).
- Add `excludePatterns: string[]` to `ResolvedDriftConfig`; in
  `resolveDriftConfig`, union `input.exclude ?? []` with
  `loadAnalysisExclude(projectRoot)` (imported from `../config/analysis-schema.js`).
- In `collectFiles`, after the walk, drop any file whose project-relative POSIX
  path matches any exclude pattern via `minimatch(rel, pat, { matchBase: true })`.
  Explicit `files` arg bypasses the filter (Decision 4).

**`packages/cli/src/commands/validate.ts`** — in the drift block (~L363), read
`config.design?.exclude` and pass it as `exclude` to `runDetectDrift`.

**`packages/cli/src/mcp/tools/detect-drift.ts`** — add an `exclude` array
property to the tool `inputSchema` so MCP callers can scope a scan.

## Integration Points

- **Entry Points:** `harness validate` drift block; the `detect_drift` MCP tool;
  `runDetectDrift` (also called by check-design and the design-pipeline fix phase
  — all inherit the exclude via the runner, no per-caller threading needed for
  `analysis.exclude`).
- **Registrations Required:** none (no new command/tool/export).
- **Documentation Updates:** the `design.exclude` field is self-documenting via
  its schema JSDoc; the reference docs regenerate from the schema.
- **Architectural Decisions:** None — small change, mirrors an existing pattern.
- **Knowledge Impact:** None — makes the drift linter consistent with the
  existing `analysis.exclude` convention.

## Success Criteria

1. `design.exclude` is a valid, optional glob-array field on `DesignConfigSchema`
   (defaults to `[]`), rejecting empty-string entries like `security.exclude`.
2. Given a project with `design.exclude: ["**/tokens-reference.ts"]`, a drift
   scan does NOT report findings from `tokens-reference.ts`, while findings from
   other files are unchanged.
3. Given `analysis.exclude: ["packages/backend/**"]` (no `design.exclude`), the
   drift scan skips files under `packages/backend/` — the linter now honors the
   project-wide exclude.
4. With neither configured, the scanned file set and findings are byte-identical
   to current behavior (no regression).
5. An explicit `files` arg to `runDetectDrift` bypasses exclude filtering
   (mirrors security).
6. `harness validate` passes `config.design.exclude` through to the runner.
7. Full `packages/cli` typecheck + lint + build green; new unit tests pass.

## Implementation Order

1. **Schema.** Add `exclude` to `DesignConfigSchema`; unit-test parse/default/
   empty-string rejection.
2. **Runner.** Thread `exclude` through `DetectDriftInput` →
   `resolveDriftConfig` (union with `loadAnalysisExclude`) → `collectFiles`
   minimatch filter. Unit-test: design.exclude filters, analysis.exclude filters,
   explicit-files bypass, no-exclude no-op.
3. **Wire + tool.** Read `config.design?.exclude` in `validate.ts`; add `exclude`
   to the `detect_drift` MCP `inputSchema`. Typecheck + lint + build.
