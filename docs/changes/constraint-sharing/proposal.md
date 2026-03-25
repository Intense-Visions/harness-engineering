# Constraint Sharing

> Export subsets of `harness.config.json` as shareable bundles. Import and merge constraint sets into other projects with per-rule provenance tracking.

**Keywords:** constraint-sharing, harness-share, install-constraints, lockfile, provenance, deep-merge, architecture-rules, security-rules

## Overview

The harness framework enforces architectural and security constraints via `harness.config.json`. These constraints — layer definitions, forbidden imports, boundary rules, architecture thresholds, and security rule severities — represent opinionated stances that teams want to standardize across projects. Today there is no mechanism to share constraint configurations between projects.

Constraint Sharing introduces:

- **`harness share`** — reads a `constraints.yaml` manifest and extracts declared config sections into a portable bundle file
- **`harness install-constraints <source>`** — fetches a bundle (file path or URL), deep-merges into local config with conflict reporting, and writes per-rule provenance to a lockfile
- **`harness uninstall-constraints <name>`** — removes exactly the rules a package contributed, using lockfile provenance
- **`harness upgrade-constraints <name> <source>`** — replaces an installed package's rules with a new version and reports the diff

### Goals

1. When a user runs `harness share`, the system shall extract architecture constraints (`layers`, `forbiddenImports`, `boundaries`, `architecture`) and security rules (`security.rules`) from the local config based on a `constraints.yaml` manifest and write a self-contained bundle file
2. When a user runs `harness install-constraints <source>`, the system shall deep-merge the bundle into the local `harness.config.json`, report conflicts, write per-rule provenance to `.harness/constraints.lock.json`, and be idempotent (installing the same package twice produces no duplicate rules and leaves the lockfile unchanged)
3. When a user runs `harness uninstall-constraints <name>`, the system shall remove exactly the rules contributed by that package using lockfile provenance
4. When a user runs `harness upgrade-constraints <name>`, the system shall diff the old and new versions and re-merge with conflict reporting
5. When a bundle declares a `minHarnessVersion` higher than the installed version, the install shall fail with a clear compatibility error before modifying any files

### Non-Goals

- npm publishing (deferred to phase 2, after skill marketplace H1 establishes patterns)
- Sharing performance thresholds or entropy config (can expand later)
- Runtime config resolution (`extends` pattern — rejected in favor of explicit merge)
- Constraint package ratings or curation

### Assumptions

- Single `harness.config.json` per project root. Per-package monorepo configs are not supported in this version.
- Bundles are validated against `BundleSchema` (Zod) before merge. Only known constraint sections are merged; unknown keys are rejected.
- Bundle sources (file paths, URLs) are trusted by the user. No cryptographic verification of bundle integrity in this version.

## Decisions

| Decision               | Choice                                                                                                        | Rationale                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Shareable sections     | Architecture (`layers`, `forbiddenImports`, `boundaries`, `architecture`) + security rules (`security.rules`) | Most portable across projects. Performance/entropy too project-specific. Expandable later                 |
| Distribution (phase 1) | File paths and git URLs                                                                                       | Ships core value fast. npm publishing deferred to align with skill marketplace (H1)                       |
| Distribution (phase 2) | `@harness-constraints/*` npm namespace                                                                        | Aligns with `@harness-skills/*` pattern. Versioned, discoverable, familiar                                |
| Manifest format        | `constraints.yaml` in project root                                                                            | Separates publishing concerns from runtime config. Holds metadata without polluting `harness.config.json` |
| Merge strategy         | Deep merge with conflict reporting                                                                            | Additive by default. Conflicts surfaced, not hidden. User chooses resolution                              |
| Provenance tracking    | `.harness/constraints.lock.json` with per-rule source attribution                                             | Enables clean uninstall, upgrade, and "where did this rule come from?" queries                            |
| Compatibility          | `minHarnessVersion` in manifest                                                                               | Sufficient for content packages. Catches breaking schema changes without semver range complexity          |
| Uninstall mechanism    | Lockfile-driven rule removal                                                                                  | Exact reversal using provenance. No snapshots, no manual cleanup                                          |

