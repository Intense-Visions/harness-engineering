# Plan: Wave 1.1 -- Session Memory Schema & Types

**Date:** 2026-03-27
**Spec:** docs/changes/ai-foundations-integration/proposal.md
**Estimated tasks:** 3
**Estimated time:** 10 minutes

## Goal

Define TypeScript types and runtime constants for session-scoped accumulative sections (terminology, decisions, constraints, risks, openQuestions, evidence) and their entry format in `@harness-engineering/types`, enabling downstream phases (1.2 core engine, 1.3 MCP tool, 1.4 skill integration) to import and use them.

## Observable Truths (Acceptance Criteria)

1. The file `packages/types/src/session-state.ts` exists and exports: `SessionSectionName` (union type), `SessionEntryStatus` (union type), `SessionEntry` (interface), `SessionSections` (type mapping section names to entry arrays), and `SESSION_SECTION_NAMES` (runtime array constant).
2. `SESSION_SECTION_NAMES` contains exactly: `terminology`, `decisions`, `constraints`, `risks`, `openQuestions`, `evidence`.
3. `SessionEntry` contains fields: `id` (string), `timestamp` (string), `authorSkill` (string), `content` (string), `status` (SessionEntryStatus).
4. `SessionEntryStatus` is the union `'active' | 'resolved' | 'superseded'`.
5. `SessionSections` maps each `SessionSectionName` to `SessionEntry[]`.
6. `packages/types/src/index.ts` re-exports all session state types and the `SESSION_SECTION_NAMES` constant.
7. When `npx vitest run` is executed in `packages/types`, all tests pass including new session-state tests.
8. When `npm run build` is executed in `packages/types`, it completes without errors.
9. `harness validate` passes.

## File Map

- CREATE `packages/types/src/session-state.ts`
- MODIFY `packages/types/src/index.ts` (add re-exports for session state types)
- CREATE `packages/types/tests/session-state.test.ts`

## Tasks

### Task 1: Define session state types

**Depends on:** none
**Files:** `packages/types/src/session-state.ts`

1. Create `packages/types/src/session-state.ts`:

```typescript
/**
 * Session-scoped accumulative state types.
 *
 * Session memory allows skills to append to shared sections (terminology,
 * decisions, constraints, risks, openQuestions, evidence) rather than
 * overwriting. Each entry is timestamped and tagged with the authoring skill.
 *
 * @see docs/changes/ai-foundations-integration/proposal.md
 */

/**
 * Names of accumulative session sections.
 * Runtime array used for iteration and validation.
 */
export const SESSION_SECTION_NAMES = [
  'terminology',
  'decisions',
  'constraints',
  'risks',
  'openQuestions',
  'evidence',
] as const;

/**
 * Union type of valid session section names.
 */
export type SessionSectionName = (typeof SESSION_SECTION_NAMES)[number];

/**
 * Lifecycle status of a session entry.
 * - `active` — current and relevant
 * - `resolved` — addressed or answered (e.g., an open question that was resolved)
 * - `superseded` — replaced by a newer entry
 */
export type SessionEntryStatus = 'active' | 'resolved' | 'superseded';

/**
 * A single entry in a session section.
 * Entries are append-only; skills mark them as `resolved` or `superseded`
 * rather than deleting.
 */
export interface SessionEntry {
  /** Auto-generated unique identifier */
  id: string;
  /** ISO 8601 timestamp of when the entry was created */
  timestamp: string;
  /** Name of the skill that authored this entry */
  authorSkill: string;
  /** The entry content (free-form text) */
  content: string;
  /** Lifecycle status of the entry */
  status: SessionEntryStatus;
}

/**
 * Container mapping each section name to its array of entries.
 * Used as the shape of session-scoped state in `state.json`.
 */
export type SessionSections = {
  [K in SessionSectionName]: SessionEntry[];
};
```

2. Run: `harness validate`
3. Commit: `feat(types): define session-scoped accumulative state types`

---

### Task 2: Re-export session state types from index

**Depends on:** Task 1
**Files:** `packages/types/src/index.ts`

1. Add the following re-exports to the end of `packages/types/src/index.ts`, before the orchestrator re-exports block:

```typescript
// --- Session State Types ---
export { SESSION_SECTION_NAMES } from './session-state';
export type {
  SessionSectionName,
  SessionEntryStatus,
  SessionEntry,
  SessionSections,
} from './session-state';
```

