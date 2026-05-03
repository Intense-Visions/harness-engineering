# Plan: Phase 5 -- Learnings Pruning with Feedback Loop

**Date:** 2026-03-26
**Spec:** docs/changes/efficient-context-pipeline/proposal.md (Section 5)
**Estimated tasks:** 5
**Estimated time:** 20 minutes

## Goal

Users can run `harness learnings prune` to analyze global learnings for recurring patterns, see improvement proposals printed to stdout, and archive old entries while keeping the 20 most recent.

## Observable Truths (Acceptance Criteria)

1. When `harness learnings prune --path <dir>` is run against a learnings.md with 35 entries (5 sharing `[skill:harness-execution]`), the CLI outputs a proposal line mentioning "harness-execution" with count 5.
2. When `harness learnings prune --path <dir>` completes, `.harness/learnings-archive/YYYY-MM.md` exists containing the archived entries with their original tags and timestamps.
3. When `harness learnings prune --path <dir>` completes, the remaining `learnings.md` contains exactly the 20 most recent entries (preserving the `# Learnings` header).
4. When learnings.md has fewer than 20 entries all newer than 14 days, `harness learnings prune` reports "Nothing to prune" and makes no file changes.
5. `npx vitest run packages/core/tests/state/learnings-pruning.test.ts` passes with all tests green.
6. `npx vitest run packages/cli/tests/commands/learnings-prune.test.ts` passes with all tests green.
7. `harness validate` passes after all tasks complete.

## File Map

```
MODIFY packages/core/src/state/learnings.ts          (export parseDateFromEntry; add analyzeLearningPatterns, archiveLearnings, pruneLearnings)
MODIFY packages/core/src/state/index.ts               (add new exports)
MODIFY packages/core/src/state/state-manager.ts       (add new exports for backward compat)
CREATE packages/core/tests/state/learnings-pruning.test.ts
CREATE packages/cli/src/commands/learnings/prune.ts
CREATE packages/cli/src/commands/learnings/index.ts
MODIFY packages/cli/src/index.ts                       (register learnings command)
CREATE packages/cli/tests/commands/learnings-prune.test.ts
```

## Tasks

### Task 1: Export parseDateFromEntry and add pattern analysis function (TDD)

**Depends on:** none
**Files:** packages/core/src/state/learnings.ts, packages/core/tests/state/learnings-pruning.test.ts

1. Create test file `packages/core/tests/state/learnings-pruning.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseDateFromEntry, analyzeLearningPatterns } from '../../src/state/learnings';

describe('parseDateFromEntry', () => {
  it('should parse date from tagged bullet entry', () => {
    const entry = '- **2026-03-10 [skill:harness-tdd] [outcome:success]:** Some learning';
    expect(parseDateFromEntry(entry)).toBe('2026-03-10');
  });

  it('should parse date from heading-based entry', () => {
    const entry = '## 2026-03-14 — Task 3: Notification Expiry';
    expect(parseDateFromEntry(entry)).toBe('2026-03-14');
  });

  it('should return null for entry without date', () => {
    expect(parseDateFromEntry('- some text without a date')).toBeNull();
  });
});

describe('analyzeLearningPatterns', () => {
  it('should detect skill patterns with 3+ occurrences', () => {
    const entries = [
      '- **2026-03-01 [skill:harness-execution]:** Learning A',
      '- **2026-03-02 [skill:harness-execution]:** Learning B',
      '- **2026-03-03 [skill:harness-execution]:** Learning C',
      '- **2026-03-04 [skill:harness-tdd]:** Learning D',
      '- **2026-03-05 [skill:harness-tdd]:** Learning E',
    ];
    const patterns = analyzeLearningPatterns(entries);
    expect(patterns.length).toBe(1);
    expect(patterns[0].tag).toBe('skill:harness-execution');
    expect(patterns[0].count).toBe(3);
    expect(patterns[0].entries.length).toBe(3);
  });

  it('should return empty array when no patterns reach threshold', () => {
    const entries = [
      '- **2026-03-01 [skill:a]:** Learning A',
      '- **2026-03-02 [skill:b]:** Learning B',
      '- **2026-03-03 [skill:c]:** Learning C',
    ];
    const patterns = analyzeLearningPatterns(entries);
    expect(patterns.length).toBe(0);
  });

  it('should detect multiple patterns when present', () => {
    const entries = [
      '- **2026-03-01 [skill:harness-execution]:** L1',
      '- **2026-03-02 [skill:harness-execution]:** L2',
      '- **2026-03-03 [skill:harness-execution]:** L3',
      '- **2026-03-04 [skill:harness-planning]:** L4',
      '- **2026-03-05 [skill:harness-planning]:** L5',
      '- **2026-03-06 [skill:harness-planning]:** L6',
    ];
    const patterns = analyzeLearningPatterns(entries);
    expect(patterns.length).toBe(2);
  });

  it('should also detect outcome tag patterns', () => {
    const entries = [
      '- **2026-03-01 [skill:a] [outcome:gotcha]:** L1',
      '- **2026-03-02 [skill:b] [outcome:gotcha]:** L2',
      '- **2026-03-03 [skill:c] [outcome:gotcha]:** L3',
    ];
    const patterns = analyzeLearningPatterns(entries);
    expect(patterns.some((p) => p.tag === 'outcome:gotcha')).toBe(true);
  });

  it('should handle entries without tags gracefully', () => {
    const entries = [
      '- **2026-03-01:** Untagged learning',
      '- **2026-03-02:** Another untagged',
      '- **2026-03-03:** Third untagged',
    ];
    const patterns = analyzeLearningPatterns(entries);
    expect(patterns.length).toBe(0);
  });
});
```