## Technical Design

### Manifest: `constraints.yaml`

```yaml
name: strict-api
version: '1.0.0'
description: Strict API layer enforcement with forbidden cross-layer imports
minHarnessVersion: '1.0.0'
keywords: [api, layers, forbidden-imports, strict]
include:
  - layers
  - forbiddenImports
  - boundaries
  - security.rules
  # architecture.thresholds and architecture.modules also valid
```

The `include` array specifies which top-level keys (and dot-path sub-keys) to extract from `harness.config.json` when building the bundle.

### Bundle format: `.harness-constraints.json`

```json
{
  "name": "strict-api",
  "version": "1.0.0",
  "minHarnessVersion": "1.0.0",
  "description": "Strict API layer enforcement with forbidden cross-layer imports",
  "constraints": {
    "layers": [{ "name": "types", "pattern": "packages/types/src/**", "allowedDependencies": [] }],
    "forbiddenImports": [
      {
        "from": "packages/types/src/**",
        "disallow": ["packages/core/src/**"],
        "message": "Types cannot import core"
      }
    ],
    "security": {
      "rules": { "SEC-CRY-001": "error" }
    }
  }
}
```

`constraints` contains only the sections listed in `include`, extracted verbatim from the local config.

### Lockfile: `.harness/constraints.lock.json`

```json
{
  "version": 1,
  "packages": {
    "strict-api": {
      "version": "1.0.0",
      "source": "./shared/strict-api.harness-constraints.json",
      "installedAt": "2026-03-24T12:00:00Z",
      "contributions": {
        "layers": ["types", "core", "cli"],
        "forbiddenImports": [0, 1, 2],
        "security.rules": ["SEC-CRY-001"]
      }
    }
  }
}
```

- `contributions.layers` — layer names added by this package
- `contributions.forbiddenImports` — indices in the merged array contributed by this package
- `contributions.security.rules` — rule IDs added by this package

### Merge algorithm

1. **Layers** — match by `name`. If a layer name exists locally with different config, report conflict. Otherwise append.
2. **Forbidden imports** — match by `from` pattern. If same `from` exists locally with different `disallow`, report conflict. Otherwise append.
3. **Boundaries** — merge `requireSchema` arrays (union, deduplicate).
4. **Architecture thresholds** — per-category merge. If same category exists locally with different value, report conflict.
5. **Architecture modules** — per-module, per-category merge. Same conflict strategy.
6. **Security rules** — per-rule-ID merge. If same ID exists with different severity, report conflict.

Conflicts are reported as a list: `"Conflict: layer 'core' already exists locally with different allowedDependencies. Keep local (L) or use package (P)?"` Interactive prompt in TTY, `--force-local` or `--force-package` flags for CI.

### Config write-back

The codebase currently only reads `harness.config.json` (via `packages/cli/src/config/loader.ts`). This feature introduces a `writeConfig()` utility:

- Uses `JSON.stringify(config, null, 2)` for consistent formatting
- Writes atomically (write to temp file, then rename)
- JSON does not support comments — any manual comments in the config file will be lost on write-back. This is documented in the CLI help text.

### Error handling

- If `constraints.yaml` does not exist, `harness share` shall exit with error: `"No constraints.yaml found. Run harness share --init to create one."`
- If the source URL is unreachable or returns non-200, `harness install-constraints` shall fail with error before modifying any local files
- If the bundle constraints object is empty, the install shall warn and exit without modifying config or lockfile
- If the lockfile fails schema validation, the install shall warn and offer to recreate it from current config state

### CLI commands

**`harness share`**

1. Read `constraints.yaml` from project root
2. Validate manifest schema
3. Extract listed sections from `harness.config.json`
4. Write `<name>.harness-constraints.json` to current directory

**`harness install-constraints <source>`**

