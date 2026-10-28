---
schemaVersion: 1
module: 'packages/core/src/constraints/sharing'
sourceHash: 'e5a595069a6b8a2c4d32d6dd7a5e1da8c4db0af3ca5c976bb4bd33bc076ab25b'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'bundle.ts',
    'index.ts',
    'lockfile.ts',
    'manifest.ts',
    'merge.ts',
    'remove.ts',
    'types.ts',
    'write-config.ts',
  ]
---

## Interface Contract

```ts
export Bundle
export BundleConstraints
export BundleConstraintsSchema
export BundleSchema
export ConflictReport
export Contributions
export ContributionsSchema
export Lockfile
export LockfilePackage
export LockfilePackageSchema
export LockfileSchema
export Manifest
export ManifestSchema
export MergeResult
export SharableBoundaryConfigSchema
export SharableForbiddenImportSchema
export SharableLayerSchema
export SharableSecurityRulesSchema
export addProvenance
export deepMergeConstraints
export extractBundle
export parseManifest
export readLockfile
export removeContributions
export removeProvenance
export writeConfig
export writeLockfile
```

## Dependency Slice

```
import { Err, Ok, Result } from '../../shared/result'
import { Bundle, BundleConstraints, BundleSchema, Contributions, Lockfile, LockfilePackage, LockfileSchema, Manifest, ManifestSchema } from './types'
import { writeConfig } from './write-config'
import { Result } from '@harness-engineering/types'
import * as fs from 'fs/promises'
import * as fs from 'node:fs/promises'
import { z } from 'zod'
```
