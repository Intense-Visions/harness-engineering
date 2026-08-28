---
schemaVersion: 1
module: 'packages/core/tests/validation/agent-configs'
sourceHash: 'd84f6d9e04a309bb91b16bab3760fc3a29b4d89ed6806af7029335ac86525fe7'
compiledAt: '2026-08-28T01:22:11.155Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'agnix-runner.behavior.test.ts',
    'agnix-runner.test.ts',
    'fallback.test.ts',
    'runner.behavior.test.ts',
    'runner.test.ts',
  ]
---

## Summary

`packages/core/tests/validation/agent-configs` tests a dual-engine validation system for agent configurations. The agnix engine wraps an external linter binary with spawn/timeout/parsing logic; when agnix is unavailable or fails, a JavaScript fallback enforces HARNESS-AC-\* rules on CLAUDE.md and agent definitions. The test suite covers binary discovery, process lifecycle, output parsing, and six distinct fallback triggers. Strict mode promotes warnings to errors post-parsing.

## Invariants

- Exit code 0 and 1 only are success; 2+ or null → tool-failure fallback
- isAgnixDisabled parses only '1' or 'true' exactly; other truthy strings are false
- Binary resolution: HARNESS_AGNIX_BIN env var → PATH scan → null, first match wins
- Process promises settle once; late events after close/error/timeout are ignored
- Strict mode: warnings → errors, other severities unchanged, original findings unmutated
- Path normalization: under-cwd paths stripped to relative, out-of-cwd paths preserved
- Output field defaults: ruleId='AGNIX-UNKNOWN', message='agnix diagnostic', file='(unknown)'
- parseAgnixOutput accepts direct arrays or {findings/results} envelopes; unknown shapes → null
- Fallback triggers: env-disabled, binary-not-found, tool-timeout, tool-failure, tool-parse-error
- SIGKILL enforced once on timeout deadline; timeoutMs defaults to 30_000ms
- Tests are hermetic: temp directories, agnix disabled, env vars saved/restored per test
- Severity promotion runs after engine completes, on the full result set

## Interface Contract

```ts

```

## Dependency Slice

```
import { validateAgentConfigs } from '../../../src/validation/agent-configs'
import { AgnixOutcome, DEFAULT_AGNIX_TIMEOUT_MS, HARNESS_AGNIX_BIN, HARNESS_AGNIX_DISABLE, isAgnixDisabled, parseAgnixOutput, resolveAgnixBinary, runAgnix } from '../../../src/validation/agent-configs/agnix-runner'
import { runFallbackRules } from '../../../src/validation/agent-configs/fallback'
import { validateAgentConfigs } from '../../../src/validation/agent-configs/runner'
import { AgentConfigFinding, AgentConfigValidation } from '../../../src/validation/agent-configs/types'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
