# Plan: Trust Scoring for Agent Output

**Date:** 2026-04-17 | **Spec:** docs/changes/trust-scoring-for-agent-output/proposal.md | **Tasks:** 7 | **Time:** ~28 min

## Goal

Every review finding carries a numeric trust score (0-100%) computed from validation method, evidence quality, cross-agent agreement, and historical accuracy, displayed in all output formats.

## Observable Truths (Acceptance Criteria)

1. When a finding has `validatedBy: 'mechanical'` and 3+ evidence items, `trustScore` is between 85-100.
2. When a finding has `validatedBy: 'heuristic'` and 0 evidence items with no agreement, `trustScore` is below 40.
3. When two findings from different domains target overlapping line ranges, both get agreement factor 1.0 (vs 0.6 standalone).
4. Terminal output shows `[N%]` after each finding title.
5. GitHub inline comments show `(confidence: N%)`.
6. GitHub summary shows `N% confidence`.
7. Dedup merge preserves the higher `trustScore`.
8. `computeTrustScores` is a pure function (same inputs → same outputs).
9. All existing tests pass.

## File Map

```
MODIFY packages/core/src/review/types/fan-out.ts          (add trustScore field)
CREATE packages/core/src/review/trust-score.ts             (score computation)
CREATE packages/core/tests/review/trust-score.test.ts      (unit tests)
MODIFY packages/core/src/review/pipeline-orchestrator.ts   (Phase 5.5 integration)
MODIFY packages/core/src/review/deduplicate-findings.ts    (merge trustScore)
MODIFY packages/core/src/review/output/format-terminal.ts  (display [N%])
MODIFY packages/core/src/review/output/format-github.ts    (display confidence %)
MODIFY packages/core/src/review/index.ts                   (re-export)
```

## Tasks

### Task 1: Add trustScore field to ReviewFinding type

**Depends on:** none | **Files:** packages/core/src/review/types/fan-out.ts

1. Add `trustScore` optional field to `ReviewFinding`:
   ```typescript
   /** Trust score (0-100%) computed in Phase 5.5 from validation method, evidence quality, cross-agent agreement, and historical accuracy. */
   trustScore?: number;
   ```
2. Run: `npx vitest run packages/core/tests/review/ --reporter=verbose 2>&1 | tail -20`
3. Run: `npx harness validate`
4. Commit: `feat(review): add trustScore field to ReviewFinding type`

### Task 2: Implement trust-score.ts with TDD — test first

**Depends on:** Task 1 | **Files:** packages/core/tests/review/trust-score.test.ts, packages/core/src/review/trust-score.ts

