# Adoption & Usage Telemetry

**Keywords:** adoption, telemetry, skill-invocation, metrics, jsonl, dashboard, cli, local-first

## Overview

Adoption & Usage Telemetry provides visibility into which harness skills are being used, how often, and with what outcomes. It answers "what's getting traction?" for both maintainers prioritizing the roadmap and end users understanding their own workflow patterns.

All data is local-only — written to `.harness/metrics/adoption.jsonl`, no network, no external reporting.

### Goals

1. Track skill invocations with name, duration, outcome, and phases reached
2. Store telemetry locally in `.harness/metrics/adoption.jsonl`
3. Surface data via `harness adoption` CLI commands and a dashboard page/section
4. On by default, opt-out via `harness.config.json`
5. Follow the established cost-tracker hook pattern

### Non-Goals (v1)

- CLI command invocation tracking
- Config feature adoption tracking
- Skill chaining / workflow pattern analysis
- Cross-project or team-level aggregation
- Network-based telemetry or external reporting

## Decisions

| #   | Decision             | Choice                            | Rationale                                                                                       |
| --- | -------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | Audience             | Both maintainers and end users    | Local data serves both; maintainer sees what's adopted, user sees their own patterns            |
| 2   | v1 scope             | Skill invocations only            | Focused signal, lowest effort, extensible to commands/config later                              |
| 3   | Surfaces             | CLI + Dashboard                   | CLI mirrors `harness usage` pattern; dashboard gather/collector is low marginal effort          |
| 4   | Storage              | `.harness/metrics/adoption.jsonl` | Follows `costs.jsonl` precedent — one concern per JSONL file, independent retention             |
| 5   | Opt-in model         | On by default, opt-out            | Local-only data, same posture as cost-tracker, no privacy concern                               |
| 6   | Collection mechanism | Stop hook reading `events.jsonl`  | Proven pattern, zero risk to dispatch hot path, post-session is fine for CLI/dashboard surfaces |

## Technical Design

### Data Model

```typescript
// packages/types/src/adoption.ts

interface SkillInvocationRecord {
  skill: string; // skill name (e.g., "harness-brainstorming")
  session: string; // session ID
  startedAt: string; // ISO 8601
  duration: number; // milliseconds
  outcome: 'completed' | 'failed' | 'abandoned';
  phasesReached: string[]; // e.g., ["explore", "evaluate", "prioritize", "validate"]
  tier: number; // skill tier (1/2/3)
  trigger: string; // how invoked: "manual", "on_new_feature", "dispatch", etc.
}

interface SkillAdoptionSummary {
  skill: string;
  invocations: number;
  successRate: number; // 0-1
  avgDuration: number; // milliseconds
  lastUsed: string; // ISO 8601
  tier: number;
}

interface AdoptionSnapshot {
  period: string; // "daily" | "weekly" | "all-time"
  totalInvocations: number;
  uniqueSkills: number;
  topSkills: SkillAdoptionSummary[];
  generatedAt: string;
}
```

### Storage

- **File:** `.harness/metrics/adoption.jsonl`
- **Format:** One `SkillInvocationRecord` per line, JSON, append-only
- **Concurrency:** Each record written via a single `appendFileSync` call with newline terminator — safe under concurrent sessions (atomic line writes on POSIX)
- **Retention:** No rotation in v1. ~200 bytes per invocation — years of use before size matters.
- **Git:** Ignored via `.harness/.gitignore` (`metrics/` entry)

### Hook: `adoption-tracker.js`

- **Event:** `Stop` (fires at session end, same as cost-tracker)
- **Reads:** `.harness/events.jsonl` for the current session
- **Filters for:** `phase_transition`, `gate_result`, `handoff`, and `error` event types
- **Groups** events by `skill` field to reconstruct invocations
- **Derives `outcome`:** has `handoff` or final phase → `completed`; has `error` → `failed`; otherwise → `abandoned`
- **Derives `phasesReached`:** from `phase_transition` events
- **Derives `duration`:** from first to last event timestamp per skill
- **Writes:** Appends records to `.harness/metrics/adoption.jsonl`
- **Failure mode:** Silent — telemetry never blocks session teardown
- **Config check:** Reads `harness.config.json` `adoption.enabled`; skips if `false`

### Core Module: `packages/core/src/adoption/`

