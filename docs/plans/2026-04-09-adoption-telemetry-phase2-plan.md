# Plan: Adoption Telemetry Phase 2 -- Hook

**Date:** 2026-04-09
**Spec:** docs/changes/adoption-telemetry/proposal.md
**Estimated tasks:** 5
**Estimated time:** 20 minutes

## Goal

Implement the `adoption-tracker.js` Stop hook that reads skill lifecycle events from `.harness/events.jsonl`, reconstructs `SkillInvocationRecord` entries, and appends them to `.harness/metrics/adoption.jsonl`.

## Observable Truths (Acceptance Criteria)

1. When a session ends with skill events in `.harness/events.jsonl`, running the hook produces one `SkillInvocationRecord` per distinct skill in `.harness/metrics/adoption.jsonl`.
2. When `events.jsonl` is missing, malformed, or empty, the hook exits with code 0 and does not create or modify `adoption.jsonl`.
3. When `adoption.enabled` is `false` in `harness.config.json`, the hook exits 0 without writing records.
4. The hook always exits 0 -- telemetry never blocks session teardown.
5. Each record has correct `outcome` derivation: `completed` (has handoff or final phase), `failed` (has error), `abandoned` (otherwise).
6. Each record has correct `phasesReached` derived from `phase_transition` events' `data.to` field.
7. Each record has correct `duration` derived from first to last event timestamp per skill.
8. Records written by the hook parse correctly through `readAdoptionRecords()` and aggregate correctly through `aggregateBySkill()`.
9. The hook is registered in `profiles.ts` at the `standard` profile level (same event/matcher as cost-tracker: `Stop`, `*`).
10. `npx vitest run tests/hooks/adoption-tracker.test.ts` passes in `packages/cli`.
11. `harness validate` passes after all changes.

## File Map

- CREATE `packages/cli/src/hooks/adoption-tracker.js`
- CREATE `packages/cli/tests/hooks/adoption-tracker.test.ts`
- MODIFY `packages/cli/src/hooks/profiles.ts` (add adoption-tracker entry)
- MODIFY `packages/cli/tests/commands/hooks.test.ts` (update expected Stop hook count for standard/strict profiles)
- MODIFY `packages/cli/tests/hooks/hooks-cli-integration.test.ts` (update expected hook count for strict profile)
- MODIFY `packages/cli/tests/hooks/profiles.test.ts` (update HOOK_SCRIPTS length, add adoption-tracker to standard assertions)

## Tasks

### Task 1: Create adoption-tracker.js hook

**Depends on:** none
**Files:** `packages/cli/src/hooks/adoption-tracker.js`

1. Create `packages/cli/src/hooks/adoption-tracker.js`:

