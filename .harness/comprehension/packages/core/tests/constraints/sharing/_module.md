---
schemaVersion: 1
module: 'packages/core/tests/constraints/sharing'
sourceHash: 'faf60e6d65ab55cb043a93bdc12950a23964d3c71f2e247a1183e3fc6cf3d8ff'
compiledAt: '2026-08-28T01:22:10.797Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'bundle.test.ts',
    'lockfile.test.ts',
    'manifest.test.ts',
    'merge.test.ts',
    'remove.test.ts',
    'types.test.ts',
    'write-config.test.ts',
  ]
---

## Summary

The `constraints/sharing` module implements a constraint distribution and version management system that allows teams to package architectural rules (layers, forbidden imports, security policies, etc.) into reusable bundles, share them across projects, and track installations.

**Outbound flow:** A Manifest declares which config sections to include (via dot-path notation), then extractBundle packages those sections with metadata (name, version, minHarnessVersion).

**Inbound flow:** deepMergeConstraints intelligently combines a bundle into local config, flagging conflicts when constraints differ. A Lockfile tracks installed packages, their contributions (item-level precision), installation timestamps, and sources. removeContributions cleanly unwinds installations using the lockfile's contribution record.

All operations use Zod schema validation, preserve data integrity (immutable transforms), and handle edge cases gracefully (missing sections silently omit, conflicts don't mutate local config).

## Invariants

- Manifest include array is required, non-empty, and drives extraction; missing config sections silently omit rather than error
- Dot-path traversal in include list (e.g., 'security.rules') extracts nested objects; only the terminal value is extracted
- Lockfile version is always 1; all package entries must have version (string), source, installedAt (ISO timestamp), and contributions (object mapping section names to contributed items)
- Contributions are tracked at item level (e.g., { layers: ['types', 'core'] }) to enable surgical removal without collateral damage
- Merge conflict detection does not mutate local config; conflicts are reported in separate array while original config remains unchanged
- Provenance operations (addProvenance, removeProvenance) are immutable and return new lockfile objects; inputs are never mutated
- All read operations (readLockfile, parseManifest) return Result<T, string> with null when file missing and structured errors for parse/validation failures
- Config writes use consistent formatting: 2-space JSON indent with trailing newline to ensure round-trip integrity
- Bundle extraction silently omits sections that exist in manifest include but are missing from source config
- Identical constraints between local and bundle are deduplicated and not tracked as contributions

## Interface Contract

```ts

```

## Dependency Slice

```
import { extractBundle } from '../../../src/constraints/sharing/bundle'
import { addProvenance, readLockfile, removeProvenance, writeLockfile } from '../../../src/constraints/sharing/lockfile'
import { parseManifest } from '../../../src/constraints/sharing/manifest'
import { deepMergeConstraints } from '../../../src/constraints/sharing/merge'
import { removeContributions } from '../../../src/constraints/sharing/remove'
import { BundleConstraints, BundleConstraintsSchema, BundleSchema, Contributions, ContributionsSchema, Lockfile, LockfilePackage, LockfilePackageSchema, LockfileSchema, Manifest, ManifestSchema } from '../../../src/constraints/sharing/types'
import { writeConfig } from '../../../src/constraints/sharing/write-config'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
