# Plan: Roadmap Page Enhancement -- Phase 4: Polish & Edge Cases

**Date:** 2026-04-28 | **Spec:** docs/changes/roadmap-page-enhancement/proposal.md | **Tasks:** 5 | **Time:** ~20 min | **Integration Tier:** small

## Goal

Close the remaining edge-case gaps and clean up dead code left from the Gantt chart removal: show a disabled "Start Working" button with a tooltip when identity resolution fails, delete the dead `GanttChart.tsx` file, and update the README to reflect the current Roadmap page.

## Observable Truths (Acceptance Criteria)

1. When identity resolution fails (API returns 503), a workable feature row renders a disabled "Start Working" button with a tooltip reading "Could not resolve your identity" instead of hiding the button entirely.
2. When identity is still loading, the "Start Working" button is not shown (current behavior preserved).
3. `ClaimConfirmation` displays inline error text when the claim endpoint returns a non-OK response (e.g., "Feature already claimed") -- already verified by existing test `shows error message on failed claim`.
4. `ClaimConfirmation` displays "Network error" when `fetch` throws -- already verified by existing test `shows network error on fetch failure`.
5. Features with no `externalId` return `githubSynced: false` without attempting GitHub API calls -- already verified by existing test `returns githubSynced: false when no externalId`.
6. SSE cache is invalidated for both `roadmap` and `overview` keys after a successful claim -- already verified by existing test `invalidates roadmap and overview caches`.
7. `packages/dashboard/src/client/components/GanttChart.tsx` does not exist.
8. `packages/dashboard/README.md` does not reference `GanttChart` or "Gantt chart".
9. `packages/dashboard/README.md` Roadmap page description reflects the current feature-table-based design.
10. All 252+ dashboard tests pass, plus new tests added by this plan.

## Uncertainties

- [ASSUMPTION] The identity-failed tooltip UX should use a native `title` attribute on the disabled button rather than a custom tooltip component. The spec says "show tooltip" without specifying implementation. A native `title` attribute is the simplest approach and matches the existing `title` usage pattern in `FeatureRow.tsx` (lines 71, 77, 82). If a custom tooltip is preferred, Task 1 needs revision.
- [DEFERRABLE] DependencyGraph.tsx is still imported in Roadmap.tsx. The spec says to remove the Gantt chart but does not mention DependencyGraph. It serves a different purpose (blocker topology visualization) and is actively used. Keeping it.

## File Map

- MODIFY `packages/dashboard/src/client/components/roadmap/FeatureRow.tsx` (show disabled button with tooltip when identity is null)
- MODIFY `packages/dashboard/tests/client/components/roadmap/FeatureRow.test.tsx` (add tests for disabled button + tooltip)
- DELETE `packages/dashboard/src/client/components/GanttChart.tsx` (dead code)
- MODIFY `packages/dashboard/README.md` (update Roadmap description, remove GanttChart references)

## Tasks

### Task 1: Add disabled "Start Working" button with tooltip when identity is null (TDD)

**Depends on:** none | **Files:** `packages/dashboard/tests/client/components/roadmap/FeatureRow.test.tsx`, `packages/dashboard/src/client/components/roadmap/FeatureRow.tsx`

1. Open `packages/dashboard/tests/client/components/roadmap/FeatureRow.test.tsx` and add these tests at the end of the `describe('FeatureRow', ...)` block (before the closing `});`):

```typescript
  it('shows disabled "Start Working" with tooltip when identity is null and feature is workable', () => {
    render(
      <FeatureRow
        feature={makeFeature({ status: 'planned', assignee: null })}
        identity={null}
        onClaim={vi.fn()}
      />
    );
    const btn = screen.getByText('Start Working');
    expect(btn).toBeDefined();
    expect(btn.closest('button')!.disabled).toBe(true);
    expect(btn.closest('button')!.title).toBe('Could not resolve your identity');
  });

  it('does not call onClaim when disabled button is clicked', () => {
    const onClaim = vi.fn();
    render(
      <FeatureRow
        feature={makeFeature({ status: 'planned', assignee: null })}
        identity={null}
        onClaim={onClaim}
      />
    );
    fireEvent.click(screen.getByText('Start Working'));
    expect(onClaim).not.toHaveBeenCalled();
  });
```

2. Run tests -- observe 2 failures (button is currently hidden when identity is null):

```bash
cd "packages/dashboard" && npx vitest run tests/client/components/roadmap/FeatureRow.test.tsx
```

3. Open `packages/dashboard/src/client/components/roadmap/FeatureRow.tsx`. Replace the existing "Start Working" button block (lines 87-97):

**Old code (lines 87-97):**

```tsx
{
  workable && identity && (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClaim(feature);
      }}
      className="ml-auto rounded bg-primary-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-primary-400 border border-primary-500/20 hover:bg-primary-500 hover:text-white transition-all whitespace-nowrap"
    >
      Start Working
    </button>
  );
}
```

**New code:**

```tsx
{
  workable && (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (identity) onClaim(feature);
      }}
      disabled={!identity}
      title={identity ? undefined : 'Could not resolve your identity'}
      className={`ml-auto rounded px-2 py-1 text-[10px] font-bold uppercase tracking-widest border transition-all whitespace-nowrap ${
        identity
          ? 'bg-primary-500/10 text-primary-400 border-primary-500/20 hover:bg-primary-500 hover:text-white'
          : 'bg-gray-800 text-gray-600 border-gray-700 cursor-not-allowed'
      }`}
    >
      Start Working
    </button>
  );
}
```

