# Plan: Adoption Telemetry -- Phase 1: Types & Core Module

**Date:** 2026-04-09
**Spec:** docs/changes/adoption-telemetry/proposal.md
**Estimated tasks:** 5
**Estimated time:** 20 minutes

## Goal

Define the adoption telemetry data model (types) and core module (reader + aggregator) with full test coverage, so that subsequent phases (hook, CLI, dashboard) can import and use them.

## Observable Truths (Acceptance Criteria)

1. `packages/types/src/adoption.ts` exists and exports `SkillInvocationRecord`, `SkillAdoptionSummary`, and `AdoptionSnapshot` interfaces matching the spec.
2. `packages/types/src/index.ts` re-exports all three adoption types under an `-- Adoption Telemetry --` section.
3. When `readAdoptionRecords` is called and `.harness/metrics/adoption.jsonl` does not exist, the function returns an empty array without throwing.
4. When the JSONL file contains malformed lines interspersed with valid lines, `readAdoptionRecords` skips malformed lines (logging a warning) and returns only the valid records.
5. When the JSONL file is empty, `readAdoptionRecords` returns an empty array.
6. `aggregateBySkill(records)` returns `SkillAdoptionSummary[]` grouped by skill name, with correct `invocations`, `successRate` (completed / total), `avgDuration`, `lastUsed`, and `tier` -- sorted by invocation count descending.
7. `aggregateByDay(records)` returns `{ date: string; invocations: number; uniqueSkills: number }[]` grouped by calendar date (UTC), sorted by date descending.
8. `topSkills(records, n)` returns the first N entries from `aggregateBySkill` output.
9. `packages/core/src/adoption/index.ts` re-exports `readAdoptionRecords`, `aggregateBySkill`, `aggregateByDay`, and `topSkills`.
10. `packages/core/src/index.ts` re-exports the adoption module via `export * from './adoption'`.
11. `npx vitest run packages/core/tests/adoption/` passes with all tests green.
12. `harness validate` passes after all changes.

## File Map

```
CREATE packages/types/src/adoption.ts
MODIFY packages/types/src/index.ts (add adoption type re-exports)
CREATE packages/core/src/adoption/reader.ts
CREATE packages/core/tests/adoption/reader.test.ts
CREATE packages/core/src/adoption/aggregator.ts
CREATE packages/core/tests/adoption/aggregator.test.ts
CREATE packages/core/src/adoption/index.ts
MODIFY packages/core/src/index.ts (add adoption module export)
```

## Tasks

### Task 1: Define adoption types and wire barrel exports

**Depends on:** none
**Files:** `packages/types/src/adoption.ts`, `packages/types/src/index.ts`

1. Create `packages/types/src/adoption.ts`:

```typescript
/**
 * A single skill invocation record stored in adoption.jsonl.
 * One line per invocation, appended by the adoption-tracker hook.
 */
export interface SkillInvocationRecord {
  /** Skill name (e.g., "harness-brainstorming") */
  skill: string;
  /** Session identifier */
  session: string;
  /** ISO 8601 timestamp when the skill started */
  startedAt: string;
  /** Duration in milliseconds */
  duration: number;
  /** Invocation outcome */
  outcome: 'completed' | 'failed' | 'abandoned';
  /** Phase names reached during the invocation */
  phasesReached: string[];
  /** Skill tier (1, 2, or 3) */
  tier: number;
  /** How the skill was triggered */
  trigger: string;
}

/**
 * Aggregated summary for a single skill across multiple invocations.
 */
export interface SkillAdoptionSummary {
  /** Skill name */
  skill: string;
  /** Total invocation count */
  invocations: number;
  /** Fraction of invocations with outcome 'completed' (0-1) */
  successRate: number;
  /** Mean duration in milliseconds */
  avgDuration: number;
  /** ISO 8601 timestamp of the most recent invocation */
  lastUsed: string;
  /** Skill tier */
  tier: number;
}

/**
 * Point-in-time snapshot of adoption metrics.
 * Used by CLI commands and dashboard API.
 */
export interface AdoptionSnapshot {
  /** Time period: "daily", "weekly", or "all-time" */
  period: string;
  /** Total invocations in the period */
  totalInvocations: number;
  /** Count of distinct skills invoked */
  uniqueSkills: number;
  /** Top skills by invocation count */
  topSkills: SkillAdoptionSummary[];
  /** ISO 8601 timestamp when this snapshot was generated */
  generatedAt: string;
}
```