```javascript
#!/usr/bin/env node
// adoption-tracker.js — Stop:* hook
// Reads .harness/events.jsonl, reconstructs skill invocations,
// appends SkillInvocationRecord entries to .harness/metrics/adoption.jsonl.
// Exit codes: 0 = allow (always, log-only hook)

import { readFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

/** Read and parse a JSON file, returning null on any error. */
function readJsonSafe(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/** Check if adoption tracking is enabled in harness.config.json. */
function isAdoptionEnabled(cwd) {
  const config = readJsonSafe(join(cwd, 'harness.config.json'));
  if (!config) return true; // default: enabled
  if (config.adoption && config.adoption.enabled === false) return false;
  return true;
}

/** Parse events.jsonl into an array of event objects. Skips malformed lines. */
function parseEventsFile(eventsPath) {
  let raw;
  try {
    raw = readFileSync(eventsPath, 'utf-8');
  } catch {
    return [];
  }

  const events = [];
  const lines = raw.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.skill && parsed.type && parsed.timestamp) {
        events.push(parsed);
      }
    } catch {
      // Skip malformed lines
    }
  }
  return events;
}

/** Relevant event types for adoption tracking. */
const RELEVANT_TYPES = new Set(['phase_transition', 'gate_result', 'handoff', 'error']);

/** Derive outcome from a skill's events. */
function deriveOutcome(events) {
  const hasHandoff = events.some((e) => e.type === 'handoff');
  const hasError = events.some((e) => e.type === 'error');

  // Check for final phase (VALIDATE is the conventional final phase)
  const phases = events
    .filter((e) => e.type === 'phase_transition')
    .map((e) => (e.data && e.data.to) || '')
    .filter(Boolean);
  const hasFinalPhase = phases.some(
    (p) => p.toLowerCase() === 'validate' || p.toLowerCase() === 'complete'
  );

  if (hasHandoff || hasFinalPhase) return 'completed';
  if (hasError) return 'failed';
  return 'abandoned';
}

/** Derive phases reached from phase_transition events. */
function derivePhasesReached(events) {
  const phases = [];
  const seen = new Set();
  for (const event of events) {
    if (event.type === 'phase_transition' && event.data && event.data.to) {
      const phase = event.data.to;
      if (!seen.has(phase)) {
        seen.add(phase);
        phases.push(phase);
      }
    }
  }
  return phases;
}

/** Derive duration in ms from first to last event timestamp. */
function deriveDuration(events) {
  if (events.length < 2) return 0;
  const timestamps = events.map((e) => new Date(e.timestamp).getTime()).filter((t) => !isNaN(t));
  if (timestamps.length < 2) return 0;
  const min = Math.min(...timestamps);
  const max = Math.max(...timestamps);
  return max - min;
}

function main() {
  let raw = '';
  try {
    raw = readFileSync(0, 'utf-8');
  } catch {
    process.exit(0);
  }

  if (!raw.trim()) {
    process.exit(0);
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.stderr.write('[adoption-tracker] Could not parse stdin — skipping\n');
    process.exit(0);
  }

  try {
    const cwd = process.cwd();

    // Check config
    if (!isAdoptionEnabled(cwd)) {
      process.stderr.write('[adoption-tracker] Adoption tracking disabled — skipping\n');
      process.exit(0);
    }

    // Read events.jsonl
    const eventsPath = join(cwd, '.harness', 'events.jsonl');
    if (!existsSync(eventsPath)) {
      process.stderr.write('[adoption-tracker] No events.jsonl found — skipping\n');
      process.exit(0);
    }

    const allEvents = parseEventsFile(eventsPath);
    // Filter to relevant event types
    const relevantEvents = allEvents.filter((e) => RELEVANT_TYPES.has(e.type));
    if (relevantEvents.length === 0) {
      process.stderr.write('[adoption-tracker] No relevant skill events — skipping\n');
      process.exit(0);
    }

    // Group events by skill
    const skillGroups = new Map();
    for (const event of relevantEvents) {
      if (!skillGroups.has(event.skill)) {
        skillGroups.set(event.skill, []);
      }
      skillGroups.get(event.skill).push(event);
    }

    // Reconstruct invocation records
    const sessionId = input.session_id ?? 'unknown';
    const metricsDir = join(cwd, '.harness', 'metrics');
    mkdirSync(metricsDir, { recursive: true });
    const adoptionFile = join(metricsDir, 'adoption.jsonl');

    let written = 0;
    for (const [skill, events] of skillGroups) {
      // Use all events for this skill (including non-relevant) for timing
      const allSkillEvents = allEvents.filter((e) => e.skill === skill);

      const record = {
        skill,
        session: sessionId,
        startedAt: allSkillEvents[0]?.timestamp ?? events[0].timestamp,
        duration: deriveDuration(allSkillEvents.length > 0 ? allSkillEvents : events),
        outcome: deriveOutcome(events),
        phasesReached: derivePhasesReached(events),
        tier: 0, // tier is not available from events; default to 0
        trigger: 'unknown', // trigger is not available from events; default to unknown
      };

      appendFileSync(adoptionFile, JSON.stringify(record) + '\n');
      written++;
    }

    process.stderr.write(
      `[adoption-tracker] Wrote ${written} adoption record(s) for session ${sessionId}\n`
    );
    process.exit(0);
  } catch (err) {
    process.stderr.write(`[adoption-tracker] Failed: ${err.message}\n`);
    process.exit(0);
  }
}

main();
```

2. Run: `harness validate`
3. Commit: `feat(hooks): add adoption-tracker Stop hook for skill invocation telemetry`

---

### Task 2: Create integration test for adoption-tracker hook

**Depends on:** Task 1
**Files:** `packages/cli/tests/hooks/adoption-tracker.test.ts`

