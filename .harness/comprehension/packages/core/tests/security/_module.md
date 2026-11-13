---
schemaVersion: 1
module: 'packages/core/tests/security'
sourceHash: '2c6f68c025b23ce197d967f94a9d71acbef53e4396976db78586cea706a12c01'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'config.test.ts',
    'injection-patterns.test.ts',
    'integration.test.ts',
    'osv-client.test.ts',
    'scan-targets-default-ignore.test.ts',
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
import { SECURITY_SCAN_DEFAULT_IGNORE, SECURITY_SCAN_EXTENSIONS, SECURITY_SCAN_GLOB } from '../../src/security/scan-targets'
import { SecurityScanner, parseHarnessIgnore } from '../../src/security/scanner'
import { extractQuotedSecretValue, isReferenceOnlySecretValue } from '../../src/security/secret-reference'
import { SecurityTimelineManager } from '../../src/security/security-timeline-manager'
import { EMPTY_SUPPLY_CHAIN, SecurityTimelineFile, securityFindingId } from '../../src/security/security-timeline-types'
import { detectStack } from '../../src/security/stack-detector'
import { checkTaint, clearTaint, getTaintFilePath, listTaintedSessions, readTaint, writeTaint } from '../../src/security/taint'
import { DEFAULT_SECURITY_CONFIG, ScanResult, SecurityCategory, SecurityConfidence, SecurityConfig, SecurityFinding, SecurityRule, SecuritySeverity } from '../../src/security/types'
import { glob } from 'glob'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import * as fs from 'node:fs'
import 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as os from 'node:os'
import { join, relative } from 'node:path'
import * as path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
```