2. Run test: `cd packages/core && npx vitest run tests/state/learnings-pruning.test.ts`
3. Observe failure: `parseDateFromEntry` is not exported, `analyzeLearningPatterns` does not exist.

4. Modify `packages/core/src/state/learnings.ts`:

   a. Change `parseDateFromEntry` from a plain function to an exported function (add `export` keyword to line 91).

   b. Add `analyzeLearningPatterns` function after `parseDateFromEntry`:

```typescript
export interface LearningPattern {
  tag: string;
  count: number;
  entries: string[];
}

/**
 * Analyze learning entries for recurring patterns.
 * Groups entries by [skill:X] and [outcome:Y] tags.
 * Returns patterns where 3+ entries share the same tag.
 */
export function analyzeLearningPatterns(entries: string[]): LearningPattern[] {
  const tagGroups = new Map<string, string[]>();

  for (const entry of entries) {
    const tagMatches = entry.matchAll(/\[(skill:[^\]]+)\]|\[(outcome:[^\]]+)\]/g);
    for (const match of tagMatches) {
      const tag = match[1] ?? match[2];
      if (tag) {
        const group = tagGroups.get(tag) ?? [];
        group.push(entry);
        tagGroups.set(tag, group);
      }
    }
  }

  const patterns: LearningPattern[] = [];
  for (const [tag, groupEntries] of tagGroups) {
    if (groupEntries.length >= 3) {
      patterns.push({ tag, count: groupEntries.length, entries: groupEntries });
    }
  }

  return patterns.sort((a, b) => b.count - a.count);
}
```

5. Run test: `cd packages/core && npx vitest run tests/state/learnings-pruning.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(core): export parseDateFromEntry and add analyzeLearningPatterns for learnings pruning`

---

### Task 2: Add archiveLearnings and pruneLearnings core functions (TDD)

**Depends on:** Task 1
**Files:** packages/core/src/state/learnings.ts, packages/core/tests/state/learnings-pruning.test.ts

1. Append to test file `packages/core/tests/state/learnings-pruning.test.ts`:

```typescript
import { archiveLearnings, pruneLearnings } from '../../src/state/learnings';
import { appendLearning } from '../../src/state/state-manager';

describe('archiveLearnings', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-prune-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should move entries to archive file with YYYY-MM naming', async () => {
    const entriesToArchive = [
      '- **2026-02-01 [skill:a]:** Old learning one',
      '- **2026-02-15 [skill:b]:** Old learning two',
    ];

    const result = await archiveLearnings(tmpDir, entriesToArchive);
    expect(result.ok).toBe(true);

    // Check archive file exists
    const archiveDir = path.join(tmpDir, '.harness', 'learnings-archive');
    const files = fs.readdirSync(archiveDir);
    expect(files.length).toBe(1);

    const archiveContent = fs.readFileSync(path.join(archiveDir, files[0]), 'utf-8');
    expect(archiveContent).toContain('Old learning one');
    expect(archiveContent).toContain('Old learning two');
    expect(archiveContent).toContain('[skill:a]');
  });

  it('should append to existing archive file for same month', async () => {
    const harnessDir = path.join(tmpDir, '.harness', 'learnings-archive');
    fs.mkdirSync(harnessDir, { recursive: true });
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const archivePath = path.join(harnessDir, `${yearMonth}.md`);
    fs.writeFileSync(archivePath, '# Learnings Archive\n\n- **2026-03-01 [skill:x]:** Existing\n');

    const result = await archiveLearnings(tmpDir, ['- **2026-03-02 [skill:y]:** New entry']);
    expect(result.ok).toBe(true);

    const content = fs.readFileSync(archivePath, 'utf-8');
    expect(content).toContain('Existing');
    expect(content).toContain('New entry');
  });
});

describe('pruneLearnings', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-prune-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should keep 20 most recent entries and archive the rest', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });

    // Create 35 entries with different dates
    const entries = Array.from({ length: 35 }, (_, i) => {
      const day = String((i % 28) + 1).padStart(2, '0');
      const month = i < 28 ? '01' : '02';
      return `- **2026-${month}-${day} [skill:harness-execution]:** Learning ${i}`;
    });

    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      `# Learnings\n\n${entries.join('\n\n')}\n`
    );

    const result = await pruneLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kept).toBe(20);
      expect(result.value.archived).toBe(15);
      expect(result.value.patterns.length).toBeGreaterThan(0);
    }

    // Verify remaining file has 20 entries
    const remaining = fs.readFileSync(path.join(harnessDir, 'learnings.md'), 'utf-8');
    const remainingEntries = remaining.match(/^- \*\*/gm);
    expect(remainingEntries?.length).toBe(20);

    // Verify archive exists
    const archiveDir = path.join(harnessDir, 'learnings-archive');
    expect(fs.existsSync(archiveDir)).toBe(true);
  });

  it('should return nothing-to-prune when under threshold', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });

    const today = new Date().toISOString().split('T')[0];
    const entries = Array.from({ length: 15 }, (_, i) => `- **${today} [skill:a]:** Learning ${i}`);

    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      `# Learnings\n\n${entries.join('\n\n')}\n`
    );

    const result = await pruneLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kept).toBe(15);
      expect(result.value.archived).toBe(0);
      expect(result.value.patterns).toEqual([]);
    }
  });

  it('should handle missing learnings file gracefully', async () => {
    const result = await pruneLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kept).toBe(0);
      expect(result.value.archived).toBe(0);
    }
  });
});
```

2. Update the imports at the top of the test file to include `archiveLearnings` and `pruneLearnings` (merge with existing import from `../../src/state/learnings`).

3. Run test: `cd packages/core && npx vitest run tests/state/learnings-pruning.test.ts`
4. Observe failure: `archiveLearnings` and `pruneLearnings` do not exist.

5. Add to `packages/core/src/state/learnings.ts` (after `analyzeLearningPatterns`):

```typescript
export interface PruneResult {
  kept: number;
  archived: number;
  patterns: LearningPattern[];
}

/**
 * Archive learning entries to .harness/learnings-archive/{YYYY-MM}.md.
 * Appends to existing archive file if one exists for the current month.
 */
