---
schemaVersion: 1
module: 'packages/core/tests/review/output'
sourceHash: '7648cb54bb9e058a504f8f54c5e82b3a8f3537f06a53e08096963583fb98c470'
compiledAt: '2026-08-28T01:22:10.892Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['assessment.test.ts', 'format-github.test.ts', 'format-terminal.test.ts']
---

## Summary

This module formats and assesses code review findings for different output channels (GitHub PRs and terminal/CLI). It's the presentation layer between the review engine and how results reach users. It has three primary concerns: (1) assessment logic that maps findings to a PR review decision based on severity levels (suggestion → important → critical), (2) GitHub formatting that renders findings + strengths for GitHub PRs, exploiting GitHub's native `suggestion` block feature for committable fixes under 10 lines, and (3) terminal formatting that renders findings + strengths as scannable markdown for CLI/IDE output.

## Invariants

- Severity hierarchy is strict: findings are bucketed as suggestion|important|critical, and assessment (→ exit code, → PR action) depends solely on max severity present.
- GitHub suggestion blocks are syntax-enforced: only suggestions ≤9 lines can become `suggestion` blocks (GitHub API behavior); larger suggestions fall back to description + rationale.
- Assessment is stateless and deterministic: determineAssessment(findings) returns the same output given the same input; exit codes map approve|comment → 0, request-changes → 1.
- Line pointers are end-inclusive: GitHub comments use lineRange[1] (the end line) as the anchor; terminal output shows L{start}-{end} range.
- Strengths and findings are orthogonal: both are optional, formatted separately (Strengths section, then Issues section), never interleaved; assessment ignores strengths.
- Severity order in output is fixed: terminal and GitHub summaries both emit findings in descending severity order (critical → important → suggestion); empty severity buckets are omitted.

## Interface Contract

```ts

```

## Dependency Slice

```
import { determineAssessment, getExitCode } from '../../../src/review/output/assessment'
import { formatGitHubComment, formatGitHubSummary, isSmallSuggestion } from '../../../src/review/output/format-github'
import { formatFindingBlock, formatTerminalOutput } from '../../../src/review/output/format-terminal'
import { ReviewFinding, ReviewStrength } from '../../../src/review/types'
import { describe, expect, it } from 'vitest'
```
