# Plan: Phase 5 Completion -- Session Learning Promotion and Autopilot Prune Suggestion

**Date:** 2026-03-28
**Spec:** docs/changes/efficient-context-pipeline/proposal.md (Section 5)
**Prior plan:** docs/plans/2026-03-26-phase5-learnings-pruning-plan.md (Tasks 1-5 complete)
**Estimated tasks:** 5
**Estimated time:** 20 minutes

## Goal

Complete Phase 5 by adding session learning promotion (generalizable session learnings promoted to global on session complete) and autopilot prune suggestion (autopilot suggests `harness learnings prune` when global learnings.md exceeds 30 entries).

## Prior Work (Already Implemented)

The 2026-03-26 plan delivered the core pruning pipeline. All tests pass:

- `parseDateFromEntry`, `analyzeLearningPatterns`, `archiveLearnings`, `pruneLearnings` in `packages/core/src/state/learnings.ts`
- `LearningPattern`, `PruneResult` types exported from `packages/core/src/state/index.ts`
- CLI `harness learnings prune` command at `packages/cli/src/commands/learnings/prune.ts`
- 13 core unit tests, 3 CLI integration tests -- all green

## Observable Truths (Acceptance Criteria)

1. When `promoteSessionLearnings(projectPath, sessionSlug)` is called on a session with 5 learnings (3 tagged `[outcome:gotcha]` or `[outcome:decision]`, 2 tagged `[outcome:success]`), the function returns `{ promoted: 3, skipped: 2 }` and the 3 generalizable entries appear in the global `learnings.md`.
2. When `promoteSessionLearnings` is called on a session with no learnings file, it returns `{ promoted: 0, skipped: 0 }` without error.
3. When `countLearningEntries(projectPath)` is called on a global learnings.md with 35 entries, it returns `35`.
4. When `countLearningEntries` is called and no learnings.md exists, it returns `0`.
5. `cd packages/core && npx vitest run tests/state/learnings-promotion.test.ts` passes with all tests green.
6. The autopilot DONE section in `agents/skills/claude-code/harness-autopilot/SKILL.md` includes a step to call `promoteSessionLearnings` and a step to check entry count and suggest pruning.
7. The autopilot DONE section in `agents/skills/gemini-cli/harness-autopilot/SKILL.md` includes the same promotion and prune suggestion steps.

## File Map

```
CREATE packages/core/tests/state/learnings-promotion.test.ts
MODIFY packages/core/src/state/learnings.ts                    (add promoteSessionLearnings, countLearningEntries)
MODIFY packages/core/src/state/index.ts                         (export new functions and PromoteResult type)
MODIFY packages/core/src/state/state-manager.ts                 (re-export new functions)
MODIFY agents/skills/claude-code/harness-autopilot/SKILL.md    (add promotion + prune suggestion to DONE)
MODIFY agents/skills/gemini-cli/harness-autopilot/SKILL.md     (add promotion + prune suggestion to DONE)
```

## Tasks

### Task 1: Add promoteSessionLearnings and countLearningEntries core functions (TDD)

**Depends on:** none
**Files:** `packages/core/tests/state/learnings-promotion.test.ts`, `packages/core/src/state/learnings.ts`