1. Create `packages/cli/tests/hooks/adoption-tracker.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HOOK_PATH = resolve(__dirname, '../../src/hooks/adoption-tracker.js');

function runHook(stdinData: string, cwd: string): { exitCode: number; stderr: string } {
  const stdinFile = join(cwd, '.stdin-data.json');
  writeFileSync(stdinFile, stdinData);
  const result = spawnSync('sh', ['-c', `cat "${stdinFile}" | node "${HOOK_PATH}"`], {
    encoding: 'utf-8',
    cwd,
    timeout: 15000,
  });
  try {
    rmSync(stdinFile, { force: true });
  } catch {
    /* ignore */
  }
  return {
    exitCode: result.status ?? (result.signal ? 0 : 1),
    stderr: result.stderr ?? '',
  };
}

function writeEventsJsonl(cwd: string, events: object[]): void {
  const harnessDir = join(cwd, '.harness');
  mkdirSync(harnessDir, { recursive: true });
  const content = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
  writeFileSync(join(harnessDir, 'events.jsonl'), content);
}

function readAdoptionRecords(cwd: string): object[] {
  const filePath = join(cwd, '.harness', 'metrics', 'adoption.jsonl');
  if (!existsSync(filePath)) return [];
  const lines = readFileSync(filePath, 'utf-8').trim().split('\n');
  return lines.filter((l) => l.trim()).map((l) => JSON.parse(l));
}

const SAMPLE_EVENTS = [
  {
    timestamp: '2026-04-09T10:00:00.000Z',
    skill: 'harness-brainstorming',
    type: 'phase_transition',
    summary: 'Starting EXPLORE',
    data: { from: 'init', to: 'EXPLORE' },
  },
  {
    timestamp: '2026-04-09T10:05:00.000Z',
    skill: 'harness-brainstorming',
    type: 'phase_transition',
    summary: 'Moving to EVALUATE',
    data: { from: 'EXPLORE', to: 'EVALUATE' },
  },
  {
    timestamp: '2026-04-09T10:10:00.000Z',
    skill: 'harness-brainstorming',
    type: 'phase_transition',
    summary: 'Moving to VALIDATE',
    data: { from: 'EVALUATE', to: 'VALIDATE' },
  },
  {
    timestamp: '2026-04-09T10:15:00.000Z',
    skill: 'harness-brainstorming',
    type: 'handoff',
    summary: 'Handing off to planning',
    data: { fromSkill: 'harness-brainstorming', toSkill: 'harness-planning' },
  },
];

describe('adoption-tracker', { timeout: 30000 }, () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'adoption-tracker-'));
    writeFileSync(join(tmpDir, 'package.json'), '{"type":"module"}\n');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates adoption.jsonl with one record per skill', () => {
    writeEventsJsonl(tmpDir, SAMPLE_EVENTS);
    const input = JSON.stringify({ session_id: 'session-001' });
    const result = runHook(input, tmpDir);
    expect(result.exitCode).toBe(0);

    const records = readAdoptionRecords(tmpDir);
    expect(records).toHaveLength(1);
    const record = records[0] as Record<string, unknown>;
    expect(record).toHaveProperty('skill', 'harness-brainstorming');
    expect(record).toHaveProperty('session', 'session-001');
    expect(record).toHaveProperty('outcome', 'completed');
    expect(record).toHaveProperty('phasesReached');
    expect((record.phasesReached as string[]).sort()).toEqual(
      ['EVALUATE', 'EXPLORE', 'VALIDATE'].sort()
    );
  });

  it('derives outcome=completed when handoff is present', () => {
    writeEventsJsonl(tmpDir, SAMPLE_EVENTS);
    const result = runHook(JSON.stringify({ session_id: 'test' }), tmpDir);
    expect(result.exitCode).toBe(0);

    const records = readAdoptionRecords(tmpDir);
    expect((records[0] as Record<string, unknown>).outcome).toBe('completed');
  });

  it('derives outcome=failed when error is present', () => {
    const events = [
      {
        timestamp: '2026-04-09T10:00:00.000Z',
        skill: 'harness-execution',
        type: 'phase_transition',
        summary: 'Starting PREPARE',
        data: { from: 'init', to: 'PREPARE' },
      },
      {
        timestamp: '2026-04-09T10:05:00.000Z',
        skill: 'harness-execution',
        type: 'error',
        summary: 'Test failures exceeded threshold',
      },
    ];
    writeEventsJsonl(tmpDir, events);
    const result = runHook(JSON.stringify({ session_id: 'test' }), tmpDir);
    expect(result.exitCode).toBe(0);

    const records = readAdoptionRecords(tmpDir);
    expect(records).toHaveLength(1);
    expect((records[0] as Record<string, unknown>).outcome).toBe('failed');
  });

  it('derives outcome=abandoned when no handoff, no final phase, no error', () => {
    const events = [
      {
        timestamp: '2026-04-09T10:00:00.000Z',
        skill: 'harness-planning',
        type: 'phase_transition',
        summary: 'Starting SCOPE',
        data: { from: 'init', to: 'SCOPE' },
      },
    ];
    writeEventsJsonl(tmpDir, events);
    const result = runHook(JSON.stringify({ session_id: 'test' }), tmpDir);
    expect(result.exitCode).toBe(0);

    const records = readAdoptionRecords(tmpDir);
    expect(records).toHaveLength(1);
    expect((records[0] as Record<string, unknown>).outcome).toBe('abandoned');
  });

  it('derives duration from first to last event', () => {
    writeEventsJsonl(tmpDir, SAMPLE_EVENTS);
    const result = runHook(JSON.stringify({ session_id: 'test' }), tmpDir);
    expect(result.exitCode).toBe(0);

    const records = readAdoptionRecords(tmpDir);
    const record = records[0] as Record<string, unknown>;
    // 10:00 to 10:15 = 15 minutes = 900000ms
    expect(record.duration).toBe(900000);
  });

  it('handles multiple skills in one session', () => {
    const events = [
      ...SAMPLE_EVENTS,
      {
        timestamp: '2026-04-09T11:00:00.000Z',
        skill: 'harness-execution',
        type: 'phase_transition',
        summary: 'Starting PREPARE',
        data: { from: 'init', to: 'PREPARE' },
      },
      {
        timestamp: '2026-04-09T11:30:00.000Z',
        skill: 'harness-execution',
        type: 'error',
        summary: 'Build failed',
      },
    ];
    writeEventsJsonl(tmpDir, events);
    const result = runHook(JSON.stringify({ session_id: 'test' }), tmpDir);
    expect(result.exitCode).toBe(0);

    const records = readAdoptionRecords(tmpDir);
    expect(records).toHaveLength(2);
    const skills = (records as Array<Record<string, unknown>>).map((r) => r.skill);
    expect(skills).toContain('harness-brainstorming');
    expect(skills).toContain('harness-execution');
  });

  it('exits 0 when events.jsonl is missing', () => {
    // No events.jsonl created
    const result = runHook(JSON.stringify({ session_id: 'test' }), tmpDir);
    expect(result.exitCode).toBe(0);
    expect(readAdoptionRecords(tmpDir)).toHaveLength(0);
  });

  it('exits 0 when events.jsonl is empty', () => {
    mkdirSync(join(tmpDir, '.harness'), { recursive: true });
    writeFileSync(join(tmpDir, '.harness', 'events.jsonl'), '');
    const result = runHook(JSON.stringify({ session_id: 'test' }), tmpDir);
    expect(result.exitCode).toBe(0);
    expect(readAdoptionRecords(tmpDir)).toHaveLength(0);
  });

  it('exits 0 when events.jsonl contains only malformed lines', () => {
    mkdirSync(join(tmpDir, '.harness'), { recursive: true });
    writeFileSync(join(tmpDir, '.harness', 'events.jsonl'), 'not json\nalso bad\n');
    const result = runHook(JSON.stringify({ session_id: 'test' }), tmpDir);
    expect(result.exitCode).toBe(0);
    expect(readAdoptionRecords(tmpDir)).toHaveLength(0);
  });

  it('skips when adoption.enabled is false', () => {
    writeEventsJsonl(tmpDir, SAMPLE_EVENTS);
    writeFileSync(
      join(tmpDir, 'harness.config.json'),
      JSON.stringify({ adoption: { enabled: false } })
    );
    const result = runHook(JSON.stringify({ session_id: 'test' }), tmpDir);
    expect(result.exitCode).toBe(0);
    expect(readAdoptionRecords(tmpDir)).toHaveLength(0);
  });

  it('runs when adoption.enabled is true', () => {
    writeEventsJsonl(tmpDir, SAMPLE_EVENTS);
    writeFileSync(
      join(tmpDir, 'harness.config.json'),
      JSON.stringify({ adoption: { enabled: true } })
    );
    const result = runHook(JSON.stringify({ session_id: 'test' }), tmpDir);
    expect(result.exitCode).toBe(0);
    expect(readAdoptionRecords(tmpDir)).toHaveLength(1);
  });

  it('runs when harness.config.json is missing (default: enabled)', () => {
    writeEventsJsonl(tmpDir, SAMPLE_EVENTS);
    const result = runHook(JSON.stringify({ session_id: 'test' }), tmpDir);
    expect(result.exitCode).toBe(0);
    expect(readAdoptionRecords(tmpDir)).toHaveLength(1);
  });

  it('exits 0 on empty stdin', () => {
    const result = runHook('', tmpDir);
    expect(result.exitCode).toBe(0);
  });

  it('exits 0 on malformed stdin', () => {
    const result = runHook('not json', tmpDir);
    expect(result.exitCode).toBe(0);
  });

  it('appends to existing adoption.jsonl', () => {
    writeEventsJsonl(tmpDir, SAMPLE_EVENTS);
    // First run
    runHook(JSON.stringify({ session_id: 'session-001' }), tmpDir);
    // Second run (re-write events to simulate new session)
    writeEventsJsonl(tmpDir, [
      {
        timestamp: '2026-04-09T12:00:00.000Z',
        skill: 'harness-execution',
        type: 'phase_transition',
        summary: 'Starting',
        data: { from: 'init', to: 'EXECUTE' },
      },
    ]);
    runHook(JSON.stringify({ session_id: 'session-002' }), tmpDir);

    const records = readAdoptionRecords(tmpDir) as Array<Record<string, unknown>>;
    expect(records).toHaveLength(2);
    expect(records[0].session).toBe('session-001');
    expect(records[1].session).toBe('session-002');
  });

  it('ignores irrelevant event types (decision, checkpoint)', () => {
    const events = [
      {
        timestamp: '2026-04-09T10:00:00.000Z',
        skill: 'harness-planning',
        type: 'decision',
        summary: 'Chose option A',
      },
      {
        timestamp: '2026-04-09T10:05:00.000Z',
        skill: 'harness-planning',
        type: 'checkpoint',
        summary: 'Human verify',
      },
    ];
    writeEventsJsonl(tmpDir, events);
    const result = runHook(JSON.stringify({ session_id: 'test' }), tmpDir);
    expect(result.exitCode).toBe(0);
    // No relevant event types => no records
    expect(readAdoptionRecords(tmpDir)).toHaveLength(0);
  });
});
```

