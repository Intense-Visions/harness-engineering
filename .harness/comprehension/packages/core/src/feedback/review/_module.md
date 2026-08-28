---
schemaVersion: 1
module: 'packages/core/src/feedback/review'
sourceHash: '9750668e1d46cc7c93f462835bac1483212d4062fe61ecc3bce5ff11cc2ae3a5'
compiledAt: '2026-08-28T01:22:10.384Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['checklist.ts', 'diff-analyzer.ts', 'peer-review.ts', 'self-review.ts']
---

## Summary

The `review` module provides a fluent ChecklistBuilder for composing multi-layer code-review checks—harness-level (graph context, constraints, entropy), diff-based (forbidden patterns, file size, test coverage), and custom user rules. It parses git diffs into structured CodeChanges (file paths, line counts, status), applies each check category sequentially, and produces a deterministic ReviewChecklist with a summary and per-item severity/details. Peer-review functions request human review from single or multiple reviewers with configurable options. The system degrades gracefully: harness checks produce informational fallbacks without graph data; custom rule failures become error items without blocking the checklist.

## Invariants

- ReviewItem shape is the contract boundary — Every check (harness, diff, custom) must produce a ReviewItem with {id, category, check, passed, severity, details} plus optional {suggestion, file, line}. Consumers (CI gates, dashboards, editors) parse this exact structure.
- Diff parsing regex boundaries are exact — parseDiff() splits on /(?=diff --git)/ and uses regex /^[+!++]/ and /^[-!--]/ to count additions/deletions. Malformed diffs silently drop invalid parts (not error).
- Harness checks require graph OR fallback — If graph data is absent, harness items use fallback descriptions; if present, they must extract nodeCount, edgeCount, constraintViolations, unreachableNodes, undocumentedFiles exactly. Mismatch in field names breaks the build.
- Custom rule failure isolation — Each rule wrapped in try-catch; a thrown rule becomes {passed: false, severity: 'error', details: 'Rule execution failed: ...'}. One rule's crash doesn't poison others.
- Test coverage is dual-path — Both checkTestCoverageGraph() (requires graph data, uses affectedTests[].coversFile) and checkTestCoverageFilename() (heuristic .test. naming) run if enabled. Graph path is stricter; filename is fallback.
- Summary counts must match items exactly — {total, passed, failed, errors, warnings} counts are derived by filtering items array. Audit: passed + failed === total and errors + warnings ≤ failed. Pass/fail decision keys off failed === 0.
- Config optionality is three-valued — Options like harnessOptions.context !== false means enabled by default. Explicitly passing false disables; omitting keeps the default. Graph data presence can override config intent.

## Interface Contract

```ts
export ChecklistBuilder
export analyzeDiff
export createSelfReview
export parseDiff
export requestMultiplePeerReviews
export requestPeerReview
```

## Dependency Slice

```
import { Err, Ok, Result } from '../../shared/result'
import { getFeedbackConfig } from '../config'
import { trackAction } from '../logging/emitter'
import { AgentType, ChangedFile, CodeChanges, CustomRule, FeedbackError, GraphHarnessCheckData, GraphImpactData, PeerReview, PeerReviewOptions, ReviewChecklist, ReviewContext, ReviewItem, SelfReviewConfig } from '../types'
import { ChecklistBuilder } from './checklist'
import { analyzeDiff } from './diff-analyzer'
```
