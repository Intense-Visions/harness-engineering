# Structured Event Log

**Parent:** [Claude-Mem Pattern Adoption](../proposal.md)
**Keywords:** event-log, jsonl, skill-lifecycle, phase-transition, gate-result, observation-capture

## Overview

An append-only structured event log capturing skill lifecycle moments, inspired by claude-mem's observation capture system but scoped to high-signal events (phase transitions, decisions, gate results, handoffs) rather than every tool use.

## Problem

Skills only persist what they explicitly call `appendLearning` for. Phase transitions, gate results, decisions, and handoffs happen but aren't captured in a queryable, structured format. Context is lost between sessions, and skills that resume work can't see the full timeline of what happened.

## Design

### Event Schema

```typescript
interface SkillEvent {
  timestamp: string; // ISO 8601
  skill: string; // e.g. "harness-execution"
  session?: string; // session slug if scoped
  type:
    | 'phase_transition' // skill moved between phases
    | 'decision' // design or implementation decision recorded
    | 'gate_result' // mechanical gate check completed
    | 'handoff' // inter-skill handoff written
    | 'error' // recoverable error encountered
    | 'checkpoint'; // explicit save point
  summary: string; // one-line human-readable description
  data?: Record<string, unknown>; // type-specific payload
  refs?: string[]; // file paths, URLs, or entry IDs
  contentHash?: string; // for dedup (reuses content-deduplication logic)
}
```

### Type-Specific Payloads

**phase_transition:**

```json
{ "from": "PREPARE", "to": "EXECUTE", "taskCount": 12 }
```

**decision:**

```json
{ "what": "Use polling over WebSocket", "why": "Simpler, sufficient for current requirements" }
```

**gate_result:**

```json
{
  "passed": true,
  "checks": [
    { "name": "test", "passed": true },
    { "name": "lint", "passed": false }
  ]
}
```

**handoff:**

```json
{
  "fromSkill": "harness-brainstorming",
  "toSkill": "harness-planning",
  "artifacts": ["docs/changes/foo/proposal.md"]
}
```

### Storage

- **File format:** JSONL (one JSON object per line) — append-only, crash-safe, streamable
- **Global events:** `.harness/events.jsonl`
- **Session events:** `.harness/sessions/<slug>/events.jsonl`
- **Deduplication:** Content hash computed from `{skill, type, summary, session}` tuple. Duplicate within same session → skip write.

### Emission Points

Skills instrument at natural lifecycle points — no new hooks needed:

| Existing function                                       | Event type emitted |
| ------------------------------------------------------- | ------------------ |
| Skill phase transition (internal)                       | `phase_transition` |
| `manage_state` action `learn` (when tagged as decision) | `decision`         |
| `runMechanicalGate` completion                          | `gate_result`      |
| `saveHandoff`                                           | `handoff`          |
| Skill error recovery                                    | `error`            |
| Explicit `saveState` at checkpoint                      | `checkpoint`       |

### Integration with gather_context

`gather_context` gains an `includeEvents` option:

- Default: `true` for session-scoped context, `false` for global
- Loads most recent N events (default: 20) for the current session
- Formats as a compact timeline:

```
## Recent Events
- 10:30 [harness-execution] phase: PREPARE → EXECUTE (12 tasks)
- 10:45 [harness-execution] gate: passed (test ✓, lint ✓, typecheck ✓)
- 11:02 [harness-execution] decision: Use polling over WebSocket
```

### New Function

```typescript
// packages/core/src/state/events.ts
emitEvent(projectPath: string, event: Omit<SkillEvent, 'timestamp' | 'contentHash'>, options?: {
  session?: string
  stream?: string
}): Promise<Result<{ written: boolean, reason?: string }>>
```

Returns `{ written: false, reason: "duplicate" }` if content hash already exists in current session's event log.

## Success Criteria

1. Skills that transition phases emit a `phase_transition` event to events.jsonl without explicit instrumentation beyond calling existing lifecycle functions
2. `gather_context` with `includeEvents: true` returns the most recent N events for the current session, formatted as a timeline
3. Events are born deduplicated — emitting the same event twice (same skill, type, summary) within a session writes only one entry
4. Event log is append-only and crash-safe — partial writes don't corrupt the file (JSONL format guarantees line-level atomicity)

## Implementation Order

1. Define `SkillEvent` schema and implement `emitEvent` function in `packages/core/src/state/events.ts`
2. Implement events.jsonl append with session scoping and JSONL formatting
3. Wire dedup from content-deduplication sub-spec into event emission
4. Instrument existing skill lifecycle points (phase transitions, gates, handoffs)
5. Integrate event retrieval and timeline formatting into `gather_context`