2. Run test: `cd packages/cli && npx vitest run tests/hooks/adoption-tracker.test.ts`
3. Observe: all tests pass
4. Run: `harness validate`
5. Commit: `test(hooks): add integration tests for adoption-tracker hook`

---

### Task 3: Register adoption-tracker in hook profiles

**Depends on:** Task 1
**Files:** `packages/cli/src/hooks/profiles.ts`

1. Modify `packages/cli/src/hooks/profiles.ts` -- add adoption-tracker entry to `HOOK_SCRIPTS` array, after cost-tracker:

```typescript
// In HOOK_SCRIPTS array, add after the cost-tracker line:
  { name: 'adoption-tracker', event: 'Stop', matcher: '*', minProfile: 'standard' },
```

The full updated `HOOK_SCRIPTS` array becomes:

```typescript
export const HOOK_SCRIPTS: HookScript[] = [
  { name: 'block-no-verify', event: 'PreToolUse', matcher: 'Bash', minProfile: 'minimal' },
  { name: 'protect-config', event: 'PreToolUse', matcher: 'Write|Edit', minProfile: 'standard' },
  { name: 'quality-gate', event: 'PostToolUse', matcher: 'Edit|Write', minProfile: 'standard' },
  { name: 'pre-compact-state', event: 'PreCompact', matcher: '*', minProfile: 'standard' },
  { name: 'adoption-tracker', event: 'Stop', matcher: '*', minProfile: 'standard' },
  { name: 'cost-tracker', event: 'Stop', matcher: '*', minProfile: 'strict' },
  { name: 'sentinel-pre', event: 'PreToolUse', matcher: '*', minProfile: 'strict' },
  { name: 'sentinel-post', event: 'PostToolUse', matcher: '*', minProfile: 'strict' },
];
```

