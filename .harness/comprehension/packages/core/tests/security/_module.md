---
schemaVersion: 1
module: 'packages/core/tests/security'
sourceHash: '7b64902d1c69db78b5fc8d068f7c4043a20cf4612e47c4ebfe25d78f1252bd16'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'config.test.ts',
    'injection-patterns.test.ts',
    'integration.test.ts',
    'osv-client.test.ts',
    'scan-targets-rust.test.ts',
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
import { SECURITY_SCAN_EXTENSIONS, SECURITY_SCAN_GLOB } from '../../src/security/scan-targets'
import { SecurityScanner, parseHarnessIgnore } from '../../src/security/scanner'
import { extractQuotedSecretValue, isReferenceOnlySecretValue } from '../../src/security/secret-reference'
import { SecurityTimelineManager } from '../../src/security/security-timeline-manager'
import { EMPTY_SUPPLY_CHAIN, SecurityTimelineFile, securityFindingId } from '../../src/security/security-timeline-types'
import { detectStack } from '../../src/security/stack-detector'
import { checkTaint, clearTaint, getTaintFilePath, listTaintedSessions, readTaint, writeTaint } from '../../src/security/taint'
import { DEFAULT_SECURITY_CONFIG, ScanResult, SecurityCategory, SecurityConfidence, SecurityConfig, SecurityFinding, SecurityRule, SecuritySeverity } from '../../src/security/types'
import { glob } from 'glob'
import * as fs, { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import from 'node:fs/promises'
import * as os, { tmpdir } from 'node:os'
import * as path, { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
```
