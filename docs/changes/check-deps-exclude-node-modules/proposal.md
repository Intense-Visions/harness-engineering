# Exclude node_modules from check-deps + add a deps exclude mechanism

**Keywords:** check-deps, circular-deps, node_modules, layer-discovery, exclude-config, denominator-visibility, no-silent-abstention

## Overview and goals

`harness check-deps` collects the files for both layer validation and circular
dependency detection by globbing each layer's `pattern`. A pattern like
`packages/**` transitively walks into `packages/foo/node_modules/...`, so cycles
inside vendored third-party packages (`yargs`, `@grpc/grpc-js`, the OpenTelemetry
Node SDK, etc.) fail the gate. These findings are unactionable by construction —
the consuming repo cannot fix cycles in vendored code — and there is no exclude
mechanism to suppress them.

Root cause: the CLI's own `findFiles` (`packages/cli/src/utils/files.ts`) is a
bare `glob(pattern, { cwd, absolute: true })` with **no ignore list**, whereas
core's `findFiles` already applies `DEFAULT_FIND_FILES_IGNORE` (which includes
`**/node_modules/**`). The circular-detection path in `check-deps.ts` uses the
CLI helper, so it crawls `node_modules`; the entropy analyzer and core scanners
do not. This is the same internal inconsistency #1146 called out for
`checkDocCoverage`.

Goals:

1. Default-exclude `node_modules` (and the shared skip-dir set) from check-deps
   discovery — the primary bug fix.
2. Add a `deps.exclude` config block so operators can suppress additional paths
   without shrinking `pattern`, mirroring `analysis.exclude` / `design.exclude`.
3. Attribute circular-dep findings to a file (kill the silent `* unknown`) and
   make the scanned denominator observable, honoring the no-silent-abstention
   doctrine.

Non-goals: rewriting the dependency graph engine; per-layer `exclude` (top-level
`deps.exclude` covers the stated need — YAGNI on per-layer until asked);
changing default behavior for repos with no `node_modules` (they behave as today).

## Decisions made

- **D1 — Fix at the CLI `findFiles` helper, applying the shared default-ignore.**
  Extend `packages/cli/src/utils/files.ts` `findFiles` to accept an optional
  `extraIgnore` and always apply core's `DEFAULT_FIND_FILES_IGNORE` by default,
  mirroring `packages/core/src/shared/fs-utils.ts`. This removes the internal
  inconsistency at its source rather than patching one call site, and the other
  two CLI callers (`check-phase-gate`, `acceptance-eval`) legitimately never want
  `node_modules` either.
- **D2 — Top-level `deps.exclude` config, not per-layer `exclude`.** Mirrors the
  established `analysis.exclude` / `design.exclude` shape (a small schema block
  with an `exclude: string[]` of minimatch globs, best-effort loader that returns
  `[]` on any miss). Simpler than per-layer excludes and covers the stated need.
- **D3 — Thread the exclude into BOTH discovery paths.** The circular path globs
  in `check-deps.ts` directly; the layer-validation path globs inside core's
  `validateDependencies`. Add an optional `extraIgnore` to `LayerConfig` and pass
  it through to core's `findFiles` so `deps.exclude` applies uniformly.
- **D4 — Attribute cycles to their first file.** Circular findings currently
  carry no `file`, so the formatter renders `* unknown`. Set `file` to the
  posix-relative path of the first module in the cycle so operators see where the
  cycle lives (and it stops signalling "outside the model").
- **D5 — Print the denominator and refuse silent abstention.** Emit a
  "Analyzed N modules across M layers" line (and a `modulesAnalyzed` field in
  JSON). When layers are configured but zero modules are analyzed, fail rather
  than report clean — the exact failure mode the gate exists to prevent, and
  acceptance criterion #3 of the issue.

## Assumptions

- Runtime is Node.js (the code uses `glob`, `path`, and `fs`); no browser target.
- `harness.config.json` is the config source; a missing/malformed file or `deps`
  block yields `[]` from `loadDepsExclude` (best-effort, mirrors the existing
  `analysis`/`design` loaders) so un-configured repos keep working.
- Layer discovery is glob-based over the repo working tree; `deps.exclude`
  patterns are minimatch globs matched the same way `analysis.exclude` is.

## Technical design

### 1. CLI `findFiles` default-ignore (D1)

`packages/cli/src/utils/files.ts`:

```ts
import { glob } from 'glob';
import { DEFAULT_FIND_FILES_IGNORE } from '@harness-engineering/core';

export async function findFiles(
  pattern: string,
  cwd: string = process.cwd(),
  extraIgnore: readonly string[] = []
): Promise<string[]> {
  return glob(pattern, {
    cwd,
    absolute: true,
    dot: true,
    ignore: [...DEFAULT_FIND_FILES_IGNORE, ...extraIgnore],
  });
}
```

`DEFAULT_FIND_FILES_IGNORE` is defined in core (`shared/fs-utils.ts`) but is **not**
currently exported from the core barrel (`packages/core/src/index.ts`) — add that
export as part of this change.

### 2. `deps.exclude` schema + loader (D2)

New `DepsConfigSchema` in `packages/cli/src/config/analysis-schema.ts` (co-located
with `analysis.exclude` / `design.exclude`, so hot paths validate without the full
`HarnessConfigSchema`):