2. Run: `harness validate`
3. Commit: `feat(hooks): register adoption-tracker in standard profile`

---

### Task 4: Update profile tests for new hook count

**Depends on:** Task 3
**Files:** `packages/cli/tests/commands/hooks.test.ts`, `packages/cli/tests/hooks/hooks-cli-integration.test.ts`, `packages/cli/tests/hooks/profiles.test.ts`

1. Modify `packages/cli/tests/commands/hooks.test.ts`:

   Each hook gets its own entry in the `hooks[event]` array (see `buildSettingsHooks` in `packages/cli/src/commands/hooks/init.ts:42-49`). So `hooks.Stop` will have separate entries per hook.
   - Line 34: Change description from `'builds standard profile with 4 hooks across 3 events'` to `'builds standard profile with 5 hooks across 4 events'`.
   - Line 39: Change `expect(hooks.Stop).toBeUndefined()` to `expect(hooks.Stop).toHaveLength(1)`.
   - Add after line 39: `expect(hooks.Stop[0].hooks[0].command).toContain('adoption-tracker.js');`
   - Line 42: Change description from `'builds strict profile with all 7 hooks across 4 events'` to `'builds strict profile with all 8 hooks across 4 events'`.
   - Line 47: Change `expect(hooks.Stop).toHaveLength(1)` to `expect(hooks.Stop).toHaveLength(2)`.
   - Line 48: Change `expect(hooks.Stop[0].hooks[0].command).toContain('cost-tracker.js')` to `expect(hooks.Stop[0].hooks[0].command).toContain('adoption-tracker.js')` (adoption-tracker is index 0 because it has minProfile `standard`, appearing before cost-tracker which has minProfile `strict`). Add: `expect(hooks.Stop[1].hooks[0].command).toContain('cost-tracker.js');`
   - Line 163: Change `expect(result.hooks).toHaveLength(7)` to `expect(result.hooks).toHaveLength(8)`.