```
adoption/
  types.ts        — re-exports from packages/types
  reader.ts       — reads and parses adoption.jsonl (mirrors jsonl-reader.ts)
  aggregator.ts   — aggregateBySkill(), aggregateByDay(), topSkills(n)
  index.ts        — public API
```

Follows the same pattern as `packages/core/src/usage/` (jsonl-reader.ts, aggregator.ts).

### CLI Commands: `packages/cli/src/commands/adoption.ts`

| Command                         | Output                                                              |
| ------------------------------- | ------------------------------------------------------------------- |
| `harness adoption skills`       | Top skills by invocation count, success rate, avg duration          |
| `harness adoption recent`       | Last N skill invocations with outcome and duration                  |
| `harness adoption skill <name>` | Detail for one skill: invocations over time, phase completion rates |

All commands support `--json` flag for machine-readable output.

### Dashboard Integration

- **Gather collector:** `packages/dashboard/src/server/gather/adoption.ts`
- **Reads:** `adoption.jsonl` via core aggregator, returns `AdoptionSnapshot`
- **API route:** `/api/adoption`
- **UI:** New section on overview page or dedicated `/adoption` route
- **Reuses:** Existing gather cache + SSE streaming patterns

### Config

```json
{
  "adoption": {
    "enabled": true
  }
}
```

Added to `harness.config.json` schema. Default: `true`.

### New Files

```
packages/types/src/adoption.ts
packages/core/src/adoption/reader.ts
packages/core/src/adoption/aggregator.ts
packages/core/src/adoption/index.ts
packages/cli/src/hooks/adoption-tracker.js
packages/cli/src/commands/adoption.ts
packages/dashboard/src/server/gather/adoption.ts
```

## Success Criteria

1. After a session that invokes at least one skill, `.harness/metrics/adoption.jsonl` contains a `SkillInvocationRecord` for each skill invoked
2. If `events.jsonl` is missing, malformed, or empty, the hook exits without error and does not block session teardown
3. Setting `adoption.enabled: false` in `harness.config.json` prevents the hook from writing records
4. `harness adoption skills` displays top skills sorted by invocation count with success rate and avg duration
5. `harness adoption recent` displays last 20 skill invocations with skill name, outcome, and duration
6. `harness adoption skill <name>` displays invocation history and phase completion rates for a single skill
7. All three CLI commands produce valid JSON when `--json` is passed
8. `/api/adoption` endpoint returns an `AdoptionSnapshot` with top skills and totals
9. Adoption data appears on the dashboard (overview section or dedicated page)
10. Records written by the hook parse correctly through `reader.ts` and aggregate correctly through `aggregator.ts`
11. The skill dispatcher is unmodified — zero risk to existing skill execution
12. Multiple sessions appending to `adoption.jsonl` simultaneously do not corrupt the file (atomic `appendFileSync` per record)
13. `harness validate` passes after all changes

## Implementation Order

### Phase 1: Types & Core Module

- Define `SkillInvocationRecord`, `SkillAdoptionSummary`, `AdoptionSnapshot` in `packages/types/src/adoption.ts`
- Implement `reader.ts` and `aggregator.ts` in `packages/core/src/adoption/`
- Unit tests for reader (parsing, malformed lines, empty file) and aggregator (grouping, sorting, rates)

### Phase 2: Hook

- Implement `adoption-tracker.js` in `packages/cli/src/hooks/`
- Read `events.jsonl`, reconstruct skill invocations, append to `adoption.jsonl`
- Single `appendFileSync` per record (atomic line writes, safe under concurrent sessions)
- Respect `adoption.enabled` config flag
- Silent failure on all error paths
- Integration test: mock events.jsonl → verify adoption.jsonl output

### Phase 3: CLI Commands

- Implement `harness adoption skills`, `recent`, `skill <name>` in `packages/cli/src/commands/adoption.ts`
- Wire into CLI command registry
- Support `--json` flag
- Manual test: invoke skills, end session, query adoption data

### Phase 4: Dashboard

- Implement `gather/adoption.ts` collector
- Add API route (`/api/adoption`)
- Add dashboard UI section (overview page or dedicated page)
- Wire into gather cache and SSE streaming

### Phase 5: Config & Hook Registration

- Add `adoption` section to `harness.config.json` schema
- Register hook in standard/strict profiles (or always-on like cost-tracker)