2. Add adoption type re-exports to `packages/types/src/index.ts`. Insert the following block after the `-- Usage & Cost Tracking --` section:

```typescript
// --- Adoption Telemetry ---
export type { SkillInvocationRecord, SkillAdoptionSummary, AdoptionSnapshot } from './adoption';
```

3. Run: `npx harness validate`
4. Commit: `feat(types): define SkillInvocationRecord, SkillAdoptionSummary, AdoptionSnapshot`

---

### Task 2: Implement adoption JSONL reader with TDD

**Depends on:** Task 1
**Files:** `packages/core/tests/adoption/reader.test.ts`, `packages/core/src/adoption/reader.ts`

1. Create `packages/core/tests/adoption/reader.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readAdoptionRecords } from '../../src/adoption/reader';

describe('readAdoptionRecords', () => {
  const tmpDir = path.join(__dirname, '__test-tmp__');
  const adoptionFile = path.join(tmpDir, '.harness', 'metrics', 'adoption.jsonl');

  beforeEach(() => {
    fs.mkdirSync(path.dirname(adoptionFile), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses valid JSONL lines into SkillInvocationRecord array', () => {
    const record = {
      skill: 'harness-brainstorming',
      session: 'sess-1',
      startedAt: '2026-04-09T10:00:00.000Z',
      duration: 120000,
      outcome: 'completed',
      phasesReached: ['explore', 'evaluate'],
      tier: 1,
      trigger: 'manual',
    };
    fs.writeFileSync(adoptionFile, JSON.stringify(record) + '\n');

    const records = readAdoptionRecords(tmpDir);
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual(record);
  });

  it('parses multiple lines', () => {
    const r1 = {
      skill: 'harness-brainstorming',
      session: 'sess-1',
      startedAt: '2026-04-09T10:00:00.000Z',
      duration: 120000,
      outcome: 'completed',
      phasesReached: ['explore'],
      tier: 1,
      trigger: 'manual',
    };
    const r2 = {
      skill: 'harness-planning',
      session: 'sess-2',
      startedAt: '2026-04-09T11:00:00.000Z',
      duration: 60000,
      outcome: 'failed',
      phasesReached: [],
      tier: 1,
      trigger: 'dispatch',
    };
    fs.writeFileSync(adoptionFile, JSON.stringify(r1) + '\n' + JSON.stringify(r2) + '\n');

    const records = readAdoptionRecords(tmpDir);
    expect(records).toHaveLength(2);
    expect(records[0]!.skill).toBe('harness-brainstorming');
    expect(records[1]!.skill).toBe('harness-planning');
  });

  it('returns empty array when file does not exist', () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const records = readAdoptionRecords(tmpDir);
    expect(records).toEqual([]);
  });

  it('returns empty array for empty file', () => {
    fs.writeFileSync(adoptionFile, '');
    const records = readAdoptionRecords(tmpDir);
    expect(records).toEqual([]);
  });

  it('skips malformed lines with warning and returns valid records', () => {
    const valid = {
      skill: 'harness-execution',
      session: 'sess-3',
      startedAt: '2026-04-09T12:00:00.000Z',
      duration: 30000,
      outcome: 'abandoned',
      phasesReached: ['scope'],
      tier: 2,
      trigger: 'on_new_feature',
    };
    fs.writeFileSync(adoptionFile, 'not json\n' + JSON.stringify(valid) + '\n{broken\n');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const records = readAdoptionRecords(tmpDir);
    expect(records).toHaveLength(1);
    expect(records[0]!.skill).toBe('harness-execution');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping malformed'));
    warnSpy.mockRestore();
  });

  it('skips blank lines without warning', () => {
    const valid = {
      skill: 'harness-brainstorming',
      session: 'sess-4',
      startedAt: '2026-04-09T13:00:00.000Z',
      duration: 50000,
      outcome: 'completed',
      phasesReached: ['explore', 'evaluate', 'prioritize'],
      tier: 1,
      trigger: 'manual',
    };
    fs.writeFileSync(adoptionFile, '\n' + JSON.stringify(valid) + '\n\n');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const records = readAdoptionRecords(tmpDir);
    expect(records).toHaveLength(1);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
```

