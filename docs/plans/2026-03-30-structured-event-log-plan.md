# Plan: Structured Event Log

**Spec:** docs/changes/claude-mem-patterns/structured-event-log/proposal.md
**Phase:** 3 of the claude-mem-patterns adoption
**Complexity:** MEDIUM (5 tasks, 1 new file + modifications to 4 existing files)

## Overview

Implement an append-only structured event log (JSONL) for skill lifecycle moments. Events are born-deduplicated using content hashing from Phase 2. The `gather_context` tool gains `includeEvents` support.

## Task 1: Define SkillEvent schema and EVENTS_FILE constant

**Files:**

- `packages/core/src/state/constants.ts` — add `EVENTS_FILE`
- `packages/core/src/state/events.ts` — new file with SkillEvent type and EventType union

**Test:** `packages/core/tests/state/events.test.ts` — schema validation tests

**Steps:**

1. Add `export const EVENTS_FILE = 'events.jsonl';` to constants.ts
2. Create `events.ts` with:
   - `EventType` union type: `'phase_transition' | 'decision' | 'gate_result' | 'handoff' | 'error' | 'checkpoint'`
   - `SkillEvent` interface matching spec schema
   - `SkillEventSchema` Zod schema for validation
   - `formatEventTimeline(events: SkillEvent[], limit?: number): string` — formats events as compact timeline
3. Write tests verifying schema validation accepts valid events and rejects invalid ones

**Commit:** `feat(events): define SkillEvent schema and EVENTS_FILE constant`

## Task 2: Implement emitEvent with JSONL append and content-hash dedup

**Files:**

- `packages/core/src/state/events.ts` — add `emitEvent()` and `loadEvents()`

**Test:** `packages/core/tests/state/events.test.ts` — emitEvent tests

**Steps:**

1. Write tests:
   - emitEvent writes a JSONL line to events.jsonl in .harness/
   - emitEvent with session option writes to session-scoped directory
   - Duplicate event (same skill, type, summary, session) is skipped (returns `{written: false, reason: 'duplicate'}`)
   - loadEvents reads back all events from a JSONL file
   - loadEvents returns empty array when file missing
   - Partial/corrupt lines are skipped gracefully
2. Implement `emitEvent(projectPath, event, options?)`:
   - Compute contentHash from `{skill, type, summary, session}` using `computeContentHash` from learnings.ts
   - Read existing events.jsonl, extract content hashes into Set
   - If hash exists, return `{written: false, reason: 'duplicate'}`
   - Otherwise, append `JSON.stringify({...event, timestamp: new Date().toISOString(), contentHash}) + '\n'`
   - Use `fs.appendFileSync` for crash-safe append
3. Implement `loadEvents(projectPath, options?)`:
   - Read events.jsonl line by line
   - Parse each line as JSON, skip malformed lines
   - Return array of SkillEvent objects

**Commit:** `feat(events): implement emitEvent with JSONL append and content-hash dedup`

## Task 3: Implement formatEventTimeline and wire exports

**Files:**

- `packages/core/src/state/events.ts` — implement formatEventTimeline
- `packages/core/src/state/index.ts` — add events exports
- `packages/core/src/state/state-manager.ts` — add events re-exports

**Test:** `packages/core/tests/state/events.test.ts` — timeline formatting tests

**Steps:**

1. Write tests:
   - formatEventTimeline with empty array returns empty string
   - formatEventTimeline formats phase_transition as `HH:MM [skill] phase: FROM -> TO`
   - formatEventTimeline formats gate_result as `HH:MM [skill] gate: passed/failed (check1 Y, check2 N)`
   - formatEventTimeline formats decision as `HH:MM [skill] decision: summary`
   - formatEventTimeline formats handoff as `HH:MM [skill] handoff: summary`
   - formatEventTimeline respects limit parameter (default 20)
2. Implement formatEventTimeline:
   - Take last N events (default 20)
   - Format timestamp as HH:MM
   - Type-specific formatting per spec
3. Add exports to index.ts and state-manager.ts

**Commit:** `feat(events): implement timeline formatting and wire barrel exports`

## Task 4: Integrate events into gather_context

**Files:**

- `packages/cli/src/mcp/tools/gather-context.ts` — add includeEvents parameter and events loading

**Test:** Manual verification (gather-context is an MCP tool with complex dependency injection; the core functions are already tested)

**Steps:**

1. Add `includeEvents` to inputSchema: `{ type: 'boolean', description: 'Include recent events timeline (default: true for session, false for global)' }`
2. Add `'events'` to the IncludeKey type
3. Add eventsPromise that:
   - Determines if events should be included (explicit includeEvents, or default based on session presence)
   - Calls `loadEvents` from core
   - Calls `formatEventTimeline` to format as compact timeline
4. Add events to output object as `events` field (timeline string or null)
5. Rebuild core so CLI can resolve the new exports

**Commit:** `feat(events): integrate event timeline into gather_context`

## Task 5: Verify end-to-end and update session state

**Steps:**

1. Run full test suite: `npx vitest run`
2. Run type check: `npx tsc --noEmit`
3. Verify all success criteria:
   - emitEvent writes JSONL with content hash dedup
   - loadEvents + formatEventTimeline produce compact timeline
   - gather_context has includeEvents parameter
   - Events are crash-safe (JSONL line-level atomicity via appendFileSync)
4. Update session state

**Commit:** none (verification only)
