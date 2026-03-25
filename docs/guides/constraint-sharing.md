# Constraint Sharing Guide

Share architectural and security constraints across projects as portable bundles. Install them manually from files or from a private registry.

## Overview

Constraint sharing lets you export subsets of your `harness.config.json` as `.harness-constraints.json` bundles. Other projects install these bundles to adopt the same architectural layers, forbidden imports, boundary schemas, architecture thresholds, and security rules.

### What can be shared

| Section                 | Config key                 | Example                                                               |
| ----------------------- | -------------------------- | --------------------------------------------------------------------- |
| Layers                  | `layers`                   | `{ name: "types", pattern: "src/types/**", allowedDependencies: [] }` |
| Forbidden imports       | `forbiddenImports`         | `{ from: "src/domain/**", disallow: ["src/infra/**"] }`               |
| Boundaries              | `boundaries.requireSchema` | `["src/api/**"]`                                                      |
| Architecture thresholds | `architecture.thresholds`  | `{ cyclomaticComplexity: 10 }`                                        |
| Architecture modules    | `architecture.modules`     | `{ "src/api": { coupling: 5 } }`                                      |
| Security rules          | `security.rules`           | `{ "SEC-CRY-001": "error" }`                                          |

## Creating a constraint bundle

### 1. Write a manifest

Create `constraints.yaml` in your project root:

```yaml
name: strict-api
version: 1.0.0
description: Strict API layer constraints
minHarnessVersion: 0.1.0
keywords:
  - api
  - layers
include:
  - layers
  - forbiddenImports
  - security.rules
```

The `include` array uses dot-path notation to select which sections of your `harness.config.json` to export. Available paths: `layers`, `forbiddenImports`, `boundaries`, `architecture`, `security.rules`.

### 2. Export the bundle

```bash
harness share
```

This reads `constraints.yaml`, extracts the matching sections from your `harness.config.json`, and writes `strict-api.harness-constraints.json` to the current directory.

Options:

- `harness share [path]` — specify a different project root
- `harness share -o ./dist` — write the bundle to a custom output directory

The bundle file is a self-contained JSON file that includes:

- Bundle metadata (name, version, description, minHarnessVersion)
- The full manifest
- The extracted constraints

## Installing constraints

### Manual installation from a file

```bash
harness install-constraints ./path/to/strict-api.harness-constraints.json
```

This:

1. Reads and validates the bundle
2. Checks `minHarnessVersion` compatibility
3. Deep-merges the bundle's constraints into your local `harness.config.json`
4. Creates/updates `.harness/constraints.lock.json` with provenance tracking

### Installation from a private registry

Host your `.harness-constraints.json` files on a file share, Git repository, or internal artifact server. Then install by path:

```bash
# From a mounted network share
harness install-constraints /mnt/shared/constraints/strict-api.harness-constraints.json

# From a cloned internal repo
git clone git@github.com:your-org/harness-constraints.git /tmp/constraints
harness install-constraints /tmp/constraints/strict-api.harness-constraints.json

# From a CI artifact
curl -o /tmp/strict-api.harness-constraints.json https://artifacts.internal/constraints/strict-api/1.0.0.json
harness install-constraints /tmp/strict-api.harness-constraints.json
```

### Handling conflicts

When a bundle contains a rule that conflicts with your local config (same key, different value), you must choose a resolution strategy:

```bash
# Keep your local values for all conflicts
harness install-constraints ./bundle.json --force-local

# Use the package values for all conflicts
harness install-constraints ./bundle.json --force-package

# Preview what would change without writing
harness install-constraints ./bundle.json --dry-run
```

Without a flag, the command reports the conflicts and exits without modifying anything:

```
2 conflict(s) detected. Resolve with --force-local or --force-package:

  [layers] types: Layer "types" exists with different pattern
    Local:   {"name":"types","pattern":"src/types/**","allowedDependencies":[]}
    Package: {"name":"types","pattern":"lib/types/**","allowedDependencies":["utils"]}
```