2. Run test: `cd packages/core && npx vitest run tests/adoption/reader.test.ts`
3. Observe failure: module `../../src/adoption/reader` not found.

4. Create `packages/core/src/adoption/reader.ts`:

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SkillInvocationRecord } from '@harness-engineering/types';

/**
 * Parses a single JSONL line into a SkillInvocationRecord.
 * Returns null if the line is not valid JSON.
 */
function parseLine(line: string, lineNumber: number): SkillInvocationRecord | null {
  try {
    return JSON.parse(line) as SkillInvocationRecord;
  } catch {
    console.warn(`[harness adoption] Skipping malformed JSONL line ${lineNumber}`);
    return null;
  }
}

/**
 * Reads .harness/metrics/adoption.jsonl and returns parsed SkillInvocationRecord[].
 *
 * - Returns empty array if the file does not exist
 * - Skips malformed lines with a warning to stderr
 * - Skips blank lines silently
 */
export function readAdoptionRecords(projectRoot: string): SkillInvocationRecord[] {
  const adoptionFile = path.join(projectRoot, '.harness', 'metrics', 'adoption.jsonl');

  let raw: string;
  try {
    raw = fs.readFileSync(adoptionFile, 'utf-8');
  } catch {
    return [];
  }

  const records: SkillInvocationRecord[] = [];
  const lines = raw.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    const record = parseLine(line, i + 1);
    if (record) {
      records.push(record);
    }
  }

  return records;
}
```

5. Run test: `cd packages/core && npx vitest run tests/adoption/reader.test.ts`
6. Observe: all 6 tests pass.
7. Run: `npx harness validate`
8. Commit: `feat(adoption): add JSONL reader with malformed-line handling`

---

### Task 3: Implement adoption aggregator with TDD

**Depends on:** Task 1
**Files:** `packages/core/tests/adoption/aggregator.test.ts`, `packages/core/src/adoption/aggregator.ts`

1. Create `packages/core/tests/adoption/aggregator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { SkillInvocationRecord } from '@harness-engineering/types';
import { aggregateBySkill, aggregateByDay, topSkills } from '../../src/adoption/aggregator';

function makeRecord(overrides: Partial<SkillInvocationRecord> = {}): SkillInvocationRecord {
  return {
    skill: 'harness-brainstorming',
    session: 'sess-1',
    startedAt: '2026-04-09T10:00:00.000Z',
    duration: 120000,
    outcome: 'completed',
    phasesReached: ['explore', 'evaluate'],
    tier: 1,
    trigger: 'manual',
    ...overrides,
  };
}

describe('aggregateBySkill', () => {
  it('returns empty array for empty input', () => {
    expect(aggregateBySkill([])).toEqual([]);
  });

  it('groups records by skill and computes summary fields', () => {
    const records: SkillInvocationRecord[] = [
      makeRecord({
        skill: 'skill-a',
        duration: 100000,
        outcome: 'completed',
        startedAt: '2026-04-08T10:00:00.000Z',
      }),
      makeRecord({
        skill: 'skill-a',
        duration: 200000,
        outcome: 'failed',
        startedAt: '2026-04-09T10:00:00.000Z',
      }),
      makeRecord({
        skill: 'skill-b',
        duration: 50000,
        outcome: 'completed',
        startedAt: '2026-04-09T11:00:00.000Z',
      }),
    ];

    const result = aggregateBySkill(records);
    expect(result).toHaveLength(2);

    // skill-a has 2 invocations, sorted first
    const skillA = result[0]!;
    expect(skillA.skill).toBe('skill-a');
    expect(skillA.invocations).toBe(2);
    expect(skillA.successRate).toBe(0.5); // 1 completed out of 2
    expect(skillA.avgDuration).toBe(150000); // (100000 + 200000) / 2
    expect(skillA.lastUsed).toBe('2026-04-09T10:00:00.000Z');
    expect(skillA.tier).toBe(1);

    // skill-b has 1 invocation
    const skillB = result[1]!;
    expect(skillB.skill).toBe('skill-b');
    expect(skillB.invocations).toBe(1);
    expect(skillB.successRate).toBe(1);
    expect(skillB.avgDuration).toBe(50000);
  });

  it('sorts by invocation count descending', () => {
    const records: SkillInvocationRecord[] = [
      makeRecord({ skill: 'rare' }),
      makeRecord({ skill: 'popular' }),
      makeRecord({ skill: 'popular' }),
      makeRecord({ skill: 'popular' }),
    ];

    const result = aggregateBySkill(records);
    expect(result[0]!.skill).toBe('popular');
    expect(result[0]!.invocations).toBe(3);
    expect(result[1]!.skill).toBe('rare');
    expect(result[1]!.invocations).toBe(1);
  });

  it('counts only completed outcomes for successRate', () => {
    const records: SkillInvocationRecord[] = [
      makeRecord({ outcome: 'completed' }),
      makeRecord({ outcome: 'failed' }),
      makeRecord({ outcome: 'abandoned' }),
    ];

    const result = aggregateBySkill(records);
    expect(result[0]!.successRate).toBeCloseTo(1 / 3);
  });
});

