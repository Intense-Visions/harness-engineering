---
schemaVersion: 1
module: 'packages/core/tests/constraints/sharing'
sourceHash: 'faf60e6d65ab55cb043a93bdc12950a23964d3c71f2e247a1183e3fc6cf3d8ff'
compiledAt: '2026-08-28T01:22:10.797Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