2. Modify `packages/cli/tests/hooks/hooks-cli-integration.test.ts`:
   - Line 42 (standard profile `listResult.hooks`): Change `toHaveLength(4)` to `toHaveLength(5)`.
   - Line 79: Change `expect(strictList.hooks).toHaveLength(7)` to `toHaveLength(8)`.
   - Line 85: Update Stop hook length assertion based on grouping behavior (see note above).

3. Modify `packages/cli/tests/hooks/profiles.test.ts`:
   - Line 20: After `expect(PROFILES.standard).not.toContain('cost-tracker')`, add: `expect(PROFILES.standard).toContain('adoption-tracker');`
   - Line 41: Change `expect(HOOK_SCRIPTS).toHaveLength(7)` to `expect(HOOK_SCRIPTS).toHaveLength(8)`.

4. Run tests: `cd packages/cli && npx vitest run tests/commands/hooks.test.ts tests/hooks/hooks-cli-integration.test.ts tests/hooks/profiles.test.ts`
5. Observe: all tests pass
6. Run: `harness validate`
7. Commit: `test(hooks): update profile test expectations for adoption-tracker hook`

---

### Task 5: End-to-end validation

[checkpoint:human-verify]
**Depends on:** Tasks 1-4
**Files:** none (validation only)

1. Run full hook test suite: `cd packages/cli && npx vitest run tests/hooks/`
2. Run full CLI test suite: `cd packages/cli && npx vitest run`
3. Run: `harness validate`
4. Verify: all tests pass, no regressions
5. If any test fails, diagnose and fix before proceeding

## Traceability

| Observable Truth                                | Delivered By                                                                           |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1. One record per skill                         | Task 1 (hook logic), Task 2 (test: "creates adoption.jsonl with one record per skill") |
| 2. Missing/malformed/empty events.jsonl exits 0 | Task 1 (hook error handling), Task 2 (tests: missing, empty, malformed)                |
| 3. Config opt-out                               | Task 1 (isAdoptionEnabled), Task 2 (tests: enabled/disabled/missing config)            |
| 4. Always exits 0                               | Task 1 (all catch blocks exit 0), Task 2 (tests: exits 0 on all error paths)           |
| 5. Correct outcome derivation                   | Task 1 (deriveOutcome), Task 2 (tests: completed, failed, abandoned)                   |
| 6. Correct phasesReached                        | Task 1 (derivePhasesReached), Task 2 (test: phasesReached array)                       |
| 7. Correct duration                             | Task 1 (deriveDuration), Task 2 (test: 15min = 900000ms)                               |
| 8. Reader/aggregator compatibility              | Task 2 (records parse as valid JSON with required fields)                              |
| 9. Registered in profiles                       | Task 3 (profiles.ts modification)                                                      |
| 10. Tests pass                                  | Task 2, Task 5                                                                         |
| 11. harness validate passes                     | Task 5                                                                                 |
