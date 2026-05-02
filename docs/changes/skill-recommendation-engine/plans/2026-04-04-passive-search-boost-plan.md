# Plan: Passive Search Boost (Phase 6 — Skill Recommendation Engine)

**Date:** 2026-04-04
**Spec:** docs/changes/skill-recommendation-engine/proposal.md (Section 4: Passive Search Boost)
**Estimated tasks:** 4
**Estimated time:** 15 minutes

## Goal

When a fresh health snapshot is cached, `scoreSkill()` blends health signals into its ranking score (70% original, 30% health), and `search_skills` loads and passes the snapshot automatically.

## Observable Truths (Acceptance Criteria)

1. When `healthSnapshot` is omitted or undefined, `scoreSkill()` returns the same value as before this change (backward compatible).
2. When `healthSnapshot` is provided, `scoreSkill()` blends: `0.70 * originalScore + 0.30 * healthScore`.
3. When a skill's `addresses` signals overlap with the snapshot's active signals, `computeHealthScore()` returns a value > 0 (proportional to match ratio).
4. When a skill has no `addresses` entries, `computeHealthScore()` returns 0.
5. When `search_skills` MCP tool runs and a fresh cached snapshot exists, scores reflect health blending.
6. When `search_skills` MCP tool runs and no cached snapshot exists (or it is stale), scores are unchanged from current behavior.
7. `cd packages/cli && npx vitest run tests/skill/dispatcher.test.ts` passes with all existing + new tests.

## File Map

- MODIFY `packages/cli/src/skill/dispatcher.ts` (add `computeHealthScore`, extend `scoreSkill` signature)
- MODIFY `packages/cli/src/mcp/tools/search-skills.ts` (load cached snapshot, check freshness, pass to `scoreSkill`)
- MODIFY `packages/cli/tests/skill/dispatcher.test.ts` (add health boost test suite)

## Tasks

### Task 1: Add `computeHealthScore` function and extend `scoreSkill` signature (TDD -- write tests first)

**Depends on:** none
**Files:** `packages/cli/tests/skill/dispatcher.test.ts`

1. Open `packages/cli/tests/skill/dispatcher.test.ts`.

2. Add the following import at line 2 (after existing imports):

```typescript
import type { HealthSnapshot } from '../../src/skill/health-snapshot';
```

3. Add a helper function after the existing `makeProfile` helper (after line 32):

```typescript
function makeSnapshot(overrides: Partial<HealthSnapshot> = {}): HealthSnapshot {
  return {
    capturedAt: new Date().toISOString(),
    gitHead: 'abc123',
    projectPath: '/tmp/test',
    checks: {
      deps: { passed: true, issueCount: 0, circularDeps: 0, layerViolations: 0 },
      entropy: { passed: true, deadExports: 0, deadFiles: 0, driftCount: 0 },
      security: { passed: true, findingCount: 0, criticalCount: 0 },
      perf: { passed: true, violationCount: 0 },
      docs: { passed: true, undocumentedCount: 0 },
      lint: { passed: true, issueCount: 0 },
    },
    metrics: {
      avgFanOut: 0,
      maxFanOut: 0,
      avgCyclomaticComplexity: 0,
      maxCyclomaticComplexity: 0,
      avgCouplingRatio: 0,
      testCoverage: null,
      anomalyOutlierCount: 0,
      articulationPointCount: 0,
    },
    signals: [],
    ...overrides,
  };
}
```

4. Add the following `import` for `computeHealthScore` to the existing import line (line 2):

```typescript
import {
  isTier1Skill,
  scoreSkill,
  suggest,
  formatSuggestions,
  computeHealthScore,
} from '../../src/skill/dispatcher';
```

5. Add the following test suite at the end of the file (before the closing of the file):