describe('aggregateByDay', () => {
  it('returns empty array for empty input', () => {
    expect(aggregateByDay([])).toEqual([]);
  });

  it('groups records by calendar date and counts unique skills', () => {
    const records: SkillInvocationRecord[] = [
      makeRecord({ skill: 'skill-a', startedAt: '2026-04-08T10:00:00.000Z' }),
      makeRecord({ skill: 'skill-a', startedAt: '2026-04-08T14:00:00.000Z' }),
      makeRecord({ skill: 'skill-b', startedAt: '2026-04-08T16:00:00.000Z' }),
      makeRecord({ skill: 'skill-a', startedAt: '2026-04-09T09:00:00.000Z' }),
    ];

    const result = aggregateByDay(records);
    expect(result).toHaveLength(2);

    // Most recent day first
    expect(result[0]!.date).toBe('2026-04-09');
    expect(result[0]!.invocations).toBe(1);
    expect(result[0]!.uniqueSkills).toBe(1);

    expect(result[1]!.date).toBe('2026-04-08');
    expect(result[1]!.invocations).toBe(3);
    expect(result[1]!.uniqueSkills).toBe(2);
  });

  it('sorts by date descending', () => {
    const records: SkillInvocationRecord[] = [
      makeRecord({ startedAt: '2026-04-07T10:00:00.000Z' }),
      makeRecord({ startedAt: '2026-04-09T10:00:00.000Z' }),
      makeRecord({ startedAt: '2026-04-08T10:00:00.000Z' }),
    ];

    const result = aggregateByDay(records);
    expect(result.map((d) => d.date)).toEqual(['2026-04-09', '2026-04-08', '2026-04-07']);
  });
});

describe('topSkills', () => {
  it('returns empty array for empty input', () => {
    expect(topSkills([], 5)).toEqual([]);
  });

  it('returns top N skills by invocation count', () => {
    const records: SkillInvocationRecord[] = [
      makeRecord({ skill: 'a' }),
      makeRecord({ skill: 'b' }),
      makeRecord({ skill: 'b' }),
      makeRecord({ skill: 'c' }),
      makeRecord({ skill: 'c' }),
      makeRecord({ skill: 'c' }),
    ];

    const result = topSkills(records, 2);
    expect(result).toHaveLength(2);
    expect(result[0]!.skill).toBe('c');
    expect(result[1]!.skill).toBe('b');
  });

  it('returns all skills when n exceeds skill count', () => {
    const records: SkillInvocationRecord[] = [makeRecord({ skill: 'only-one' })];

    const result = topSkills(records, 10);
    expect(result).toHaveLength(1);
    expect(result[0]!.skill).toBe('only-one');
  });
});
```

2. Run test: `cd packages/core && npx vitest run tests/adoption/aggregator.test.ts`
3. Observe failure: module `../../src/adoption/aggregator` not found.

4. Create `packages/core/src/adoption/aggregator.ts`:

```typescript
import type { SkillInvocationRecord, SkillAdoptionSummary } from '@harness-engineering/types';

/**
 * Return type for daily aggregation.
 */
export interface DailyAdoption {
  /** Calendar date (YYYY-MM-DD) */
  date: string;
  /** Number of invocations on this date */
  invocations: number;
  /** Count of distinct skills invoked on this date */
  uniqueSkills: number;
}

