# Trust Scoring for Agent Output

> Explicit confidence model per review finding: validation method (mechanical > graph > heuristic) x evidence quality x cross-agent agreement x historical accuracy. Every finding shows a visible confidence percentage for human triage. [E6]

## Overview

Add a quantified trust score (0-100%) to every `ReviewFinding` in the review pipeline. The score is computed from four independent factors and displayed prominently in both terminal and GitHub outputs, enabling human triagers to prioritize high-confidence findings and dismiss low-confidence noise.

## Goals

1. Every review finding carries a numeric `trustScore` (0-100) after Phase 5.5
2. The score visibly appears in all output formats (terminal, GitHub inline, GitHub summary)
3. The scoring formula is transparent and tunable via well-named constants
4. The system works without a graph (baseline mode) and improves with graph data (enriched mode)

## Decisions

| Decision | Rationale |
|----------|-----------|
| Standalone Phase 5.5 (between validate and dedup) | Clean separation from validation; cross-agent agreement detectable pre-dedup |
| `trustScore: number` (0-100) on ReviewFinding | Issue requires "visible confidence percentage"; integer is human-friendly |
| Weighted linear combination of 4 factors | Transparent, debuggable, tunable without statistical expertise |
| Deprecate categorical `confidence` field | Replaced by `trustScore`; `getTrustLevel()` utility for backwards compat |
| Baseline historical constants with optional graph | Works standalone; improves with PersonaEffectiveness data |

## Technical Design

### Data Structures

```typescript
// packages/core/src/review/trust-score.ts

/** Individual factor scores, each normalized to [0, 1]. */
interface TrustFactors {
  validation: number;   // Based on validatedBy: mechanical=1.0, graph=0.8, heuristic=0.5
  evidence: number;     // Based on evidence array length: min(1.0, count / 3)
  agreement: number;    // 1.0 if corroborated by another agent, 0.6 if standalone
  historical: number;   // Domain baseline, optionally enriched by graph effectiveness data
}

/** Result of trust score computation for a single finding. */
interface TrustScoreResult {
  score: number;        // 0-100 integer
  factors: TrustFactors;
}
```

### Constants

```typescript
/** Validation method → factor score. Mechanical is authoritative, heuristic is weakest. */
const VALIDATION_SCORES: Record<ReviewFinding['validatedBy'], number> = {
  mechanical: 1.0,
  graph: 0.8,
  heuristic: 0.5,
};

/** Per-domain historical accuracy baselines (used when graph is unavailable). */
const DOMAIN_BASELINES: Record<ReviewDomain, number> = {
  security: 0.70,
  bug: 0.60,
  architecture: 0.65,
  compliance: 0.75,
};

/** Weight of each factor in the final score. Must sum to 1.0. */
const FACTOR_WEIGHTS = {
  validation: 0.35,
  evidence: 0.25,
  agreement: 0.20,
  historical: 0.20,
} as const;

/** Evidence items needed for maximum evidence factor score. */
const EVIDENCE_SATURATION = 3;

/** Agreement factor when corroborated by another domain. */
const CORROBORATED_AGREEMENT = 1.0;

/** Agreement factor when only one agent flagged this location. */
const STANDALONE_AGREEMENT = 0.6;
```

### Algorithm

```
trustScore = round(
  (FACTOR_WEIGHTS.validation  × validationScore  +
   FACTOR_WEIGHTS.evidence    × evidenceScore    +
   FACTOR_WEIGHTS.agreement   × agreementScore   +
   FACTOR_WEIGHTS.historical  × historicalScore) × 100
)
```

Where:
- `validationScore = VALIDATION_SCORES[finding.validatedBy]`
- `evidenceScore = min(1.0, finding.evidence.length / EVIDENCE_SATURATION)`
- `agreementScore = CORROBORATED_AGREEMENT if overlapping finding from different domain exists, else STANDALONE_AGREEMENT`
- `historicalScore = PersonaEffectiveness score from graph if available, else DOMAIN_BASELINES[finding.domain]`

### Cross-Agent Agreement Detection

Before dedup merges overlapping findings, scan for findings from different domains that target the same file and overlapping line ranges. Mark these as "corroborated". This uses the same `rangesOverlap` logic from `deduplicate-findings.ts`.

### Type Changes

**`ReviewFinding` (fan-out.ts):**
- Add: `trustScore?: number` — 0-100 integer, set in Phase 5.5
- Deprecate: `confidence?: 'high' | 'medium' | 'low'` — kept for backwards compat, derived from `trustScore`

### Pipeline Integration

In `pipeline-orchestrator.ts`, between Phase 5 (validate) and Phase 6 (dedup):

```typescript
// --- Phase 5.5: TRUST SCORING ---
const scoredFindings = computeTrustScores(validatedFindings, { graph });
```

### Output Changes

**Terminal (`format-terminal.ts`):**
```
  [security] SQL injection via unsanitized input [85%]
    Location: src/db.ts:L42-45
    Rationale: ...
```

**GitHub inline (`format-github.ts`):**
```
**CRITICAL** [security] SQL injection via unsanitized input (confidence: 85%)
```

**GitHub summary (`format-github.ts`):**
```
- **SQL injection via unsanitized input** at `src/db.ts:L42-45` — 85% confidence
```

### Backwards Compatibility

```typescript
/** Map numeric trust score to categorical level. */
function getTrustLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}
```

### Dedup Merge Strategy

When merging two findings in Phase 6, the merged finding gets `trustScore = max(a.trustScore, b.trustScore)`. The rationale: if either finding has high trust, the merged finding inherits it.

### File Layout

| File | Change |
|------|--------|
| `packages/core/src/review/types/fan-out.ts` | Add `trustScore` field |
| `packages/core/src/review/trust-score.ts` | New — score computation |
| `packages/core/src/review/pipeline-orchestrator.ts` | Integrate Phase 5.5 |
| `packages/core/src/review/deduplicate-findings.ts` | Merge trust scores |
| `packages/core/src/review/output/format-terminal.ts` | Display `[N%]` |
| `packages/core/src/review/output/format-github.ts` | Display confidence % |
| `packages/core/src/review/constants.ts` | Export trust-related constants |
| `packages/core/src/review/index.ts` | Re-export trust-score module |

## Success Criteria

1. Every `ReviewFinding` after Phase 5.5 has a `trustScore` (0-100)
2. Terminal output shows `[N%]` after each finding title
3. GitHub inline comments show confidence percentage
4. Mechanical findings score 85-100%
5. Heuristic-only findings with no evidence score < 40%
6. Cross-agent agreement boosts score by ~20 percentage points
7. All existing tests pass
8. New unit tests cover all four factors and edge cases
9. `harness validate` passes

## Implementation Order

1. Add `trustScore` field to `ReviewFinding` type
2. Implement `trust-score.ts` with factor computation and score aggregation
3. Integrate into pipeline orchestrator (Phase 5.5)
4. Update dedup to preserve/merge trust scores
5. Update terminal output formatter
6. Update GitHub output formatters
7. Add `getTrustLevel()` utility and re-export
8. Write comprehensive unit tests
