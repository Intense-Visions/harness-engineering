---
schemaVersion: 1
module: 'packages/core/src/review/output'
sourceHash: 'f9d2b36af55a2e6e36953d539bac6a934b6fde4ac1caa5b1ef63f27bc0505304'
compiledAt: '2026-08-28T01:22:10.490Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['assessment.ts', 'format-github.ts', 'format-terminal.ts', 'index.ts']
---

## Summary

The `packages/core/src/review/output` module is the rendering layer for code review data. It transforms review findings, strengths, and metrics (evidence coverage, depth calibration, integrity reports) into formatted output for GitHub PRs and terminals. The module does not generate findings—only format and display them.

**Core responsibility**: Given ReviewFinding[] and ReviewStrength[], render as GitHub markdown (inline comments + summary body) or terminal text. Also determine final assessment (approve/comment/request-changes) based on finding severity, which drives both PR review state and CI exit code.

**Key design choices**:

- Severity is the sole assessment driver: max severity determines verdict (critical→request-changes, important→comment, suggestion/none→approve)
- Small suggestions (< 10 lines) become committable GitHub suggestion blocks; larger ones render as text
- All text sanitized for GitHub markdown (HTML-escape `<>` to defend against CWE-79)
- Integrity violations tracked and rendered as audit trail so reviewers see what the gate did
- Evidence coverage always reports both numerator and denominator (even "abstained" state must be explicit)

## Invariants

- Assessment is severity-deterministic: max(severity) alone determines outcome — critical→request-changes, important→comment, suggestion/none→approve. No quorum, confidence thresholds, or domain weighting.
- Small suggestion heuristic is fixed at 10 lines: lineCount < 10 gates GitHub suggestion block eligibility; threshold changes break downstream automation.
- Markdown escaping is exhaustive for CWE-79 defense: '<>' must be escaped before GitHub rendering; other markdown chars intentionally NOT escaped to preserve emphasis in finding text.
- All findings report a location pair [lineRange[0], lineRange[1]]: GitHub inline comments anchor to lineRange[1]; absent range causes formatting failure.
- Exit code is binary and monotonic: assessment→exit (request-changes→1, else→0); CI gates depend on this mapping with no gradations.
- Integrity section always shows the denominator: 'abstained' is a first-class state (0 examined → 0 verified); output must never imply a gate verified findings it didn't examine.
- Evidence coverage is citation-based: coverage = findingsWithEvidence / (findingsWithEvidence + uncitedCount); uncited findings flagged [UNVERIFIED].
- Confidence field is polymorphic: formatConfidence handles both legacy (number) and new (object) shapes; rendering treats both as (conf X).

## Interface Contract

```ts
export determineAssessment
export formatDepthHeader
export formatFindingBlock
export formatGitHubComment
export formatGitHubSummary
export formatIntegritySection
export formatTerminalOutput
export getExitCode
export isSmallSuggestion
```

## Dependency Slice

```
import { SEVERITY_LABELS, SEVERITY_ORDER, SEVERITY_RANK } from '../constants'
import { DepthCalibration } from '../depth-calibrator'
import { FindingIntegrityReport } from '../finding-integrity'
import { EvidenceCoverageReport, FindingSeverity, GitHubInlineComment, ReviewAssessment, ReviewFinding, ReviewStrength } from '../types'
import { determineAssessment } from './assessment'
```
