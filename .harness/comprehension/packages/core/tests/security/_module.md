---
schemaVersion: 1
module: 'packages/core/tests/security'
sourceHash: '5560b0f155afa9a56d3c80f8a178caaa019000ed743f849c014f75ecdec26143'
compiledAt: '2026-08-28T01:22:11.053Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'config.test.ts',
    'injection-patterns.test.ts',
    'integration.test.ts',
    'osv-client.test.ts',
    'scanner-fileglob.test.ts',
    'scanner.test.ts',
    'secret-reference.test.ts',
    'security-timeline-manager.test.ts',
    'stack-detector.test.ts',
    'taint.test.ts',
    'types.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { SecurityConfigSchema, parseSecurityConfig, resolveRuleSeverity } from '../../src/security/config'
import { InjectionFinding, getInjectionPatterns, scanForInjection } from '../../src/security/injection-patterns'
import { createOsvClient } from '../../src/security/osv-client'
import { SecurityScanner, parseHarnessIgnore } from '../../src/security/scanner'
import { extractQuotedSecretValue, isReferenceOnlySecretValue } from '../../src/security/secret-reference'
import { SecurityTimelineManager } from '../../src/security/security-timeline-manager'
import { EMPTY_SUPPLY_CHAIN, SecurityTimelineFile, securityFindingId } from '../../src/security/security-timeline-types'
import { detectStack } from '../../src/security/stack-detector'
import { checkTaint, clearTaint, getTaintFilePath, listTaintedSessions, readTaint, writeTaint } from '../../src/security/taint'
import { ScanResult, SecurityCategory, SecurityConfidence, SecurityConfig, SecurityFinding, SecurityRule, SecuritySeverity } from '../../src/security/types'
import * as fs, { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import from 'node:fs/promises'
import * as os from 'node:os'
import * as path, { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