export async function archiveLearnings(
  projectPath: string,
  entries: string[],
  stream?: string
): Promise<Result<void, Error>> {
  try {
    const dirResult = await getStateDir(projectPath, stream);
    if (!dirResult.ok) return dirResult;
    const stateDir = dirResult.value;

    const archiveDir = path.join(stateDir, 'learnings-archive');
    fs.mkdirSync(archiveDir, { recursive: true });

    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const archivePath = path.join(archiveDir, `${yearMonth}.md`);

    const archiveContent = entries.join('\n\n') + '\n';

    if (fs.existsSync(archivePath)) {
      fs.appendFileSync(archivePath, '\n' + archiveContent);
    } else {
      fs.writeFileSync(archivePath, `# Learnings Archive\n\n${archiveContent}`);
    }

    return Ok(undefined);
  } catch (error) {
    return Err(
      new Error(
        `Failed to archive learnings: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

/**
 * Prune global learnings: analyze patterns, archive old entries, keep 20 most recent.
 *
 * Pruning triggers when:
 * - Entry count exceeds 30, OR
 * - Entries older than 14 days exist AND total count exceeds 20
 *
 * Returns the prune result with pattern analysis and counts.
 */
export async function pruneLearnings(
  projectPath: string,
  stream?: string
): Promise<Result<PruneResult, Error>> {
  try {
    const dirResult = await getStateDir(projectPath, stream);
    if (!dirResult.ok) return dirResult;
    const stateDir = dirResult.value;
    const learningsPath = path.join(stateDir, LEARNINGS_FILE);

    if (!fs.existsSync(learningsPath)) {
      return Ok({ kept: 0, archived: 0, patterns: [] });
    }

    // Load all entries using existing parser
    const loadResult = await loadRelevantLearnings(projectPath, undefined, stream);
    if (!loadResult.ok) return loadResult;
    const allEntries = loadResult.value;

    if (allEntries.length <= 20) {
      // Check if any are older than 14 days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 14);
      const cutoffStr = cutoffDate.toISOString().split('T')[0];

      const hasOld = allEntries.some((entry) => {
        const date = parseDateFromEntry(entry);
        return date !== null && date < cutoffStr;
      });

      if (!hasOld) {
        return Ok({ kept: allEntries.length, archived: 0, patterns: [] });
      }
    }

    // Sort by date descending (newest first)
    const sorted = [...allEntries].sort((a, b) => {
      const dateA = parseDateFromEntry(a) ?? '0000-00-00';
      const dateB = parseDateFromEntry(b) ?? '0000-00-00';
      return dateB.localeCompare(dateA);
    });

    // Keep 20 most recent, archive the rest
    const toKeep = sorted.slice(0, 20);
    const toArchive = sorted.slice(20);

    // Analyze patterns in ALL entries (before pruning) for proposals
    const patterns = analyzeLearningPatterns(allEntries);

    // Archive old entries
    if (toArchive.length > 0) {
      const archiveResult = await archiveLearnings(projectPath, toArchive, stream);
      if (!archiveResult.ok) return archiveResult;
    }

    // Rewrite learnings.md with only kept entries
    const newContent = '# Learnings\n\n' + toKeep.join('\n\n') + '\n';
    fs.writeFileSync(learningsPath, newContent);

    // Invalidate cache
    learningsCacheMap.delete(learningsPath);

    return Ok({
      kept: toKeep.length,
      archived: toArchive.length,
      patterns,
    });
  } catch (error) {
    return Err(
      new Error(
        `Failed to prune learnings: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}
```

6. Run test: `cd packages/core && npx vitest run tests/state/learnings-pruning.test.ts`
7. Observe: all tests pass.
8. Run: `harness validate`
9. Commit: `feat(core): add archiveLearnings and pruneLearnings for learnings pruning pipeline`

---

### Task 3: Export new functions from core barrel files

**Depends on:** Task 2
**Files:** packages/core/src/state/index.ts, packages/core/src/state/state-manager.ts

1. Modify `packages/core/src/state/index.ts` -- add to the learnings export block:

   Change the existing learnings export block from:

   ```typescript
   export {
     clearLearningsCache,
     appendLearning,
     loadRelevantLearnings,
     loadBudgetedLearnings,
   } from './learnings';
   export type { BudgetedLearningsOptions } from './learnings';
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
   } from './learnings';
   export type { BudgetedLearningsOptions, LearningPattern, PruneResult } from './learnings';
   ```

2. Modify `packages/core/src/state/state-manager.ts` -- add to the learnings re-export:

   Change from:

   ```typescript
   export {
     clearLearningsCache,
     appendLearning,
     loadRelevantLearnings,
     loadBudgetedLearnings,
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
   } from './learnings';
   ```

3. Run: `cd packages/core && npx vitest run tests/state/learnings-pruning.test.ts`
4. Observe: all tests still pass.
5. Run: `harness validate` and `harness check-deps`
6. Commit: `feat(core): export learnings pruning functions from barrel files`

---

### Task 4: Create CLI `harness learnings prune` command

**Depends on:** Task 3
**Files:** packages/cli/src/commands/learnings/prune.ts, packages/cli/src/commands/learnings/index.ts, packages/cli/src/index.ts

1. Create `packages/cli/src/commands/learnings/index.ts`:

```typescript
import { Command } from 'commander';
import { createPruneCommand } from './prune';

export function createLearningsCommand(): Command {
  const command = new Command('learnings').description('Learnings management commands');
  command.addCommand(createPruneCommand());
  return command;
}
```

2. Create `packages/cli/src/commands/learnings/prune.ts`:

```typescript
import { Command } from 'commander';
import * as path from 'path';
import { pruneLearnings } from '@harness-engineering/core';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';

export function createPruneCommand(): Command {
  return new Command('prune')
    .description(
      'Analyze global learnings for patterns, present improvement proposals, and archive old entries'
    )
    .option('--path <path>', 'Project root path', '.')
    .option('--stream <name>', 'Target a specific stream')
    .action(async (opts) => {
      const projectPath = path.resolve(opts.path);

      const result = await pruneLearnings(projectPath, opts.stream);

      if (!result.ok) {
        logger.error(result.error.message);
        process.exit(ExitCode.ERROR);
        return;
      }

      const { kept, archived, patterns } = result.value;

      if (archived === 0 && patterns.length === 0) {
        logger.info(`Nothing to prune. ${kept} learnings in file, all within retention window.`);
        process.exit(ExitCode.SUCCESS);
        return;
      }

      // Phase A: Present pattern analysis
      if (patterns.length > 0) {
        console.log('\n--- Improvement Proposals ---\n');
        for (const pattern of patterns) {
          console.log(`  [${pattern.tag}] ${pattern.count} learnings with this theme.`);
          console.log(
            `  Proposal: These learnings suggest a recurring pattern in "${pattern.tag}".`
          );
          console.log(
            `  To add to roadmap: harness mcp manage_roadmap --action add --feature "<improvement>" --status planned\n`
          );
        }
        console.log(
          'Review the proposals above. If any warrant a process improvement, add them to the roadmap manually or via manage_roadmap.\n'
        );
      }

      // Phase B: Report archive results
      if (archived > 0) {
        logger.success(`Pruned ${archived} entries. ${kept} most recent entries retained.`);
        logger.info('Archived entries written to .harness/learnings-archive/');
      } else {
        logger.info(`No entries archived. ${kept} entries retained.`);
      }

      process.exit(ExitCode.SUCCESS);
    });
}
```

3. Modify `packages/cli/src/index.ts` -- add import and registration:

   Add import after the existing state import (line ~27):

   ```typescript
   import { createLearningsCommand } from './commands/learnings';
   ```

   Add command registration after `createStateCommand()` line (~83):

   ```typescript
   program.addCommand(createLearningsCommand());
   ```

4. Run: `harness validate`
5. Commit: `feat(cli): add harness learnings prune command`

---

### Task 5: Add CLI integration tests for learnings prune command

**Depends on:** Task 4
**Files:** packages/cli/tests/commands/learnings-prune.test.ts

1. Create `packages/cli/tests/commands/learnings-prune.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createProgram } from '../../src/index';

describe('harness learnings prune', () => {
  let tmpDir: string;
  let originalExit: typeof process.exit;
  let exitCode: number | undefined;
  let consoleOutput: string[];
  let originalLog: typeof console.log;
  let originalError: typeof console.error;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cli-prune-'));
    exitCode = undefined;
    consoleOutput = [];

    originalExit = process.exit;
    // @ts-expect-error -- mock process.exit for testing
    process.exit = (code?: number) => {
      exitCode = code ?? 0;
      throw new Error(`process.exit(${code})`);
    };

    originalLog = console.log;
    originalError = console.error;
    console.log = (...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '));
    };
    console.error = (...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '));
    };
  });

  afterEach(() => {
    process.exit = originalExit;
    console.log = originalLog;
    console.error = originalError;
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should report nothing to prune when few entries exist', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    const today = new Date().toISOString().split('T')[0];
    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      `# Learnings\n\n- **${today} [skill:a]:** Learning 1\n\n- **${today} [skill:b]:** Learning 2\n`
    );

    const program = createProgram();
    try {
      await program.parseAsync(['node', 'harness', 'learnings', 'prune', '--path', tmpDir]);
    } catch {
      // process.exit throws
    }

    expect(exitCode).toBe(0);
    expect(consoleOutput.some((l) => l.includes('Nothing to prune'))).toBe(true);
  });

  it('should prune and show proposals when entries exceed threshold', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });

    // Create 35 entries, 5 with same skill tag
    const entries = Array.from({ length: 35 }, (_, i) => {
      const day = String((i % 28) + 1).padStart(2, '0');
      const month = i < 28 ? '01' : '02';
      const skill = i < 5 ? 'harness-execution' : `skill-${i}`;
      return `- **2026-${month}-${day} [skill:${skill}]:** Learning ${i}`;
    });

    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      `# Learnings\n\n${entries.join('\n\n')}\n`
    );

    const program = createProgram();
    try {
      await program.parseAsync(['node', 'harness', 'learnings', 'prune', '--path', tmpDir]);
    } catch {
      // process.exit throws
    }

    expect(exitCode).toBe(0);

    // Should show proposal for harness-execution pattern
    const output = consoleOutput.join('\n');
    expect(output).toContain('harness-execution');
    expect(output).toContain('5 learnings');

    // Should have archived entries
    expect(output).toContain('Pruned');
    expect(output).toContain('20 most recent');

    // Verify file state
    const remaining = fs.readFileSync(path.join(harnessDir, 'learnings.md'), 'utf-8');
    const remainingCount = (remaining.match(/^- \*\*/gm) || []).length;
    expect(remainingCount).toBe(20);

    // Verify archive exists
    const archiveDir = path.join(harnessDir, 'learnings-archive');
    expect(fs.existsSync(archiveDir)).toBe(true);
    const archiveFiles = fs.readdirSync(archiveDir);
    expect(archiveFiles.length).toBeGreaterThan(0);
  });

  it('should handle missing learnings file gracefully', async () => {
    const program = createProgram();
    try {
      await program.parseAsync(['node', 'harness', 'learnings', 'prune', '--path', tmpDir]);
    } catch {
      // process.exit throws
    }

    expect(exitCode).toBe(0);
    expect(consoleOutput.some((l) => l.includes('Nothing to prune'))).toBe(true);
  });
});
```

2. Run test: `cd packages/cli && npx vitest run tests/commands/learnings-prune.test.ts`
3. Observe: all tests pass.
4. Run: `harness validate`
5. Commit: `test(cli): add integration tests for harness learnings prune command`

---

## Traceability

| Observable Truth                                        | Delivered By                                                                     |
| ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1. CLI outputs proposal with skill tag and count        | Task 2 (analyzeLearningPatterns), Task 4 (CLI output), Task 5 (integration test) |
| 2. Archive file created at learnings-archive/YYYY-MM.md | Task 2 (archiveLearnings), Task 5 (integration test)                             |
| 3. Remaining learnings.md has 20 entries                | Task 2 (pruneLearnings), Task 5 (integration test)                               |
| 4. Nothing to prune for small/fresh files               | Task 2 (pruneLearnings threshold logic), Task 5 (integration test)               |
| 5. Core unit tests pass                                 | Task 1, Task 2                                                                   |
| 6. CLI integration tests pass                           | Task 5                                                                           |
| 7. harness validate passes                              | Every task                                                                       |
