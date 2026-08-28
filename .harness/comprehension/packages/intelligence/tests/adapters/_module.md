---
schemaVersion: 1
module: 'packages/intelligence/tests/adapters'
sourceHash: '8bf4cf89eff95fbbeabfb2d52795f7fb0c838e907e24a50acf87d1c77c08d547'
compiledAt: '2026-08-28T01:22:11.895Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'canary-boundary.test.ts',
    'canary.test.ts',
    'github.test.ts',
    'jira.test.ts',
    'linear.test.ts',
    'manual.test.ts',
  ]
---

## Summary

`packages/intelligence/tests/adapters` validates the adapter layer that bridges the intelligence package to external systems. The module tests four main adapter families: (1) Canary adapter — integrates the canary test-recommendation CLI and reads persisted test run history from NDJSON; (2) Issue adapters — map GitHub, Jira, and Linear issues into a common `RawWorkItem` shape; (3) Manual adapter — handles direct user input as work items. The Canary tests dominate: `readRunHistory()` parses NDJSON with graceful line-skipping; `probe()` detects installation status and degrades with precise reasons; `recommendFramework()` and `reviewTest()` call the canary CLI and validate JSON schemas, returning empty/degraded sentries on error instead of throwing. The suite enforces a hard module boundary: only `adapters/canary.ts` is allowed to name the `canary-test-cli` package or invoke the `canary` bin.

## Invariants

- Canary isolation: No file outside adapters/canary.ts may reference canary-test-cli or the canary bin directly (enforced by test boundary check).
- No-throw promise: All canary operations (probe, recommend, review, readRunHistory) return validated sentries or empty arrays on error—never throw, even on missing files, bad JSON, or schema mismatch.
- NDJSON resilience: readRunHistory() silently skips malformed/blank lines but preserves valid records in order; limit: 0 returns [], not 'all'.
- Fresh degraded sentries: Degraded recommendation/finding objects are new instances each call—no shared mutable state across retries.
- Permissive field survival: Unmodeled fields in JSON responses (e.g., failure_category) are preserved after validation; unmodeled severities are kept in findings arrays, not dropped.

## Interface Contract

```ts

```

## Dependency Slice

```
import { CanaryExec, CanaryReader, canaryFrameworkInfoSchema, createCanaryAdapter, resolveTestCommand } from '../../src/adapters/canary.js'
import { GitHubIssue, githubToRawWorkItem } from '../../src/adapters/github.js'
import { JiraIssue, jiraToRawWorkItem } from '../../src/adapters/jira.js'
import { LinearIssue, linearToRawWorkItem } from '../../src/adapters/linear.js'
import { manualToRawWorkItem } from '../../src/adapters/manual.js'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
```
