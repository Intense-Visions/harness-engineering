---
schemaVersion: 1
module: 'packages/core/tests/security'
sourceHash: '5560b0f155afa9a56d3c80f8a178caaa019000ed743f849c014f75ecdec26143'
compiledAt: '2026-08-28T01:22:11.053Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

`packages/core/tests/security` is a comprehensive security testing suite (~2,150 LOC across 32 test files) that validates the core security scanning pipeline: configuration management, injection pattern detection, multi-category static analysis rules, finding timeline tracking, and session taint lifecycle management.

The module covers 11 main functional areas via unit + integration tests:

- **Configuration** (schema validation, rule override resolution with wildcard matching, strict-mode promotion)
- **Injection patterns** (unicode obfuscation, re-roling, permission escalation, encoding tricks, social engineering)
- **Scanner core** (file/content scanning, config application, rule aggregation)
- **Secret handling** (API key detection, reference-only values)
- **Timeline tracking** (finding snapshots, lifecycle management)
- **Session taint** (marking/expiring tainted sessions after high-severity findings)
- **OSV integration** (Open Source Vulnerabilities client)
- **Stack detection** (runtime environment fingerprinting)
- **Rules validation** (20+ rule modules: injection, secrets, network, XSS, deserialization, path traversal, crypto, stack-specific Node/Express/React/Go)
- **File globbing** (scan operation filtering)
- **Type stability** (type definition validation)

## Invariants

- Wildcard resolution precedence is insertion-order-independent: Specific prefixes (e.g., SEC-INJ-_: error) must win over broad ones (e.g., SEC-_: off) regardless of map order—enables constraint packs to force-enable narrow rule families while silencing everything else.
- Injection findings carry accurate line numbers for proper IDE integration and source location mapping.
- Strict mode is one-way escalation: Warnings→errors promotion only; errors stay errors; disabling a rule stays disabled even in strict mode.
- Session taint is fail-open: Malformed JSON or missing required fields in taint files → delete file and treat as untainted (never block on corrupt state).
- Taint expiration is enforced at read time: Sessions have a TTL (typically 30 min); checkTaint() compares current time to expiresAt and marks expired state.
- Rule ID structure is predictable (SEC-<CATEGORY>-<NUMBER> or INJ-<TYPE>-<NUMBER>); wildcard matching uses prefix semantics.
- Config defaults are shallow: parseSecurityConfig merges partial input with defaults (enabled:true, strict:false); unspecified rules inherit rule-file defaults.
- Scanner is stateless across invocations: Each scanContent/scanFile call is independent; disabled scanner returns empty findings regardless of input.
- Timeline snapshots and finding lifecycles are separate concerns: Snapshots capture point-in-time state; lifecycles track a finding's history.
- Coverage tracking is required: All ScanResult.coverage values must be populated (baseline|partial); external tools declare coverage level.
- Remediation guidance is mandatory: Every finding must include message, remediation text, and reference links for developer guidance.
- Taint findings list has type-safety guarantees: InjectionFinding[] in taint state is typed; readTaint validates array presence/type to fail-open on schema mismatch.

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