1. Create test file `packages/core/tests/review/trust-score.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { computeTrustScores, getTrustLevel } from '../../src/review/trust-score';
   import type { ReviewFinding } from '../../src/review/types';

   function makeFinding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
     return {
       id: 'bug-src-auth-ts-42-test',
       file: 'src/auth.ts',
       lineRange: [40, 45] as [number, number],
       domain: 'bug',
       severity: 'important',
       title: 'Test finding',
       rationale: 'Test rationale',
       evidence: ['evidence line'],
       validatedBy: 'heuristic',
       ...overrides,
     };
   }

   describe('computeTrustScores()', () => {
     it('returns findings with trustScore set', () => {
       const findings = [makeFinding()];
       const result = computeTrustScores(findings);
       expect(result).toHaveLength(1);
       expect(result[0]!.trustScore).toBeTypeOf('number');
       expect(result[0]!.trustScore).toBeGreaterThanOrEqual(0);
       expect(result[0]!.trustScore).toBeLessThanOrEqual(100);
     });

     it('scores mechanical + 3 evidence items between 85-100', () => {
       const findings = [makeFinding({
         validatedBy: 'mechanical',
         evidence: ['a', 'b', 'c'],
       })];
       const result = computeTrustScores(findings);
       expect(result[0]!.trustScore).toBeGreaterThanOrEqual(85);
       expect(result[0]!.trustScore).toBeLessThanOrEqual(100);
     });

     it('scores heuristic + 0 evidence + no agreement below 40', () => {
       const findings = [makeFinding({
         validatedBy: 'heuristic',
         evidence: [],
       })];
       const result = computeTrustScores(findings);
       expect(result[0]!.trustScore).toBeLessThan(40);
     });

     it('boosts agreement factor when different domains overlap same file/lines', () => {
       const findings = [
         makeFinding({ id: 'a', domain: 'bug', file: 'src/x.ts', lineRange: [10, 20] }),
         makeFinding({ id: 'b', domain: 'security', file: 'src/x.ts', lineRange: [15, 25] }),
       ];
       const result = computeTrustScores(findings);
       // Both should have higher scores than standalone (agreement boost ~8pp)
       const standalone = computeTrustScores([makeFinding({ id: 'a', domain: 'bug', file: 'src/x.ts', lineRange: [10, 20] })]);
       expect(result[0]!.trustScore).toBeGreaterThan(standalone[0]!.trustScore!);
     });

     it('does not boost agreement for same-domain overlaps', () => {
       const findings = [
         makeFinding({ id: 'a', domain: 'bug', file: 'src/x.ts', lineRange: [10, 20] }),
         makeFinding({ id: 'b', domain: 'bug', file: 'src/x.ts', lineRange: [15, 25] }),
       ];
       const result = computeTrustScores(findings);
       const standalone = computeTrustScores([makeFinding({ id: 'a', domain: 'bug', file: 'src/x.ts', lineRange: [10, 20] })]);
       expect(result[0]!.trustScore).toBe(standalone[0]!.trustScore);
     });

     it('is a pure function — same inputs produce same outputs', () => {
       const findings = [makeFinding(), makeFinding({ id: 'b', domain: 'security' })];
       const result1 = computeTrustScores(findings);
       const result2 = computeTrustScores(findings);
       expect(result1.map(f => f.trustScore)).toEqual(result2.map(f => f.trustScore));
     });

     it('graph validation scores higher than heuristic', () => {
       const heuristic = computeTrustScores([makeFinding({ validatedBy: 'heuristic' })]);
       const graph = computeTrustScores([makeFinding({ validatedBy: 'graph' })]);
       expect(graph[0]!.trustScore).toBeGreaterThan(heuristic[0]!.trustScore!);
     });

     it('more evidence produces higher score', () => {
       const noEvidence = computeTrustScores([makeFinding({ evidence: [] })]);
       const someEvidence = computeTrustScores([makeFinding({ evidence: ['a', 'b', 'c'] })]);
       expect(someEvidence[0]!.trustScore).toBeGreaterThan(noEvidence[0]!.trustScore!);
     });

     it('returns empty array for empty input', () => {
       expect(computeTrustScores([])).toEqual([]);
     });
   });

   describe('getTrustLevel()', () => {
     it('returns high for scores >= 70', () => {
       expect(getTrustLevel(70)).toBe('high');
       expect(getTrustLevel(100)).toBe('high');
     });

     it('returns medium for scores 40-69', () => {
       expect(getTrustLevel(40)).toBe('medium');
       expect(getTrustLevel(69)).toBe('medium');
     });

     it('returns low for scores < 40', () => {
       expect(getTrustLevel(39)).toBe('low');
       expect(getTrustLevel(0)).toBe('low');
     });
   });
   ```

2. Run tests — observe failure: `npx vitest run packages/core/tests/review/trust-score.test.ts`

3. Create implementation `packages/core/src/review/trust-score.ts`:

   ```typescript
   import type { ReviewFinding } from './types';
   import type { ReviewDomain } from './types/context';

   /** Validation method → trust factor. Mechanical is authoritative, heuristic is weakest. */
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

   /** Weight of each factor in the final score. Sums to 1.0. */
   const FACTOR_WEIGHTS = {
     validation: 0.35,
     evidence: 0.25,
     agreement: 0.20,
     historical: 0.20,
   } as const;

   /** Evidence items needed for maximum evidence factor. */
   const EVIDENCE_SATURATION = 3;

   /** Agreement factor when corroborated by another domain. */
   const CORROBORATED_AGREEMENT = 1.0;

   /** Agreement factor when only one agent flagged this location. */
   const STANDALONE_AGREEMENT = 0.6;

   /** Line gap for agreement detection (same as dedup). */
   const AGREEMENT_LINE_GAP = 3;

   function rangesOverlap(a: [number, number], b: [number, number], gap: number): boolean {
     return a[0] <= b[1] + gap && b[0] <= a[1] + gap;
   }

   /**
    * Build a set of finding IDs that are corroborated by findings from a different domain
    * targeting overlapping line ranges in the same file.
    */
   function findCorroboratedIds(findings: ReviewFinding[]): Set<string> {
     const corroborated = new Set<string>();

     for (let i = 0; i < findings.length; i++) {
       for (let j = i + 1; j < findings.length; j++) {
         const a = findings[i]!;
         const b = findings[j]!;
         if (
           a.file === b.file &&
           a.domain !== b.domain &&
           rangesOverlap(a.lineRange, b.lineRange, AGREEMENT_LINE_GAP)
         ) {
           corroborated.add(a.id);
           corroborated.add(b.id);
         }
       }
     }

     return corroborated;
   }

   /**
    * Compute trust scores for all findings. Pure function — same inputs produce same outputs.
    *
    * Score = round((validation * 0.35 + evidence * 0.25 + agreement * 0.20 + historical * 0.20) * 100)
    */
   export function computeTrustScores(findings: ReviewFinding[]): ReviewFinding[] {
     if (findings.length === 0) return [];

     const corroboratedIds = findCorroboratedIds(findings);

     return findings.map((finding) => {
       const validationFactor = VALIDATION_SCORES[finding.validatedBy];
       const evidenceFactor = Math.min(1.0, finding.evidence.length / EVIDENCE_SATURATION);
       const agreementFactor = corroboratedIds.has(finding.id)
         ? CORROBORATED_AGREEMENT
         : STANDALONE_AGREEMENT;
       const historicalFactor = DOMAIN_BASELINES[finding.domain];

       const raw =
         FACTOR_WEIGHTS.validation * validationFactor +
         FACTOR_WEIGHTS.evidence * evidenceFactor +
         FACTOR_WEIGHTS.agreement * agreementFactor +
         FACTOR_WEIGHTS.historical * historicalFactor;

       const trustScore = Math.round(raw * 100);

       return { ...finding, trustScore };
     });
   }

   /** Map numeric trust score to categorical level for backwards compatibility. */
   export function getTrustLevel(score: number): 'high' | 'medium' | 'low' {
     if (score >= 70) return 'high';
     if (score >= 40) return 'medium';
     return 'low';
   }
   ```