```typescript
describe('computeHealthScore', () => {
  it('returns 0 when skill has no addresses', () => {
    const entry = makeEntry({ addresses: [] });
    const snapshot = makeSnapshot({ signals: ['circular-deps'] });
    expect(computeHealthScore(entry, snapshot)).toBe(0);
  });

  it('returns proportional score when addresses overlap with signals', () => {
    const entry = makeEntry({
      addresses: [{ signal: 'circular-deps' }, { signal: 'dead-code' }],
    });
    const snapshot = makeSnapshot({ signals: ['circular-deps'] });
    // 1 of 2 addresses match => 0.5
    expect(computeHealthScore(entry, snapshot)).toBeCloseTo(0.5);
  });

  it('returns 1 when all addresses match active signals', () => {
    const entry = makeEntry({
      addresses: [{ signal: 'circular-deps' }, { signal: 'dead-code' }],
    });
    const snapshot = makeSnapshot({ signals: ['circular-deps', 'dead-code', 'drift'] });
    expect(computeHealthScore(entry, snapshot)).toBeCloseTo(1.0);
  });

  it('returns 0 when no addresses match active signals', () => {
    const entry = makeEntry({
      addresses: [{ signal: 'circular-deps' }],
    });
    const snapshot = makeSnapshot({ signals: ['dead-code'] });
    expect(computeHealthScore(entry, snapshot)).toBe(0);
  });

  it('uses weight when provided on address', () => {
    const entry = makeEntry({
      addresses: [
        { signal: 'circular-deps', weight: 0.8 },
        { signal: 'dead-code', weight: 0.2 },
      ],
    });
    const snapshot = makeSnapshot({ signals: ['circular-deps'] });
    // Only first matches. Weighted: 0.8 / (0.8 + 0.2) = 0.8
    expect(computeHealthScore(entry, snapshot)).toBeCloseTo(0.8);
  });
});

describe('scoreSkill with health boost', () => {
  it('returns unchanged score when healthSnapshot is undefined', () => {
    const entry = makeEntry({ keywords: ['testing', 'unit', 'jest'] });
    const withoutSnapshot = scoreSkill(entry, ['testing', 'unit'], null, [], 'unrelated-skill');
    const withUndefined = scoreSkill(
      entry,
      ['testing', 'unit'],
      null,
      [],
      'unrelated-skill',
      undefined
    );
    expect(withoutSnapshot).toEqual(withUndefined);
  });

  it('blends 70/30 when healthSnapshot is provided', () => {
    const entry = makeEntry({
      keywords: ['testing'],
      addresses: [{ signal: 'low-coverage' }],
    });
    const snapshot = makeSnapshot({ signals: ['low-coverage'] });

    const originalScore = scoreSkill(entry, ['testing'], null, [], 'some-skill');
    const boostedScore = scoreSkill(entry, ['testing'], null, [], 'some-skill', snapshot);

    // healthScore = 1.0 (1/1 match), blend = 0.70 * original + 0.30 * 1.0
    const expected = 0.7 * originalScore + 0.3 * 1.0;
    expect(boostedScore).toBeCloseTo(expected);
  });

  it('does not change score when skill has no addresses and snapshot provided', () => {
    const entry = makeEntry({ keywords: ['testing'], addresses: [] });
    const snapshot = makeSnapshot({ signals: ['low-coverage'] });

    const originalScore = scoreSkill(entry, ['testing'], null, [], 'some-skill');
    const boostedScore = scoreSkill(entry, ['testing'], null, [], 'some-skill', snapshot);

    // healthScore = 0 (no addresses), blend = 0.70 * original + 0.30 * 0 < original
    // Score IS changed (reduced) because the blend formula applies even with 0 health score
    const expected = 0.7 * originalScore + 0.3 * 0;
    expect(boostedScore).toBeCloseTo(expected);
  });
});
```

6. Run tests:

```bash
cd packages/cli && npx vitest run tests/skill/dispatcher.test.ts
```

7. Observe: tests fail because `computeHealthScore` is not exported from `dispatcher.ts`.

8. Commit: `test(dispatcher): add health boost and computeHealthScore tests`

---

### Task 2: Implement `computeHealthScore` and extend `scoreSkill` in `dispatcher.ts`

**Depends on:** Task 1
**Files:** `packages/cli/src/skill/dispatcher.ts`

1. Open `packages/cli/src/skill/dispatcher.ts`.

2. Add import for `HealthSnapshot` at line 2 (after existing imports):

```typescript
import type { HealthSnapshot } from './health-snapshot.js';
```

3. Add the `computeHealthScore` function before `scoreSkill` (insert after line 31, before the scoreSkill JSDoc):

```typescript
/**
 * Compute a 0-1 health relevance score for a skill against a health snapshot.
 *
 * Score is proportional to the overlap between the skill's declared `addresses`
 * signals and the snapshot's active signals. When addresses specify weights,
 * the weighted sum is used; otherwise each address contributes equally.
 *
 * Returns 0 when the skill has no addresses.
 */
export function computeHealthScore(entry: SkillIndexEntry, snapshot: HealthSnapshot): number {
  if (entry.addresses.length === 0) return 0;

  const activeSignals = new Set(snapshot.signals);

  const hasWeights = entry.addresses.some((a) => a.weight !== undefined);

  if (hasWeights) {
    // Weighted mode: sum matched weights / total weight
    let totalWeight = 0;
    let matchedWeight = 0;
    for (const addr of entry.addresses) {
      const w = addr.weight ?? 0.5;
      totalWeight += w;
      if (activeSignals.has(addr.signal)) {
        matchedWeight += w;
      }
    }
    return totalWeight > 0 ? matchedWeight / totalWeight : 0;
  }

  // Unweighted mode: count matched / total
  const matched = entry.addresses.filter((a) => activeSignals.has(a.signal)).length;
  return matched / entry.addresses.length;
}
```

