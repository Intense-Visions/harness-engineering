# Plan: Eligibility Gate + CI Mode

**Date:** 2026-03-21
**Spec:** docs/changes/unified-code-review-pipeline/proposal.md (Phase 7)
**Estimated tasks:** 5
**Estimated time:** 20 minutes

## Goal

The review pipeline skips closed, draft, trivial, and already-reviewed PRs in CI mode (`--ci`) while always running when invoked manually.

## Observable Truths (Acceptance Criteria)

1. When `--ci` is not set, the gate phase is skipped entirely and the pipeline proceeds (tested by unit test).
2. When `--ci` is set and the PR state is `closed` or `merged`, the gate returns `{ eligible: false, reason: 'PR is closed' }` (or `'PR is merged'`).
3. When `--ci` is set and the PR is a draft, the gate returns `{ eligible: false, reason: 'PR is a draft' }`.
4. When `--ci` is set and all changed files end in `.md`, the gate returns `{ eligible: false, reason: 'Trivial change: documentation only' }`.
5. When `--ci` is set and the exact commit range has been reviewed before (matching `headSha` in `priorReviews`), the gate returns `{ eligible: false, reason: 'Already reviewed at <sha>' }`.
6. When `--ci` is set and none of the skip conditions apply, the gate returns `{ eligible: true }`.
7. `cd packages/core && pnpm exec vitest run tests/review/eligibility-gate.test.ts` passes with 10+ tests.
8. `harness validate` passes.

## File Map

- CREATE `packages/core/src/review/eligibility-gate.ts`
- CREATE `packages/core/tests/review/eligibility-gate.test.ts`
- MODIFY `packages/core/src/review/types.ts` (add gate types)
- MODIFY `packages/core/src/review/index.ts` (add gate exports)

## Tasks

### Task 1: Define eligibility gate types

**Depends on:** none
**Files:** `packages/core/src/review/types.ts`

1. Open `packages/core/src/review/types.ts`.
2. Append the following types at the end of the file (after the `GitHubInlineComment` interface):

```typescript
// --- Phase 1: Eligibility Gate types ---

/**
 * Information about a prior review on this PR.
 */
export interface PriorReview {
  /** The head commit SHA that was reviewed */
  headSha: string;
  /** ISO timestamp of when the review was submitted */
  reviewedAt: string;
}

/**
 * PR metadata used by the eligibility gate.
 * This is a pure data object — the caller is responsible for fetching
 * this data from GitHub (via `gh` CLI, GitHub MCP, or mock).
 */
export interface PrMetadata {
  /** PR state: open, closed, or merged */
  state: 'open' | 'closed' | 'merged';
  /** Whether the PR is marked as draft */
  isDraft: boolean;
  /** List of changed file paths (project-relative) */
  changedFiles: string[];
  /** The HEAD commit SHA of the PR branch */
  headSha: string;
  /** Prior reviews submitted on this PR */
  priorReviews: PriorReview[];
}

/**
 * Result of the eligibility gate check.
 */
export interface EligibilityResult {
  /** Whether the PR is eligible for review */
  eligible: boolean;
  /** Human-readable reason when not eligible */
  reason?: string;
}
```

3. Run: `harness validate`
4. Commit: `feat(review): define eligibility gate types`

---

### Task 2: Write eligibility gate tests (RED)

**Depends on:** Task 1
**Files:** `packages/core/tests/review/eligibility-gate.test.ts`

1. Create `packages/core/tests/review/eligibility-gate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { checkEligibility } from '../../src/review/eligibility-gate';
import type { PrMetadata } from '../../src/review/types';

/** Helper: returns a valid open PR with no skip conditions */
function openPr(overrides: Partial<PrMetadata> = {}): PrMetadata {
  return {
    state: 'open',
    isDraft: false,
    changedFiles: ['src/index.ts', 'src/utils.ts'],
    headSha: 'abc1234',
    priorReviews: [],
    ...overrides,
  };
}

describe('checkEligibility', () => {
  // --- CI mode off: always eligible ---

  it('returns eligible when ciMode is false regardless of PR state', () => {
    const result = checkEligibility(openPr({ state: 'closed' }), false);
    expect(result).toEqual({ eligible: true });
  });

  // --- PR state checks ---

  it('returns ineligible when PR is closed', () => {
    const result = checkEligibility(openPr({ state: 'closed' }), true);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('PR is closed');
  });

  it('returns ineligible when PR is merged', () => {
    const result = checkEligibility(openPr({ state: 'merged' }), true);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('PR is merged');
  });

  // --- Draft check ---

  it('returns ineligible when PR is a draft', () => {
    const result = checkEligibility(openPr({ isDraft: true }), true);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('PR is a draft');
  });

  // --- Trivial change check ---

  it('returns ineligible when all changed files are .md', () => {
    const result = checkEligibility(
      openPr({ changedFiles: ['README.md', 'docs/guide.md', 'CHANGELOG.md'] }),
      true
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('Trivial change: documentation only');
  });

  it('returns eligible when some files are .md but not all', () => {
    const result = checkEligibility(openPr({ changedFiles: ['README.md', 'src/index.ts'] }), true);
    expect(result.eligible).toBe(true);
  });

  it('returns eligible when no files are changed (edge case)', () => {
    const result = checkEligibility(openPr({ changedFiles: [] }), true);
    expect(result.eligible).toBe(true);
  });

  // --- Already reviewed check ---

  it('returns ineligible when headSha matches a prior review', () => {
    const result = checkEligibility(
      openPr({
        headSha: 'abc1234',
        priorReviews: [{ headSha: 'abc1234', reviewedAt: '2026-03-21T00:00:00Z' }],
      }),
      true
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('Already reviewed at abc1234');
  });

  it('returns eligible when headSha does not match any prior review', () => {
    const result = checkEligibility(
      openPr({
        headSha: 'def5678',
        priorReviews: [{ headSha: 'abc1234', reviewedAt: '2026-03-21T00:00:00Z' }],
      }),
      true
    );
    expect(result.eligible).toBe(true);
  });

  // --- Happy path ---

  it('returns eligible for an open non-draft PR with code changes and no prior review', () => {
    const result = checkEligibility(openPr(), true);
    expect(result.eligible).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  // --- Priority: first failing check wins ---

  it('checks state before draft (closed draft returns closed reason)', () => {
    const result = checkEligibility(openPr({ state: 'closed', isDraft: true }), true);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('PR is closed');
  });
});
```

2. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/core && pnpm exec vitest run tests/review/eligibility-gate.test.ts`
3. Observe failure: `Cannot find module '../../src/review/eligibility-gate'`

---

### Task 3: Implement eligibility gate (GREEN)

**Depends on:** Task 2
**Files:** `packages/core/src/review/eligibility-gate.ts`

1. Create `packages/core/src/review/eligibility-gate.ts`:

```typescript
import type { PrMetadata, EligibilityResult } from './types';

/**
 * Phase 1: Eligibility Gate
 *
 * Pure function that checks whether a PR should be reviewed.
 * In CI mode (`ciMode: true`), checks PR state, draft status,
 * trivial changes, and prior reviews. When `ciMode` is false
 * (manual invocation), always returns eligible.
 *
 * @param pr - PR metadata (state, draft status, files, commit range, prior reviews)
 * @param ciMode - Whether the review was invoked with --ci flag
 * @returns Eligibility result with optional skip reason
 */
export function checkEligibility(pr: PrMetadata, ciMode: boolean): EligibilityResult {
  // Manual invocation always runs
  if (!ciMode) {
    return { eligible: true };
  }

  // Check 1: PR state
  if (pr.state === 'closed') {
    return { eligible: false, reason: 'PR is closed' };
  }
  if (pr.state === 'merged') {
    return { eligible: false, reason: 'PR is merged' };
  }

  // Check 2: Draft status
  if (pr.isDraft) {
    return { eligible: false, reason: 'PR is a draft' };
  }

  // Check 3: Trivial change (all files are .md)
  if (pr.changedFiles.length > 0 && pr.changedFiles.every((f) => f.endsWith('.md'))) {
    return { eligible: false, reason: 'Trivial change: documentation only' };
  }

  // Check 4: Already reviewed this exact commit
  const priorMatch = pr.priorReviews.find((r) => r.headSha === pr.headSha);
  if (priorMatch) {
    return { eligible: false, reason: `Already reviewed at ${priorMatch.headSha}` };
  }

  return { eligible: true };
}
```

2. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/core && pnpm exec vitest run tests/review/eligibility-gate.test.ts`
3. Observe: all 11 tests pass.
4. Run: `harness validate`
5. Commit: `feat(review): implement eligibility gate for CI mode`

---

### Task 4: Export gate from review module

**Depends on:** Task 3
**Files:** `packages/core/src/review/types.ts`, `packages/core/src/review/index.ts`

1. Open `packages/core/src/review/index.ts`.
2. Add the new type exports to the existing `export type { ... } from './types'` block — add `PriorReview`, `PrMetadata`, and `EligibilityResult` after `GitHubInlineComment`.
3. Add the function export at the end of the file:

```typescript
// Phase 1: Eligibility gate
export { checkEligibility } from './eligibility-gate';
```

4. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/core && pnpm exec vitest run tests/review/eligibility-gate.test.ts`
5. Observe: all tests still pass.
6. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/core && pnpm run build`
7. Run: `harness validate`
8. Commit: `feat(review): export eligibility gate from review module`

---

### Task 5: Verify full review test suite and build

**Depends on:** Task 4
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run the full review test suite: `cd /Users/cwarner/Projects/harness-engineering/packages/core && pnpm exec vitest run tests/review/`
2. Observe: all review tests pass (146 existing + 11 new = 157 expected).
3. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/core && pnpm run build`
4. Observe: build succeeds with no errors.
5. Run: `harness validate`
6. Run: `harness check-deps`
7. Observe: both pass.