1. Resolve source (file path or URL — fetch if URL)
2. Parse bundle, validate against `BundleSchema`
3. Check `minHarnessVersion` against installed CLI version
4. Load local `harness.config.json` and existing lockfile
5. Deep-merge with conflict detection
6. If conflicts: prompt user (or apply `--force-local` / `--force-package` flag)
7. Write updated `harness.config.json` via `writeConfig()`
8. Write updated `.harness/constraints.lock.json`

**`harness uninstall-constraints <name>`**

1. Load lockfile, find package by name
2. Remove contributed rules from `harness.config.json` using provenance
3. Remove package entry from lockfile
4. Write both files

**`harness upgrade-constraints <name> <source>`**

1. Uninstall old version (using lockfile provenance)
2. Install new version from source
3. Report what changed (added/removed/modified rules)

### File layout (new code)

```
packages/core/src/constraints/
  types.ts             # ManifestSchema, BundleSchema, LockfileSchema (Zod)
  manifest.ts          # parseManifest(), validateManifest()
  bundle.ts            # extractBundle(), parseBundle()
  merge.ts             # deepMergeConstraints(), detectConflicts()
  lockfile.ts          # readLockfile(), writeLockfile(), addProvenance(), removeProvenance()
  write-config.ts      # writeConfig() — atomic JSON write-back

packages/cli/src/commands/
  share.ts                   # harness share
  install-constraints.ts     # harness install-constraints
  uninstall-constraints.ts   # harness uninstall-constraints
  upgrade-constraints.ts     # harness upgrade-constraints
```

Core logic lives in `packages/core/src/constraints/` — the CLI commands are thin wrappers that handle I/O and prompts.

## Success Criteria

1. `harness share` reads `constraints.yaml` and produces a valid `.harness-constraints.json` bundle containing only the declared sections
2. `harness install-constraints ./bundle.json` merges constraints into local config and writes a lockfile with per-rule provenance
3. Installing a bundle with conflicting rules surfaces each conflict with clear descriptions and resolution options
4. `harness uninstall-constraints strict-api` removes exactly the rules that package contributed, leaving local rules untouched
5. `harness upgrade-constraints strict-api ./new-bundle.json` cleanly replaces old version's rules with new version's rules and reports the diff
6. If a bundle declares `minHarnessVersion` higher than the installed CLI version, install fails with a clear error before modifying any files
7. Round-trip integrity: share -> install -> uninstall leaves `harness.config.json` identical to its pre-install state
8. Installing the same package twice is idempotent — no duplicate rules, lockfile unchanged
9. All core logic (`merge`, `lockfile`, `bundle`) has unit tests with >90% coverage
10. CLI commands follow existing patterns (`Result<T, CLIError>`, `OutputFormatter`, `resolveConfig`)

## Implementation Order

**Phase 1: Types and schemas** — Zod schemas for manifest, bundle, and lockfile, plus `writeConfig()` utility. Foundation everything else builds on.

**Phase 2: Bundle extraction** — `parseManifest()`, `extractBundle()` in core. `harness share` CLI command. Testable end-to-end: write a manifest, run share, get a valid bundle.

**Phase 3: Merge engine** — `deepMergeConstraints()`, `detectConflicts()` in core. The hardest phase — each constraint section has its own merge/match semantics. Unit-test-heavy.

**Phase 4: Lockfile and provenance** — `readLockfile()`, `writeLockfile()`, `addProvenance()`, `removeProvenance()`. Wired into merge engine.

**Phase 5: Install command** — `harness install-constraints` CLI command. Orchestrates: fetch -> validate -> merge -> write config -> write lockfile. Interactive conflict prompts.

**Phase 6: Uninstall and upgrade** — `harness uninstall-constraints` and `harness upgrade-constraints`. Both depend on lockfile provenance from Phase 4.

**Phase 7 (future): npm publishing** — Add `harness share --publish` using `@harness-constraints/*` namespace. Deferred until skill marketplace (H1) establishes npm patterns.