4. Run tests -- observe all pass (including the new ones and the existing `hides "Start Working" when identity is null` test):

```bash
cd "packages/dashboard" && npx vitest run tests/client/components/roadmap/FeatureRow.test.tsx
```

**Note:** The existing test `hides "Start Working" when identity is null` (line 173) will now FAIL because the button is visible (disabled) instead of hidden. Update that test:

**Old test (lines 173-182):**

```typescript
  it('hides "Start Working" when identity is null', () => {
    render(
      <FeatureRow
        feature={makeFeature({ status: 'planned', assignee: null })}
        identity={null}
        onClaim={vi.fn()}
      />
    );
    expect(screen.queryByText('Start Working')).toBeNull();
  });
```

**New test:**

```typescript
  it('shows disabled "Start Working" when identity is null', () => {
    render(
      <FeatureRow
        feature={makeFeature({ status: 'planned', assignee: null })}
        identity={null}
        onClaim={vi.fn()}
      />
    );
    const btn = screen.getByText('Start Working');
    expect(btn.closest('button')!.disabled).toBe(true);
  });
```

5. Run the full FeatureRow test file again to confirm all pass:

```bash
cd "packages/dashboard" && npx vitest run tests/client/components/roadmap/FeatureRow.test.tsx
```

6. Commit: `feat(dashboard): show disabled Start Working button with tooltip when identity fails`

---

### Task 2: Verify claim failure handling (verification only, no code changes)

**Depends on:** none | **Files:** (none -- read-only verification)

1. Confirm `ClaimConfirmation.tsx` lines 56-60 handle non-OK responses by extracting `data.error` and setting error state.
2. Confirm `ClaimConfirmation.tsx` lines 61-63 catch network errors and set "Network error" text.
3. Confirm test `shows error message on failed claim` passes (mock returns `{ ok: false, json: () => ({ error: 'Feature already claimed' }) }` and verifies error text renders).
4. Confirm test `shows network error on fetch failure` passes (mock rejects with Error and verifies "Network error" text renders).
5. Confirm server-side `actions.ts` returns 409 with descriptive error for already-claimed features (`validateClaimable` function, line 333-340).
6. Run the relevant tests:

```bash
cd "packages/dashboard" && npx vitest run tests/client/components/roadmap/ClaimConfirmation.test.tsx tests/server/routes/actions-claim.test.ts
```

7. No commit needed -- verification only.

---

### Task 3: Verify no-externalId and SSE cache invalidation (verification only, no code changes)

**Depends on:** none | **Files:** (none -- read-only verification)

1. Confirm `actions.ts` lines 424-426: `if (externalId) { githubSynced = await assignGithubIssue(externalId, assignee) }` -- GitHub sync is skipped entirely when `externalId` is null. The response includes `githubSynced: false`.
2. Confirm `actions.ts` lines 416-417: `ctx.cache.invalidate('roadmap')` and `ctx.cache.invalidate('overview')` are called after successful claim write. This triggers SSE to re-gather and broadcast fresh data on the next poll cycle.
3. Confirm test `returns githubSynced: false when no externalId` passes.
4. Confirm test `invalidates roadmap and overview caches` passes.
5. Confirm test `returns githubSynced: false when GitHub API call fails` passes (graceful degradation when GitHub sync fails).
6. Run:

```bash
cd "packages/dashboard" && npx vitest run tests/server/routes/actions-claim.test.ts
```

7. No commit needed -- verification only.

---

### Task 4: Delete dead GanttChart.tsx file

**Depends on:** none | **Files:** `packages/dashboard/src/client/components/GanttChart.tsx`

1. Verify `GanttChart` is not imported anywhere in active code:

```bash
cd "packages/dashboard" && grep -r "GanttChart" src/ --include="*.ts" --include="*.tsx" | grep -v "GanttChart.tsx"
```

Expected: no output (zero imports).

2. Delete the dead file:

```bash
rm "packages/dashboard/src/client/components/GanttChart.tsx"
```

3. Run full test suite to confirm nothing breaks:

```bash
cd "packages/dashboard" && npx vitest run
```

4. Commit: `chore(dashboard): remove dead GanttChart.tsx after feature table replacement`

---

### Task 5: Update README.md to reflect current Roadmap page

**Depends on:** Task 4 | **Files:** `packages/dashboard/README.md`

1. Open `packages/dashboard/README.md`.

2. Update line 39 -- the Roadmap page description. Change:

**Old (line 39):**

```
| **Roadmap**      | `/roadmap`      | Milestone progress bars, Gantt chart timeline, dependency graph, and feature status filtering                    |
```

**New:**

```
| **Roadmap**      | `/roadmap`      | Stats bar, milestone-grouped feature table with claim workflow, dependency graph, and assignment history         |
```

3. Update line 52 -- the components directory description. Change:

**Old (line 52):**

```
      components/        Shared UI: KpiCard, GanttChart, BlastRadiusGraph, chat system
```

**New:**

```
      components/        Shared UI: KpiCard, BlastRadiusGraph, chat system, roadmap components
```

4. Run full test suite to confirm nothing breaks:

```bash
cd "packages/dashboard" && npx vitest run
```

5. Commit: `docs(dashboard): update README to reflect Roadmap page redesign and GanttChart removal`
