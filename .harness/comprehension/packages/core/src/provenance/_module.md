---
schemaVersion: 1
module: 'packages/core/src/provenance'
sourceHash: 'b541af53ecc8e09499ba7e67feaeeab967ba29160bf9fc57633f0c2f96c00738'
compiledAt: '2026-08-28T01:22:10.447Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'io.test.ts', 'io.ts', 'report.test.ts', 'report.ts']
---

## Summary

`packages/core/src/provenance` is a rule-to-solution provenance reporter that joins enforced rules (each with an optional `origin` back-pointer to a solution slug or issue ref) with solution docs (each with an optional `enforces` list claiming which rule ids it hardened). It detects two advisory flags: **unexplained constraints** (rules with no origin and not claimed by any solution) and **dead rule candidates** (broken links—rules pointing to non-existent solutions, or solutions enforcing STRENGTH rule ids absent from the registry). Main exports: `buildProvenanceReport(rules, solutions)` yields metrics + advisories; `collectSolutionEnforcements(cwd)` walks `docs/solutions`, parses frontmatter, extracts `enforces:` lists. The reporter is advisory metadata, never a gate—authority stays with enforcement gates.

## Invariants

- Slug matching is three-tier: a slug-shaped origin resolves to a solution by full match, trailing-segment match, or basename match (e.g., 'worktree-race' finds 'bug-track/logic-errors/worktree-race')
- Only STRENGTH-\d+ ids are checked for missing enforcements; non-STRENGTH scopes (arch:_, sec:_, etc.) skip this check entirely
- Issue refs (#1469, 1469) and URLs (https://...) bypass slug resolution and are never flagged as unresolved
- A rule with an origin counts as explained even if that origin is broken (unresolved slug)—unexplained fires only when there is NO origin AND no solution claims the rule
- Empty or missing enforces lists don't contribute; only non-empty enforces lists create SolutionEnforcement entries
- Graceful degradation when docs/solutions is absent: collectSolutionEnforcements returns [] with no error
- Non-string enforces entries are silently filtered; invalid YAML values (numbers, booleans, empty strings) disappear

## Interface Contract

```ts
export DeadRuleCandidate
export DeadRuleReason
export ProvenanceReport
export RuleProvenanceInput
export SolutionEnforcement
export UnexplainedConstraint
export buildProvenanceReport
export collectSolutionEnforcements
```

## Dependency Slice

```
import { collectSolutionEnforcements } from './io'
import { RuleProvenanceInput, SolutionEnforcement, buildProvenanceReport } from './report'
import matter from 'gray-matter'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