```ts
export const DepsConfigSchema = z.object({
  /** Extra glob patterns (minimatch) excluded from check-deps discovery,
   *  stacked on top of the built-in node_modules/skip-dir defaults. */
  exclude: z.array(z.string().min(1)).default([]),
});
export type DepsConfig = z.infer<typeof DepsConfigSchema>;

export function loadDepsExclude(projectPath: string): string[] {
  /* best-effort, mirrors loadDesignExclude */
}
```

Register `deps: DepsConfigSchema.optional()` on `HarnessConfigSchema`
(`schema.ts`) so `harness validate` accepts the block and it appears in the
generated config reference. Re-export `DepsConfigSchema` / `loadDepsExclude` from
`schema.ts` alongside the analysis exports.

### 3. Thread exclude through layer validation (D3)

- `LayerConfig` (`packages/core/src/constraints/types.ts`) gains
  `extraIgnore?: readonly string[]`.
- `validateDependencies` (`dependencies.ts`) passes it into the per-layer
  `findFiles(pattern, rootDir, extraIgnore)` call (core `findFiles` already
  accepts `extraIgnore`).

### 4. check-deps wiring (D3/D4/D5)

`packages/cli/src/commands/check-deps.ts`:

- Load `const depsExclude = loadDepsExclude(cwd);`.
- Pass `extraIgnore: depsExclude` into `LayerConfig`.
- Circular path: `findFiles(layer.pattern, rootDir, depsExclude)` (CLI helper now
  applies node_modules defaults + depsExclude).
- Add `modulesAnalyzed: number` to `CheckDepsResult`; set it to `uniqueFiles.length`.
- **Attribution (D4):** when pushing circular findings, set
  `file` to the posix-relative path of `cycle.cycle[0]` on the emitted issue —
  compute locally with `path.relative(rootDir, cycle.cycle[0]).split(path.sep).join('/')`
  (check-deps already imports `path`), avoiding a new barrel export.
- **Denominator + abstention (D5):** after collecting `uniqueFiles`, if
  `config.layers.length > 0 && uniqueFiles.length === 0`, set `valid = false` and
  add an issue: "check-deps analyzed 0 modules across N configured layer(s) —
  refusing to report clean (check layer patterns / exclude config)". In text/
  verbose output, print "Analyzed <N> module(s) across <M> layer(s)."

### File layout

| File                                            | Change                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| `packages/cli/src/utils/files.ts`               | `findFiles` gains `extraIgnore`, applies `DEFAULT_FIND_FILES_IGNORE` |
| `packages/cli/src/config/analysis-schema.ts`    | `DepsConfigSchema`, `loadDepsExclude`                                |
| `packages/cli/src/config/schema.ts`             | register/re-export `deps` block                                      |
| `packages/core/src/constraints/types.ts`        | `LayerConfig.extraIgnore?`                                           |
| `packages/core/src/constraints/dependencies.ts` | thread `extraIgnore` into `findFiles`                                |
| `packages/core/src/shared/fs-utils.ts` / barrel | ensure `DEFAULT_FIND_FILES_IGNORE` exported                          |
| `packages/cli/src/commands/check-deps.ts`       | exclude wiring, attribution, denominator                             |
| test files                                      | regression tests (see below)                                         |

## Integration Points

- **Entry Points:** `harness check-deps` CLI command; the `check_dependencies`
  MCP tool that wraps the same `runCheckDeps`. No new commands or flags.
- **Registrations Required:** register `deps` on `HarnessConfigSchema`;
  re-export `DepsConfigSchema` / `loadDepsExclude` from the config barrel. No
  barrel regen for skills.
- **Documentation Updates:** regenerate the config-schema reference
  (`pnpm run generate-docs`) so `deps.exclude` is documented; no CLI-flag doc
  change (no new flags).
- **Architectural Decisions:** None rise to a standalone ADR — this restores
  consistency with an existing pattern (`analysis.exclude`) rather than
  introducing a new architectural concept.
- **Knowledge Impact:** reinforces the "shared skip-dir set is the single source
  of scanner discovery scope" concept and the no-silent-abstention doctrine
  (denominator visibility) already present for #1084/#1094/#1146.

## Success criteria

- [ ] With third-party deps installed under a layer-covered path (e.g.
      `packages/foo/node_modules/yargs`), `check-deps` exits 0 — the vendored cycle
      is not reported. (issue acceptance #1)
- [ ] A first-party circular dependency under a layer-covered path still fails
      the gate — the default-exclude does not hide the repo's own cycles.
- [ ] `deps.exclude` in `harness.config.json` suppresses additional configured
      paths from discovery; an un-configured repo behaves exactly as today.
- [ ] Circular-dep findings render with their first-cycle file, not `* unknown`.
- [ ] Output states how many modules were analyzed. (issue acceptance #2)
- [ ] A run with layers configured that analyzes zero modules fails rather than
      reporting clean. (issue acceptance #3)
- [ ] `harness validate` accepts a config carrying a `deps` block.

## Implementation order

1. Core: `LayerConfig.extraIgnore`, thread through `validateDependencies`, ensure
   `DEFAULT_FIND_FILES_IGNORE` is exported from the barrel.
2. CLI helper: `findFiles` default-ignore + `extraIgnore`.
3. Config: `DepsConfigSchema` + `loadDepsExclude` + schema registration.
4. check-deps: exclude wiring, attribution, denominator + abstention.
5. Regression tests (vendored-cycle-not-flagged, first-party-cycle-still-fails,
   deps.exclude honored, zero-modules-fails, denominator printed).
6. Regenerate docs, changeset, format.
