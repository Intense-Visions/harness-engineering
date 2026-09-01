---
schemaVersion: 1
module: 'packages/orchestrator/src/workspace'
sourceHash: '69e00604bb36cf373aa3f08c0725074b1e717014d5a184015b6b0110aaab9f07'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'config-scanner.ts',
    'ecosystem.test.ts',
    'ecosystem.ts',
    'hooks.ts',
    'manager.introduced-diff.test.ts',
    'manager.preserve.test.ts',
    'manager.ship.test.ts',
    'manager.ts',
  ]
---

## Interface Contract

```ts
export ECOSYSTEM_RULES
export ScanConfigFileResult
export ScanConfigResult
export WorkspaceHooks
export WorkspaceManager
export detectEcosystem
export detectEcosystemFromFiles
export scanWorkspaceConfig
```

## Dependency Slice

```
import { IntroducedHunk, parseIntroducedHunks } from '../agent/quality-verdict.js'
import { ECOSYSTEM_RULES, EcosystemId, detectEcosystem, detectEcosystemFromFiles } from './ecosystem.js'
import { WorkspaceManager } from './manager'
import { ProvenanceTrailerInput, ScanConfigFileResult, ScanConfigFinding, ScanConfigResult, SecurityScanner, appendProvenanceTrailer, assignNumber, computeOverallSeverity, computeScanExitCode, ensureIdentity, mapInjectionFindings, mapSecurityFindings, parseProvenanceTrailer, parseSecurityConfig, readHarnessIdentity, scanForInjection } from '@harness-engineering/core'
import { Err, HarnessIdentity, HooksConfig, Ok, Result, WorkspaceConfig } from '@harness-engineering/types'
import * as fs from 'fs'
import { execFile, spawn } from 'node:child_process'
import * as fs, { existsSync, readFileSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path, { join, relative } from 'node:path'
import { promisify } from 'node:util'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