### Idempotency

Installing the same package and version again is a no-op:

```
strict-api@1.0.0 is already installed. No changes made.
```

## Upgrading

To upgrade a constraint package, install a newer version of the same bundle:

```bash
harness install-constraints ./strict-api-v2.harness-constraints.json
```

The install command detects that the package name already exists in the lockfile. It removes the old contributions first, then merges the new bundle. This ensures clean upgrades without leftover rules from the previous version.

## Uninstalling

```bash
harness uninstall-constraints strict-api
```

This:

1. Reads the lockfile to find the package's contributions
2. Removes exactly the rules that were contributed by that package
3. Writes the cleaned config back
4. Removes the package from the lockfile

Only the rules that the package originally contributed are removed. Your local rules and rules from other packages are untouched.

## Lockfile

The lockfile at `.harness/constraints.lock.json` tracks what packages are installed and what they contributed:

```json
{
  "version": 1,
  "packages": {
    "strict-api": {
      "version": "1.0.0",
      "source": "./strict-api.harness-constraints.json",
      "installedAt": "2026-03-25T12:00:00.000Z",
      "contributions": {
        "layers": ["types", "core"],
        "forbiddenImports": ["src/domain/**"],
        "security.rules": ["SEC-CRY-001", "SEC-INJ-002"]
      }
    }
  }
}
```

Contributions track by stable keys (layer names, `from` patterns, rule IDs), not array indices. This means install/uninstall cycles are safe regardless of ordering.

Commit this file to version control so your team stays in sync.

## Merge semantics

Each constraint section has specific merge behavior:

| Section                 | Identity key            | Merge behavior                                                   |
| ----------------------- | ----------------------- | ---------------------------------------------------------------- |
| Layers                  | `name`                  | Append new layers. Same name + different config = conflict.      |
| Forbidden imports       | `from`                  | Append new rules. Same `from` + different `disallow` = conflict. |
| Boundaries              | `requireSchema` entries | Union with deduplication. No conflicts possible.                 |
| Architecture thresholds | category key            | Per-category merge. Same category + different value = conflict.  |
| Architecture modules    | `module:category`       | Per-module, per-category. Same key + different value = conflict. |
| Security rules          | rule ID                 | Per-rule merge. Same ID + different severity = conflict.         |

Identical values (same key, same value) are silently skipped -- no contribution recorded, no conflict reported.

## Project structure

```
packages/core/src/constraints/sharing/
  types.ts           # Zod schemas: ManifestSchema, BundleSchema, LockfileSchema, etc.
  manifest.ts        # parseManifest() — validates manifest objects
  bundle.ts          # extractBundle() — dot-path extraction from config
  merge.ts           # deepMergeConstraints() — per-section merge with conflict detection
  lockfile.ts        # readLockfile(), writeLockfile(), addProvenance(), removeProvenance()
  remove.ts          # removeContributions() — reverse of merge for uninstall
  write-config.ts    # Atomic JSON write utility
  index.ts           # Barrel re-exports

packages/cli/src/commands/
  share.ts                  # harness share
  install-constraints.ts    # harness install-constraints
  uninstall-constraints.ts  # harness uninstall-constraints
```

## Programmatic API

All core functions are exported from `@harness-engineering/core`:

```typescript
import {
  parseManifest,
  extractBundle,
  deepMergeConstraints,
  readLockfile,
  writeLockfile,
  addProvenance,
  removeProvenance,
  removeContributions,
  writeConfig,
} from '@harness-engineering/core';

// Parse a manifest object (not YAML string — parse YAML yourself)
const manifest = parseManifest(parsedYaml);

// Extract a bundle from config
const bundle = extractBundle(manifest.value, config);

// Merge bundle constraints into local config
const result = deepMergeConstraints(localConfig, bundle.value.constraints);
// result.config — merged config
// result.contributions — what was added (for lockfile)
// result.conflicts — any conflicts detected

// Remove contributions (for uninstall)
const cleaned = removeContributions(localConfig, contributions);
```