/**
 * Aggregates records by skill name into SkillAdoptionSummary[].
 * Sorted by invocation count descending.
 */
export function aggregateBySkill(records: SkillInvocationRecord[]): SkillAdoptionSummary[] {
  if (records.length === 0) return [];

  const skillMap = new Map<
    string,
    {
      records: SkillInvocationRecord[];
      tier: number;
    }
  >();

  for (const record of records) {
    if (!skillMap.has(record.skill)) {
      skillMap.set(record.skill, { records: [], tier: record.tier });
    }
    skillMap.get(record.skill)!.records.push(record);
  }

  const results: SkillAdoptionSummary[] = [];

  for (const [skill, bucket] of skillMap) {
    const invocations = bucket.records.length;
    const completedCount = bucket.records.filter((r) => r.outcome === 'completed').length;
    const totalDuration = bucket.records.reduce((sum, r) => sum + r.duration, 0);
    const timestamps = bucket.records.map((r) => r.startedAt).sort();

    results.push({
      skill,
      invocations,
      successRate: completedCount / invocations,
      avgDuration: totalDuration / invocations,
      lastUsed: timestamps[timestamps.length - 1]!,
      tier: bucket.tier,
    });
  }

  results.sort((a, b) => b.invocations - a.invocations);

  return results;
}

/**
 * Aggregates records by calendar date (derived from startedAt).
 * Sorted by date descending (most recent first).
 */
export function aggregateByDay(records: SkillInvocationRecord[]): DailyAdoption[] {
  if (records.length === 0) return [];

  const dayMap = new Map<string, { invocations: number; skills: Set<string> }>();

  for (const record of records) {
    const date = record.startedAt.slice(0, 10); // YYYY-MM-DD

    if (!dayMap.has(date)) {
      dayMap.set(date, { invocations: 0, skills: new Set() });
    }

    const bucket = dayMap.get(date)!;
    bucket.invocations++;
    bucket.skills.add(record.skill);
  }

  const results: DailyAdoption[] = [];

  for (const [date, bucket] of dayMap) {
    results.push({
      date,
      invocations: bucket.invocations,
      uniqueSkills: bucket.skills.size,
    });
  }

  results.sort((a, b) => b.date.localeCompare(a.date));

  return results;
}

/**
 * Returns the top N skills by invocation count.
 * Convenience wrapper over aggregateBySkill.
 */
export function topSkills(records: SkillInvocationRecord[], n: number): SkillAdoptionSummary[] {
  return aggregateBySkill(records).slice(0, n);
}
```

5. Run test: `cd packages/core && npx vitest run tests/adoption/aggregator.test.ts`
6. Observe: all 9 tests pass.
7. Run: `npx harness validate`
8. Commit: `feat(adoption): add aggregateBySkill, aggregateByDay, topSkills`

---

### Task 4: Create adoption module barrel export

**Depends on:** Task 2, Task 3
**Files:** `packages/core/src/adoption/index.ts`

1. Create `packages/core/src/adoption/index.ts`:

```typescript
export { readAdoptionRecords } from './reader';
export { aggregateBySkill, aggregateByDay, topSkills } from './aggregator';
export type { DailyAdoption } from './aggregator';
```

2. Run: `npx harness validate`
3. Commit: `feat(adoption): add barrel export for adoption module`

---

### Task 5: Wire adoption module into core package barrel export

**Depends on:** Task 4
**Files:** `packages/core/src/index.ts`

1. Add the following line to `packages/core/src/index.ts`, after the existing `export * from './usage';` line:

```typescript
/**
 * Adoption telemetry module for tracking and aggregating skill invocations.
 */
export * from './adoption';
```

2. Run all adoption tests to verify end-to-end: `cd packages/core && npx vitest run tests/adoption/`
3. Observe: all tests pass (6 reader + 9 aggregator = 15 tests).
4. Run: `npx harness validate`
5. Run: `npx harness check-deps`
6. Commit: `feat(adoption): wire adoption module into core barrel export`

[checkpoint:human-verify] -- Verify that `harness validate` and `harness check-deps` both pass. Run `cd packages/core && npx vitest run tests/adoption/` and confirm all 15 tests are green.
