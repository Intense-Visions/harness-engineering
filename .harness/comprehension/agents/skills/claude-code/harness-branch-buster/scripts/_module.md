---
schemaVersion: 1
module: 'agents/skills/claude-code/harness-branch-buster/scripts'
sourceHash: '7ee7d8ceebdb9a06048c79108402d3e4fb17f13c58be26105f18bb8ae765fd04'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  ['compute-diff.mjs', 'pick-hotspots.mjs', 'render-report.mjs', 'run-gates.mjs', 'sync-branch.mjs']
---

## Interface Contract

```ts
export classifyChangeType
export classifyOrigin
export computeDiff
export dedupeFindings
export extractConflictHunks
export loadGates
export parseChurn
export parseConflictedFiles
export parseDriftFiles
export parseEslintJson
export parseIncoming
export parseMarkdownlint
export parseNameStatus
export parseNumstat
export parsePrettierCheck
export parseTscOutput
export parseVitestJson
export pickHotspots
export previewSync
export rankByChurnComplexity
export renderReport
export runGates
export summarize
export summarizeDiff
```

## Dependency Slice

```
import { execFileSync, execSync, spawnSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
```
