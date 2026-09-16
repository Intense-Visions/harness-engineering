---
schemaVersion: 1
module: 'agents/skills/codex/harness-branch-buster/scripts/__tests__'
sourceHash: 'd3e04097f18033a53e02a1729dc4cd8d307260fc938297fd40fe3f4f271bffe5'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'compute-diff.test.mjs',
    'pick-hotspots.test.mjs',
    'render-report.test.mjs',
    'run-gates.test.mjs',
    'skill-yaml.test.mjs',
    'sync-branch.test.mjs',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { classifyChangeType, parseNameStatus, parseNumstat, summarizeDiff } from '../compute-diff.mjs'
import { parseChurn, rankByChurnComplexity } from '../pick-hotspots.mjs'
import { classifyOrigin, dedupeFindings, renderReport } from '../render-report.mjs'
import { loadGates, parseDriftFiles, parseEslintJson, parseMarkdownlint, parsePrettierCheck, parseTscOutput, parseVitestJson, summarize } from '../run-gates.mjs'
import { extractConflictHunks, parseConflictedFiles, parseIncoming } from '../sync-branch.mjs'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
```