1. Create test file `packages/core/tests/state/learnings-promotion.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promoteSessionLearnings, countLearningEntries } from '../../src/state/learnings';

describe('promoteSessionLearnings', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-promote-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should promote generalizable learnings (gotcha, decision) to global', async () => {
    const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'test-session');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionDir, 'learnings.md'),
      [
        '# Learnings',
        '',
        '- **2026-03-25 [skill:harness-execution] [outcome:gotcha]:** Always check null before access',
        '',
        '- **2026-03-25 [skill:harness-execution] [outcome:decision]:** Use Result type over exceptions',
        '',
        '- **2026-03-25 [skill:harness-execution] [outcome:success]:** All 5 tasks completed',
        '',
        '- **2026-03-25 [skill:harness-execution] [outcome:gotcha]:** Pre-commit hook enforces baselines',
        '',
        '- **2026-03-25 [skill:harness-execution] [outcome:success]:** Test count grew from 50 to 65',
        '',
      ].join('\n')
    );

    const result = await promoteSessionLearnings(tmpDir, 'test-session');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.promoted).toBe(3);
      expect(result.value.skipped).toBe(2);
    }

    // Verify global learnings.md was created/updated
    const globalPath = path.join(tmpDir, '.harness', 'learnings.md');
    expect(fs.existsSync(globalPath)).toBe(true);
    const globalContent = fs.readFileSync(globalPath, 'utf-8');
    expect(globalContent).toContain('Always check null before access');
    expect(globalContent).toContain('Use Result type over exceptions');
    expect(globalContent).toContain('Pre-commit hook enforces baselines');
    expect(globalContent).not.toContain('All 5 tasks completed');
    expect(globalContent).not.toContain('Test count grew');
  });

  it('should return zero counts when session has no learnings file', async () => {
    const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'empty-session');
    fs.mkdirSync(sessionDir, { recursive: true });

    const result = await promoteSessionLearnings(tmpDir, 'empty-session');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.promoted).toBe(0);
      expect(result.value.skipped).toBe(0);
    }
  });

  it('should append to existing global learnings without overwriting', async () => {
    // Existing global
    const globalDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalDir, 'learnings.md'),
      '# Learnings\n\n- **2026-03-20 [skill:harness-planning]:** Existing global entry\n'
    );

    // Session learnings
    const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'test-session');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionDir, 'learnings.md'),
      '# Learnings\n\n- **2026-03-25 [skill:harness-execution] [outcome:gotcha]:** New gotcha\n'
    );

    const result = await promoteSessionLearnings(tmpDir, 'test-session');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.promoted).toBe(1);
    }

    const globalContent = fs.readFileSync(path.join(globalDir, 'learnings.md'), 'utf-8');
    expect(globalContent).toContain('Existing global entry');
    expect(globalContent).toContain('New gotcha');
  });

  it('should promote entries with outcome:observation tag', async () => {
    const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'test-session');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionDir, 'learnings.md'),
      '# Learnings\n\n- **2026-03-25 [skill:harness-autopilot] [outcome:observation]:** Patterns repeat across phases\n'
    );

    const result = await promoteSessionLearnings(tmpDir, 'test-session');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.promoted).toBe(1);
    }
  });

  it('should skip entries with no outcome tag (treat as task-specific)', async () => {
    const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'test-session');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionDir, 'learnings.md'),
      '# Learnings\n\n- **2026-03-25 [skill:harness-execution]:** Task 3 completed\n'
    );

    const result = await promoteSessionLearnings(tmpDir, 'test-session');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.promoted).toBe(0);
      expect(result.value.skipped).toBe(1);
    }
  });
});

describe('countLearningEntries', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-count-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should count all entries in learnings file', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });

    const entries = Array.from(
      { length: 35 },
      (_, i) => `- **2026-03-${String((i % 28) + 1).padStart(2, '0')} [skill:a]:** Learning ${i}`
    );
    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      `# Learnings\n\n${entries.join('\n\n')}\n`
    );

    const count = await countLearningEntries(tmpDir);
    expect(count).toBe(35);
  });

  it('should return 0 when no learnings file exists', async () => {
    const count = await countLearningEntries(tmpDir);
    expect(count).toBe(0);
  });

  it('should count heading-based entries too', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      [
        '# Learnings',
        '',
        '## 2026-03-14 — Task 3: Something',
        '- [learning]: Note one',
        '',
        '- **2026-03-15 [skill:a]:** Bullet entry',
        '',
      ].join('\n')
    );

    const count = await countLearningEntries(tmpDir);
    expect(count).toBe(2);
  });
});
```

2. Run test from the core package directory:

```bash
cd packages/core && npx vitest run tests/state/learnings-promotion.test.ts
```

3. Observe failure: `promoteSessionLearnings` and `countLearningEntries` do not exist.

4. Add to `packages/core/src/state/learnings.ts`, after the `pruneLearnings` function:

```typescript
export interface PromoteResult {
  promoted: number;
  skipped: number;
}

/**
 * Outcomes considered generalizable (applicable beyond the current session).
 * Entries with these tags get promoted to global learnings.
 * Task-completion entries ([outcome:success] with no broader insight,
 * or entries with no outcome tag) stay in the session.
 */
const PROMOTABLE_OUTCOMES = ['gotcha', 'decision', 'observation'];

/**
 * Check if a learning entry is generalizable (should be promoted to global).
 * Generalizable = has an outcome tag that indicates a reusable insight.
 */
function isGeneralizable(entry: string): boolean {
  for (const outcome of PROMOTABLE_OUTCOMES) {
    if (entry.includes(`[outcome:${outcome}]`)) return true;
  }
  return false;
}

/**
 * Promote generalizable session learnings to global learnings.md.
 *
 * Generalizable entries are those tagged with [outcome:gotcha],
 * [outcome:decision], or [outcome:observation]. These represent
 * reusable insights that apply beyond the current session.
 *
 * Task-specific entries (e.g., [outcome:success] completion summaries,
 * or entries without outcome tags) stay in the session directory.
 */
