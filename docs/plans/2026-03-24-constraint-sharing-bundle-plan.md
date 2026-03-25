# Plan: Constraint Sharing Phase 2 -- Bundle Extraction

**Date:** 2026-03-24
**Spec:** docs/changes/constraint-sharing/proposal.md
**Estimated tasks:** 6
**Estimated time:** 25 minutes

## Goal

Implement `parseManifest()` and `extractBundle()` in core, plus the `harness share` CLI command. End-to-end: write a constraints.yaml manifest, run `harness share`, get a valid `.harness-constraints.json` bundle.

## Observable Truths (Acceptance Criteria)

1. `packages/core/src/constraints/sharing/manifest.ts` exports `parseManifest(yamlContent: string): Result<Manifest, string>`.
2. `packages/core/src/constraints/sharing/bundle.ts` exports `extractBundle(manifest: Manifest, config: HarnessConfig): Result<Bundle, string>` that extracts only the sections listed in `manifest.include`.
3. When `include` contains `"layers"`, the extracted bundle contains the `layers` array from config.
4. When `include` contains `"security.rules"`, the extracted bundle contains `security: { rules: {...} }`.
5. When `include` contains a section not present in the config, that section is silently omitted from the bundle.
6. `packages/cli/src/commands/share.ts` exports `createShareCommand()` that reads `constraints.yaml`, validates, extracts, and writes `<name>.harness-constraints.json`.
7. When `constraints.yaml` does not exist, `harness share` exits with error suggesting `--init`.
8. `npx vitest run` for manifest and bundle test files passes with all tests green.
9. `harness validate` passes after all tasks.

## File Map

```
CREATE packages/core/src/constraints/sharing/manifest.ts
CREATE packages/core/src/constraints/sharing/bundle.ts
MODIFY packages/core/src/constraints/sharing/index.ts (add manifest + bundle exports)
CREATE packages/cli/src/commands/share.ts
MODIFY packages/cli/src/index.ts (register share command)
CREATE packages/core/tests/constraints/sharing/manifest.test.ts
CREATE packages/core/tests/constraints/sharing/bundle.test.ts
```

## Tasks

### Task 1: Create parseManifest in core

**Depends on:** none
**Files:** `packages/core/src/constraints/sharing/manifest.ts`

1. Create `packages/core/src/constraints/sharing/manifest.ts`
2. Export `parseManifest(yamlContent: string)` that:
   - Parses YAML string using `yaml` package (already in cli deps, needs adding to core deps if not present — or use JSON.parse for now and handle YAML in the CLI layer)
   - Since `yaml` is only in cli's package.json, keep manifest parsing as a two-step: `parseManifest` accepts a parsed object (not raw YAML), CLI handles YAML parsing
   - Validates against ManifestSchema
   - Returns `{ ok: true, value: Manifest }` or `{ ok: false, error: string }`
3. Run: `npx tsc --noEmit` from packages/core

### Task 2: Create extractBundle in core

**Depends on:** Task 1
**Files:** `packages/core/src/constraints/sharing/bundle.ts`

1. Create `packages/core/src/constraints/sharing/bundle.ts`
2. Export `extractBundle(manifest: Manifest, config: Record<string, unknown>)` that:
   - Iterates `manifest.include` paths
   - For each path, extracts the corresponding section from config using dot-path resolution:
     - `"layers"` → `config.layers`
     - `"forbiddenImports"` → `config.forbiddenImports`
     - `"boundaries"` → `config.boundaries`
     - `"architecture"` → `config.architecture`
     - `"security.rules"` → `config.security?.rules` (nested dot-path)
   - Builds a Bundle object with manifest metadata + extracted constraints
   - Validates the result against BundleSchema
   - Returns Result
3. Run: `npx tsc --noEmit` from packages/core

### Task 3: Tests for manifest and bundle

**Depends on:** Task 1, Task 2
**Files:** `packages/core/tests/constraints/sharing/manifest.test.ts`, `packages/core/tests/constraints/sharing/bundle.test.ts`

1. Create manifest tests covering: valid manifest, missing required fields, empty include
2. Create bundle tests covering:
   - Extract layers only
   - Extract forbiddenImports only
   - Extract security.rules (dot-path)
   - Extract multiple sections
   - Missing section in config silently omitted
   - Full round-trip: manifest + config → valid bundle
3. Run: `cd packages/core && npx vitest run tests/constraints/sharing/`

### Task 4: Update barrel exports

**Depends on:** Task 1, Task 2
**Files:** `packages/core/src/constraints/sharing/index.ts`

1. Add exports for parseManifest and extractBundle to the barrel
2. Run: `npx tsc --noEmit`

### Task 5: Create harness share CLI command

**Depends on:** Task 4
**Files:** `packages/cli/src/commands/share.ts`

1. Create `packages/cli/src/commands/share.ts` with `createShareCommand()`
2. The command:
   - Reads `constraints.yaml` from project root (using `yaml` package to parse)
   - Calls `parseManifest()` with parsed YAML object
   - Calls `resolveConfig()` to load harness.config.json
   - Calls `extractBundle()` with manifest and config
   - Writes `<manifest.name>.harness-constraints.json` using `writeConfig()` from core
   - Error handling: no constraints.yaml → exit with helpful error
3. Follow existing command patterns: Command from commander, action handler, process.exit

### Task 6: Register share command in CLI index

**Depends on:** Task 5
**Files:** `packages/cli/src/index.ts`

1. Import `createShareCommand` from `./commands/share`
2. Add `program.addCommand(createShareCommand())` alongside other commands
3. Run: `npx tsc --noEmit` from packages/cli
4. Run: `harness validate`

## Traceability

| Observable Truth                        | Delivered By               |
| --------------------------------------- | -------------------------- |
| 1. parseManifest exported               | Task 1                     |
| 2. extractBundle exported               | Task 2                     |
| 3-5. Section extraction works correctly | Task 2, verified by Task 3 |
| 6. CLI share command works              | Task 5                     |
| 7. Missing yaml error handling          | Task 5                     |
| 8. Tests pass                           | Task 3                     |
| 9. harness validate passes              | Task 6                     |
