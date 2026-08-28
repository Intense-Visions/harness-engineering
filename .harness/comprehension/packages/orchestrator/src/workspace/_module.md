---
schemaVersion: 1
module: "packages/orchestrator/src/workspace"
sourceHash: "5f2683bcaff6266dc66f7c182c69df0ab1f3745e7bda3eb37ee5fac0173ee127"
compiledAt: "2026-08-28T01:22:12.447Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["config-scanner.ts", "ecosystem.test.ts", "ecosystem.ts", "hooks.ts", "manager.introduced-diff.test.ts", "manager.preserve.test.ts", "manager.ship.test.ts", "manager.ts"]
---

## Summary

`packages/orchestrator/src/workspace` provides language-agnostic ecosystem detection and workspace config security scanning. **Ecosystem detection** solves the problem that the enforced gate was hardcoded to `pnpm -w run …`, failing for non-JS workspaces. It detects the workspace ecosystem from manifest/lockfile presence and returns the correct install and verify commands for each language (Node, Python, Rust, Go, Ruby, Java). The core matcher is a pure function—filenames in, descriptor out—enabling testable priority logic. **Config scanning** mirrors `harness scan-config`: it sweeps CLAUDE.md, AGENTS.md, .gemini/settings.json, and skill.yaml for injection patterns and security rule violations. Critically, it downgrades severity for noisy patterns (false positives on documentation) so documentation mentions of `eval(` don't block dispatch; only blocking injection categories (INJ-UNI-*, INJ-REROL-*) fail-close. The module unblocks local enforcement by making verify commands language-aware and workspace configs inspectable without CLI dependency.

## Invariants

- Ecosystem priority order is strict: lockfiles beat manifests (most-specific wins); declared priority in ECOSYSTEM_RULES applies; node beats non-node in polyglot repos (harness default)
- Pure matcher contract: detectEcosystemFromFiles(filenames) is side-effect-free and testable in isolation; filesystem wrapper is thin and delegates
- Verify commands are whitespace-splittable: non-node verify commands split cleanly on whitespace with no shell quoting—enables cross-platform spawn() without shell invocation
- Security scanning downgrades documentation noise: INJ-* and specified SEC-* rules (SEC-AGT-006, SEC-INJ-001) downgrade from high to medium severity in doc files; only blocking injection prefixes (INJ-UNI-, INJ-REROL-*) remain dispatch-blocking
- File-glob filtering prevents false positives: scanner.scanFile() applies fileGlob filtering (not scanContent) so rules like SEC-AGT-007 (hooks.json only) and SEC-MCP-002 (.mcp.json only) don't fire on CLAUDE.md/AGENTS.md
- Graceful degradation: both detectEcosystem() and config scanning return null or skip missing files instead of throwing; unreadable/absent paths are safe fallbacks, not errors

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
import { ScanConfigFileResult, ScanConfigFinding, ScanConfigResult, SecurityScanner, assignNumber, computeOverallSeverity, computeScanExitCode, ensureIdentity, mapInjectionFindings, mapSecurityFindings, parseSecurityConfig, readHarnessIdentity, scanForInjection } from '@harness-engineering/core'
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