4. Run tests — observe pass: `npx vitest run packages/core/tests/review/trust-score.test.ts`
5. Run: `npx harness validate`
6. Commit: `feat(review): implement trust score computation with 4-factor model`

### Task 3: Integrate trust scoring into pipeline orchestrator (Phase 5.5)

**Depends on:** Task 2 | **Files:** packages/core/src/review/pipeline-orchestrator.ts

1. Add import at top: `import { computeTrustScores } from './trust-score';`
2. Between Phase 5 (validate) and evidence check, insert:
   ```typescript
   // --- Phase 5.5: TRUST SCORING ---
   const scoredFindings = computeTrustScores(validatedFindings);
   ```
3. Replace all subsequent references to `validatedFindings` with `scoredFindings` (in evidence check and dedup).
4. Run: `npx vitest run packages/core/tests/review/pipeline-orchestrator.test.ts --reporter=verbose 2>&1 | tail -30`
5. Run: `npx harness validate`
6. Commit: `feat(review): integrate trust scoring as Phase 5.5 in pipeline`

### Task 4: Update dedup to merge trust scores

**Depends on:** Task 1 | **Files:** packages/core/src/review/deduplicate-findings.ts

1. In `mergeFindings()`, after the merged object is constructed, add:
   ```typescript
   // Preserve the higher trust score when merging
   const trustA = a.trustScore ?? 0;
   const trustB = b.trustScore ?? 0;
   if (trustA > 0 || trustB > 0) {
     merged.trustScore = Math.max(trustA, trustB);
   }
   ```
2. Run: `npx vitest run packages/core/tests/review/deduplicate-findings.test.ts --reporter=verbose 2>&1 | tail -20`
3. Run: `npx harness validate`
4. Commit: `feat(review): preserve higher trustScore during finding dedup merge`

### Task 5: Update terminal output to display trust score

**Depends on:** Task 1 | **Files:** packages/core/src/review/output/format-terminal.ts

1. In `formatFindingBlock()`, modify the first line to include trust score:
   ```typescript
   const trustBadge = finding.trustScore != null ? ` [${finding.trustScore}%]` : '';
   lines.push(`  [${finding.domain}] ${finding.title}${trustBadge}`);
   ```
2. Run: `npx vitest run packages/core/tests/review/output/format-terminal.test.ts --reporter=verbose 2>&1 | tail -20`
3. Run: `npx harness validate`
4. Commit: `feat(review): display trust score percentage in terminal output`

### Task 6: Update GitHub output to display trust score

**Depends on:** Task 1 | **Files:** packages/core/src/review/output/format-github.ts

1. In `formatGitHubComment()`, add confidence to header:
   ```typescript
   const confidenceBadge = finding.trustScore != null ? ` (confidence: ${finding.trustScore}%)` : '';
   const header = `${severityBadge} [${finding.domain}] ${sanitizeMarkdown(finding.title)}${confidenceBadge}`;
   ```
2. In `formatGitHubSummary()`, add confidence to finding line:
   ```typescript
   const confidence = finding.trustScore != null ? ` — ${finding.trustScore}% confidence` : '';
   sections.push(`- **${sanitizeMarkdown(finding.title)}** at ${location}${confidence}`);
   ```
3. Run: `npx vitest run packages/core/tests/review/output/format-github.test.ts --reporter=verbose 2>&1 | tail -20`
4. Run: `npx harness validate`
5. Commit: `feat(review): display trust score in GitHub comments and summary`

### Task 7: Re-export from index and run full test suite

**Depends on:** Tasks 2-6 | **Files:** packages/core/src/review/index.ts

1. Add to `packages/core/src/review/index.ts`:
   ```typescript
   // Phase 5.5: Trust scoring
   export { computeTrustScores, getTrustLevel } from './trust-score';
   ```
2. Run full test suite: `npx vitest run packages/core/tests/review/ --reporter=verbose 2>&1 | tail -40`
3. Run: `npx harness validate`
4. Commit: `feat(review): re-export trust scoring from review index`