export async function promoteSessionLearnings(
  projectPath: string,
  sessionSlug: string,
  stream?: string
): Promise<Result<PromoteResult, Error>> {
  try {
    // Load session learnings
    const sessionResult = await loadRelevantLearnings(projectPath, undefined, stream, sessionSlug);
    if (!sessionResult.ok) return sessionResult;
    const sessionEntries = sessionResult.value;

    if (sessionEntries.length === 0) {
      return Ok({ promoted: 0, skipped: 0 });
    }

    const toPromote: string[] = [];
    let skipped = 0;

    for (const entry of sessionEntries) {
      if (isGeneralizable(entry)) {
        toPromote.push(entry);
      } else {
        skipped++;
      }
    }

    if (toPromote.length === 0) {
      return Ok({ promoted: 0, skipped });
    }

    // Append promoted entries to global learnings
    const dirResult = await getStateDir(projectPath, stream);
    if (!dirResult.ok) return dirResult;
    const stateDir = dirResult.value;
    const globalPath = path.join(stateDir, LEARNINGS_FILE);

    const promotedContent = toPromote.join('\n\n') + '\n';

    if (!fs.existsSync(globalPath)) {
      fs.writeFileSync(globalPath, `# Learnings\n\n${promotedContent}`);
    } else {
      fs.appendFileSync(globalPath, '\n' + promotedContent);
    }

    // Invalidate cache
    learningsCacheMap.delete(globalPath);

    return Ok({ promoted: toPromote.length, skipped });
  } catch (error) {
    return Err(
      new Error(
        `Failed to promote session learnings: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

/**
 * Count the number of learning entries in the global learnings.md file.
 * Useful for checking if pruning should be suggested (threshold: 30).
 */
export async function countLearningEntries(projectPath: string, stream?: string): Promise<number> {
  const loadResult = await loadRelevantLearnings(projectPath, undefined, stream);
  if (!loadResult.ok) return 0;
  return loadResult.value.length;
}
```

5. Run test:

```bash
cd packages/core && npx vitest run tests/state/learnings-promotion.test.ts
```

6. Observe: all tests pass.
7. Commit: `feat(core): add promoteSessionLearnings and countLearningEntries`

---

### Task 2: Export new functions from core barrel files

**Depends on:** Task 1
**Files:** `packages/core/src/state/index.ts`, `packages/core/src/state/state-manager.ts`

1. Modify `packages/core/src/state/index.ts` -- in the learnings export block, add `promoteSessionLearnings` and `countLearningEntries` to the value export, and `PromoteResult` to the type export:

   Change:

   ```typescript
   export {
     clearLearningsCache,
     appendLearning,
     loadRelevantLearnings,
     loadBudgetedLearnings,
     parseDateFromEntry,
     analyzeLearningPatterns,
     archiveLearnings,
     pruneLearnings,
   } from './learnings';
   export type { BudgetedLearningsOptions, LearningPattern, PruneResult } from './learnings';
   ```

   To:

   ```typescript
   export {
     clearLearningsCache,
     appendLearning,
     loadRelevantLearnings,
     loadBudgetedLearnings,
     parseDateFromEntry,
     analyzeLearningPatterns,
     archiveLearnings,
     pruneLearnings,
     promoteSessionLearnings,
     countLearningEntries,
   } from './learnings';
   export type {
     BudgetedLearningsOptions,
     LearningPattern,
     PruneResult,
     PromoteResult,
   } from './learnings';
   ```

2. Modify `packages/core/src/state/state-manager.ts` -- add to the learnings re-export:

   Change:

   ```typescript
   export {
     clearLearningsCache,
     appendLearning,
     loadRelevantLearnings,
     loadBudgetedLearnings,
     parseDateFromEntry,
     analyzeLearningPatterns,
     archiveLearnings,
     pruneLearnings,
   } from './learnings';
   ```

   To:

   ```typescript
   export {
     clearLearningsCache,
     appendLearning,
     loadRelevantLearnings,
     loadBudgetedLearnings,
     parseDateFromEntry,
     analyzeLearningPatterns,
     archiveLearnings,
     pruneLearnings,
     promoteSessionLearnings,
     countLearningEntries,
   } from './learnings';
   ```

3. Run tests to verify no regressions:

```bash
cd packages/core && npx vitest run tests/state/learnings-promotion.test.ts && npx vitest run tests/state/learnings-pruning.test.ts
```

4. Observe: all tests pass.
5. Commit: `feat(core): export promoteSessionLearnings and countLearningEntries from barrel files`

---

### Task 3: Update claude-code autopilot SKILL.md DONE section

**Depends on:** Task 1 (for function signatures)
**Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

1. Modify `agents/skills/claude-code/harness-autopilot/SKILL.md` -- in the `### DONE -- Final Summary` section, add two new steps between the existing step 4 (Append learnings) and step 5 (Update roadmap to done):

   After the existing step 4 block that ends with `- [skill:harness-autopilot] [outcome:observation] {any notable patterns from the run}`, add:

   ```markdown
   5. **Promote session learnings to global.** Call `promoteSessionLearnings(projectPath, sessionSlug)` to move generalizable session learnings (tagged `[outcome:gotcha]`, `[outcome:decision]`, `[outcome:observation]`) to the global `learnings.md`. Report: "Promoted {N} learnings to global, {M} session-specific entries kept in session."

   6. **Check if pruning is needed.** Call `countLearningEntries(projectPath)`. If the count exceeds 30, suggest: "Global learnings.md has {count} entries (threshold: 30). Run `harness learnings prune` to analyze patterns and archive old entries."
   ```

   Renumber existing steps 5-7 to 7-9.

2. Also update the Harness Integration section's Learnings bullet to mention promotion:

   Change:

   ```
   - **Learnings** -- `.harness/learnings.md` (global) is appended by both delegated skills and autopilot itself.
   ```

   To:

   ```
   - **Learnings** -- `.harness/learnings.md` (global) is appended by both delegated skills and autopilot itself. On DONE, session learnings with generalizable outcomes are promoted to global via `promoteSessionLearnings`. If global count exceeds 30, autopilot suggests running `harness learnings prune`.
   ```

3. Verify the SKILL.md renders correctly (no broken markdown).
4. Commit: `feat(autopilot): add session learning promotion and prune suggestion to claude-code DONE state`

---

### Task 4: Update gemini-cli autopilot SKILL.md DONE section

**Depends on:** Task 3 (for consistency)
**Files:** `agents/skills/gemini-cli/harness-autopilot/SKILL.md`

1. Apply the same changes as Task 3 to `agents/skills/gemini-cli/harness-autopilot/SKILL.md`:
   - Add steps 5 and 6 (promote session learnings, check if pruning needed) after step 4 in DONE section.
   - Renumber existing steps 5-7 to 7-9.
   - Update the Harness Integration Learnings bullet.

2. Verify the SKILL.md renders correctly.
3. Commit: `feat(autopilot): add session learning promotion and prune suggestion to gemini-cli DONE state`

---

### Task 5: Verify all tests pass end-to-end

**Depends on:** Tasks 1-4
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run all learnings-related tests:

```bash
cd packages/core && npx vitest run tests/state/learnings-promotion.test.ts && npx vitest run tests/state/learnings-pruning.test.ts && npx vitest run tests/state/learnings.test.ts
```

2. Run CLI prune tests:

```bash
cd packages/cli && npx vitest run tests/commands/learnings-prune.test.ts
```

3. Verify all tests pass with zero failures.
4. Commit: no commit needed (verification only).

---

## Traceability

| Observable Truth                                                     | Delivered By                   |
| -------------------------------------------------------------------- | ------------------------------ |
| 1. promoteSessionLearnings promotes 3 generalizable, skips 2 success | Task 1 (test + implementation) |
| 2. promoteSessionLearnings handles missing session learnings         | Task 1 (test + implementation) |
| 3. countLearningEntries returns correct count for 35 entries         | Task 1 (test + implementation) |
| 4. countLearningEntries returns 0 for missing file                   | Task 1 (test + implementation) |
| 5. learnings-promotion.test.ts passes                                | Task 1, Task 5                 |
| 6. claude-code autopilot DONE includes promotion + prune suggestion  | Task 3                         |
| 7. gemini-cli autopilot DONE includes promotion + prune suggestion   | Task 4                         |

## Change Specifications

### Changes to Learnings Module (`packages/core/src/state/learnings.ts`)

- [ADDED] `promoteSessionLearnings(projectPath, sessionSlug, stream?)` -- Reads session learnings, promotes entries with `[outcome:gotcha]`, `[outcome:decision]`, or `[outcome:observation]` to global learnings.md. Returns `PromoteResult { promoted, skipped }`.
- [ADDED] `countLearningEntries(projectPath, stream?)` -- Returns count of entries in global learnings.md. Reuses existing `loadRelevantLearnings` parser.
- [ADDED] `PromoteResult` interface type.
- [ADDED] `isGeneralizable(entry)` internal helper -- checks for promotable outcome tags.

### Changes to Autopilot DONE State

- [ADDED] Step 5: Call `promoteSessionLearnings` to move generalizable learnings to global.
- [ADDED] Step 6: Call `countLearningEntries` and suggest `harness learnings prune` when count exceeds 30.
- [MODIFIED] Harness Integration Learnings bullet updated to mention promotion and prune suggestion.