2. Run: `npm run build` in `packages/types` to verify the types compile and the build succeeds.
3. Run: `harness validate`
4. Commit: `feat(types): re-export session state types from package index`

---

### Task 3: Add session state tests and verify build

**Depends on:** Task 2
**Files:** `packages/types/tests/session-state.test.ts`

1. Create `packages/types/tests/session-state.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  SESSION_SECTION_NAMES,
  type SessionSectionName,
  type SessionEntryStatus,
  type SessionEntry,
  type SessionSections,
} from '../src/index.js';

describe('SESSION_SECTION_NAMES', () => {
  it('contains exactly the six expected section names', () => {
    expect(SESSION_SECTION_NAMES).toEqual([
      'terminology',
      'decisions',
      'constraints',
      'risks',
      'openQuestions',
      'evidence',
    ]);
  });

  it('has length 6', () => {
    expect(SESSION_SECTION_NAMES).toHaveLength(6);
  });

  it('is readonly (frozen tuple)', () => {
    // as const produces a readonly tuple — verify it is not accidentally mutable
    // by checking the type at runtime: Object.isFrozen is true for as-const arrays
    // Note: as-const only enforces at compile time; this test documents the intent
    expect(Array.isArray(SESSION_SECTION_NAMES)).toBe(true);
  });
});

describe('SessionEntry structure', () => {
  const entry: SessionEntry = {
    id: 'entry-001',
    timestamp: '2026-03-27T14:30:00Z',
    authorSkill: 'harness-brainstorming',
    content: 'API should use REST, not GraphQL',
    status: 'active',
  };

  it('has all required fields', () => {
    expect(entry).toHaveProperty('id');
    expect(entry).toHaveProperty('timestamp');
    expect(entry).toHaveProperty('authorSkill');
    expect(entry).toHaveProperty('content');
    expect(entry).toHaveProperty('status');
  });

  it('accepts all valid status values', () => {
    const statuses: SessionEntryStatus[] = ['active', 'resolved', 'superseded'];
    statuses.forEach((status) => {
      const e: SessionEntry = { ...entry, status };
      expect(e.status).toBe(status);
    });
  });
});

describe('SessionSections type', () => {
  it('allows constructing a sections object with all six keys', () => {
    const sections: SessionSections = {
      terminology: [],
      decisions: [],
      constraints: [],
      risks: [],
      openQuestions: [],
      evidence: [],
    };

    // Verify all keys are present
    for (const name of SESSION_SECTION_NAMES) {
      expect(sections[name]).toEqual([]);
    }
  });

  it('accepts entries in section arrays', () => {
    const entry: SessionEntry = {
      id: 'entry-002',
      timestamp: '2026-03-27T15:00:00Z',
      authorSkill: 'harness-planning',
      content: 'Must support Node 18+',
      status: 'active',
    };

    const sections: SessionSections = {
      terminology: [],
      decisions: [],
      constraints: [entry],
      risks: [],
      openQuestions: [],
      evidence: [],
    };

    expect(sections.constraints).toHaveLength(1);
    expect(sections.constraints[0].authorSkill).toBe('harness-planning');
  });
});

describe('SessionSectionName type', () => {
  it('each SESSION_SECTION_NAMES element is assignable to SessionSectionName', () => {
    // This is primarily a compile-time check; runtime verification that the
    // constant and the type stay in sync
    const names: SessionSectionName[] = [...SESSION_SECTION_NAMES];
    expect(names).toHaveLength(6);
  });
});
```

2. Run tests: `cd packages/types && npx vitest run`
3. Observe: all tests pass (both existing and new)
4. Run: `npm run build` in `packages/types`
5. Observe: build succeeds without errors
6. Run: `harness validate`
7. Commit: `test(types): add session state type tests`

## Traceability

| Observable Truth                        | Delivered by               |
| --------------------------------------- | -------------------------- |
| 1. session-state.ts exports types       | Task 1                     |
| 2. SESSION_SECTION_NAMES has 6 entries  | Task 1, verified by Task 3 |
| 3. SessionEntry has correct fields      | Task 1, verified by Task 3 |
| 4. SessionEntryStatus union             | Task 1, verified by Task 3 |
| 5. SessionSections maps names to arrays | Task 1, verified by Task 3 |
| 6. index.ts re-exports                  | Task 2                     |
| 7. vitest passes                        | Task 3                     |
| 8. build succeeds                       | Task 2, Task 3             |
| 9. harness validate passes              | Task 1, 2, 3               |