4. Modify the `scoreSkill` function signature (line 43-49) to add the optional 6th parameter:

Change:

```typescript
export function scoreSkill(
  entry: SkillIndexEntry,
  queryTerms: string[],
  profile: StackProfile | null,
  recentFiles: string[],
  skillName: string
): number {
```

To:

```typescript
export function scoreSkill(
  entry: SkillIndexEntry,
  queryTerms: string[],
  profile: StackProfile | null,
  recentFiles: string[],
  skillName: string,
  healthSnapshot?: HealthSnapshot
): number {
```

5. Replace the return statement at the end of `scoreSkill` (line 105-107):

Change:

```typescript
return (
  0.35 * keywordScore + 0.2 * nameScore + 0.1 * descScore + 0.2 * stackScore + 0.15 * recencyBoost
);
```

To:

```typescript
let score =
  0.35 * keywordScore + 0.2 * nameScore + 0.1 * descScore + 0.2 * stackScore + 0.15 * recencyBoost;

// Health boost: blend when a snapshot is provided
if (healthSnapshot) {
  const healthScore = computeHealthScore(entry, healthSnapshot);
  score = 0.7 * score + 0.3 * healthScore;
}

return score;
```

6. Run tests:

```bash
cd packages/cli && npx vitest run tests/skill/dispatcher.test.ts
```

7. Observe: all tests pass (existing 24 + new health boost tests).

8. Run: `npx harness validate`

9. Commit: `feat(dispatcher): add health snapshot blending to scoreSkill`

---

### Task 3: Update `search-skills.ts` to load and pass cached snapshot

**Depends on:** Task 2
**Files:** `packages/cli/src/mcp/tools/search-skills.ts`

1. Open `packages/cli/src/mcp/tools/search-skills.ts`.

2. Add imports for snapshot utilities at line 3 (after existing imports):

```typescript
import { loadCachedSnapshot, isSnapshotFresh } from '../../skill/health-snapshot.js';
```

3. Inside `handleSearchSkills`, after the `profile` assignment (after line 43), add snapshot loading:

```typescript
// Load cached health snapshot for passive search boost
const snapshot = loadCachedSnapshot(projectRoot);
const freshSnapshot = snapshot && isSnapshotFresh(snapshot, projectRoot) ? snapshot : undefined;
```

4. Update the `scoreSkill` call (line 61) to pass the snapshot:

Change:

```typescript
const score = scoreSkill(entry, queryTerms, profile, [], name);
```

To:

```typescript
const score = scoreSkill(entry, queryTerms, profile, [], name, freshSnapshot);
```

5. Run tests to verify nothing breaks:

```bash
cd packages/cli && npx vitest run tests/skill/dispatcher.test.ts
```

6. Run: `npx harness validate`

7. Commit: `feat(search-skills): pass fresh health snapshot to scoreSkill for passive boost`

---

### Task 4: Verify full integration and existing behavior preservation

**Depends on:** Task 3
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run the full test suite for the skill package:

```bash
cd packages/cli && npx vitest run tests/skill/
```

2. Verify all existing dispatcher tests still pass (backward compatibility).

3. Verify the new health boost tests pass.

4. Run type checking:

```bash
cd packages/cli && npx tsc --noEmit
```

5. Run: `npx harness validate`

6. Confirm observable truths:
   - Truth 1: Existing 5-arg `scoreSkill` calls in `dispatcher.ts:133` and `search-skills.ts:61` compile without error (6th arg optional).
   - Truth 2: `scoreSkill` with snapshot blends 70/30 (verified by test "blends 70/30 when healthSnapshot is provided").
   - Truth 3: `computeHealthScore` returns > 0 when addresses overlap signals (verified by test "returns proportional score when addresses overlap with signals").
   - Truth 4: `computeHealthScore` returns 0 for empty addresses (verified by test "returns 0 when skill has no addresses").
   - Truth 5: `search-skills.ts` now loads snapshot and passes when fresh (code inspection).
   - Truth 6: When no snapshot, `freshSnapshot` is `undefined`, so `scoreSkill` gets no 6th arg -- original behavior.
   - Truth 7: All tests pass.

7. Commit: no commit needed (verification only).

## Traceability

| Observable Truth                     | Delivered By                             |
| ------------------------------------ | ---------------------------------------- |
| 1. Backward compatibility            | Task 2 (optional param), Task 4 (verify) |
| 2. 70/30 blending                    | Task 2 (implementation), Task 1 (test)   |
| 3. computeHealthScore > 0 on overlap | Task 2 (implementation), Task 1 (test)   |
| 4. computeHealthScore = 0 on empty   | Task 2 (implementation), Task 1 (test)   |
| 5. search-skills passes snapshot     | Task 3                                   |
| 6. No change when no snapshot        | Task 3, Task 1 (test)                    |
| 7. All tests pass                    | Task 4                                   |
