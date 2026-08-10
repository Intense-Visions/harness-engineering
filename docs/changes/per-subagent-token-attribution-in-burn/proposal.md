# Per-subagent token attribution in burn

**Keywords:** burn, transcripts, subagents, attribution, token-accounting, fleet-lanes, degradation, jsonl, requestId, store-migration

## Overview

`burn` already reads every Claude Code transcript on this machine, dedupes assistant turns by
`requestId`, and rolls the result into a weekly spend summary. It already walks into
`~/.claude/projects/<project>/<sessionId>/subagents/` — `listTranscripts()` recurses over any
`.jsonl` under the projects root (`packages/burn/src/scan.ts:17-34`) — so subagent spend is
already counted in the pooled totals. What is thrown away is _whose_ spend it was:
`toRecord()` keeps `requestId`, `timestamp`, `message.model` and the `usage` block, and drops
every other field on the line (`packages/burn/src/scan.ts:59-85`).

Each subagent transcript line carries the identity fields we need. Verified against a live
transcript on this machine
(`~/.claude/projects/-Users-cwarner-Projects-harness-engineering/08f91f8c-.../subagents/agent-a6bbff57161b6ebb2.jsonl`):

```jsonc
{
  "isSidechain": true,
  "agentId": "a6bbff57161b6ebb2",
  "attributionAgent": "harness-task-executor",
  "requestId": "req_011CdqHdsQc8afpLz69VgRJ4",
  "sessionId": "08f91f8c-15e9-407a-a4fc-0d47189aa0e7",
  "timestamp": "2026-08-08T12:33:13.111Z",
  "message": { "model": "…", "usage": { … } },
}
```

Main-thread lines carry `isSidechain: false` and no `attributionAgent` (they carry
`attributionSkill` / `attributionPlugin` instead), so the two populations are separable on the
line itself.

This change adds a grouping key to a scan that already runs. It does not add a scan, a file
walk, a network call, or a new data source.

### Goals

1. `harness burn report` shows where the week's units went **by agent**, not only by model.
2. The per-record store carries the agent identity, so per-lane cost analysis is possible
   without re-reading transcripts.
3. Subagent spend whose identity cannot be read is reported as **`unattributed` units**, never
   as zero and never silently folded into the main thread.
4. `fleet-command`'s claim that subagent tokens "are not observable" is corrected in the shipped
   skill body and its generated command files.

### Non-goals

- **A token governor.** This change measures; it does not gate dispatch. Attribution is
  retrospective (it reads transcripts a subagent has already written), so it cannot be a
  pre-flight admission control, and nothing here claims otherwise.
- **Cross-machine or cross-device attribution.** `burn` is explicitly THIS MACHINE ONLY
  (`packages/cli/src/commands/burn/report.ts:210`); that boundary is unchanged.
- **A statusline agent segment.** The statusline repaints against a ~0.11s budget and a narrow
  width; an extra segment buys little and costs the one surface where cost is real.
- **A new `harness burn agents` subcommand.** The report already has a "by model" section; "by
  agent" belongs beside it.
- **Backfilling identity for records whose transcript is gone.** Those rows stay honestly
  `unattributed`.

## Assumptions

- **Runtime:** Node.js (the package already reads transcripts with `node:fs` and `node:path`);
  transcripts are UTF-8 JSONL under `~/.claude/projects`.
- **The identity fields are undocumented Claude Code internals.** `isSidechain`, `agentId` and
  `attributionAgent` are not a published contract and may be renamed or removed by any Claude
  Code release. This is the assumption the two-signal shape assertion exists to survive; it is
  stated here so that "attribution stopped working" is read as an expected failure mode rather
  than a bug in this package.
- **Main-thread lines never carry `attributionAgent`.** Verified on this machine: recent
  non-`subagents/` transcripts carry `attributionSkill` / `attributionPlugin` /
  `attributionMcpServer` but no `attributionAgent`, so the first classification rule cannot
  mislabel main-thread spend as a subagent.
- **`agentId` is unique per dispatch** within the retained transcript window. Lane counts are
  distinct-`agentId` counts, so a reused id would undercount lanes.
- **Neither new column can contain a tab or newline.** `usage.tsv` is tab-delimited with one
  record per line (`store.ts:196-202`); an `attributionAgent` or `agentId` value containing
  either would produce a row with the wrong field count, which `readRecords` then discards.
  Observed values are agent slugs (`harness-task-executor`) and hex ids.

## Decisions

| Decision                | Choice                                                                                                                   | Rationale                                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Attribution key         | `attributionAgent` for the label; `agentId` retained as the **lane** key                                                 | The issue asks for per-subagent _and_ per-fleet-lane attribution. `attributionAgent` is the agent _type_ (`harness-task-executor`); `agentId` is the individual dispatch — one fleet lane. Storing both is what makes a lane count computable at all. |
| Label vocabulary        | `main` \| `<attributionAgent>` \| `unattributed`                                                                          | Three states that are each true statements: the main thread, a named subagent, and "this was subagent spend whose identity we could not read". A missing label must never collapse into `main` — that would understate lanes and overstate the human. |
| Shape assertion         | A line is subagent spend if `isSidechain === true` **or** its file sits under a `subagents/` path segment                | Two independent signals for one undocumented fact. If Claude Code drops `isSidechain`, the path still classifies; if it moves the directory, the flag still classifies. Both must change at once before classification degrades.                     |
| Degradation             | Subagent spend with no readable `attributionAgent` is labelled `unattributed` and **still counted**                       | The requirement in the issue: a CLI update must not be able to report a fleet run as free. Units land in a visible bucket rather than vanishing.                                                                                                    |
| Degradation _detection_ | Derived store-wide at summary time (`unattributed > 0 && attributed === 0` → `degraded`), not counted per scan            | Scans are incremental — an unchanged file is not re-read (`scan.ts:151-156`), so a per-scan counter would report "0 subagent files" on a quiet scan and read as an all-clear. The store is the only complete population.                            |
| Store format            | Widen `usage.tsv` from 7 to 9 columns (`+agent`, `+agentId`); version the fingerprint header and force one full rescan    | `readRecords` discards any row without exactly 7 fields (`store.ts:183`), so a silent widening would delete the entire store. An explicit version bump makes the migration a stated event rather than a data-loss incident.                          |
| Legacy rows             | Read 7-column rows as `agent: 'unattributed'`, and let a later scan **upgrade** an `unattributed` row to a real label      | Pure first-write-wins would pin every pre-migration row to `unattributed` forever even though its transcript is still on disk. One narrow upgrade rule (only `unattributed` → named) keeps dedup honest and heals the store on the first rescan.     |
| Surface                 | `agents` + `attribution` blocks in `state/summary.json`; a "by agent" section in `harness burn report`                    | Same shape as the existing `models` block, so an existing consumer reads it without learning a second idiom. Additive keys only — the snake_case wire contract is load-bearing (`packages/burn/src/types.ts:1-9`).                                  |
| `fleet-command` prose   | Replace the false claim, keep the design conclusion                                                                       | The governor still meters slots, but for a different and true reason: attribution is retrospective and machine-local, so it cannot gate a dispatch before it happens. The rationalization row stays useful; only its false premise is removed.       |

## Technical Design

### Types (`packages/burn/src/types.ts`)

```ts
/** One deduped assistant turn, keyed by `requestId` in the store. */
export interface UsageRecord {
  ts: string;
  model: string;
  out: number;
  in: number;
  cacheWrite: number;
  cacheRead: number;
  /** `main`, a subagent's `attributionAgent`, or `unattributed`. Never empty. */
  agent: string;
  /** The dispatch this turn belonged to — one fleet lane. Empty for the main thread. */
  agentId: string;
}

export interface AgentBlock {
  requests: number;
  units: number;
  pct_of_week: number;
  /**
   * Distinct non-empty `agentId`s seen this week under this label. `main` records carry an
   * empty `agentId`, so the empty id is excluded from the count and `main` reports 0.
   */
  lanes: number;
}

export interface AttributionBlock {
  attributed_units: number;
  main_units: number;
  unattributed_units: number;
  lanes: number;
  /**
   * True when subagent spend was seen this week and NONE of it carried a readable
   * agent label — the transcript shape changed and attribution is no longer working.
   */
  degraded: boolean;
}
```

`Summary` gains two additive keys: `agents: Record<string, AgentBlock>` and
`attribution: AttributionBlock`.

### Classification (`packages/burn/src/scan.ts`)

`toRecord(line, isSubagentFile)` gains one parameter — whether the file it came from lives under
a `subagents/` path segment — and returns the two new fields:

```
attributionAgent is a non-empty string  → agent = that value,   agentId = agentId ?? ''
isSidechain === true OR isSubagentFile  → agent = 'unattributed', agentId = agentId ?? ''
otherwise                               → agent = 'main',         agentId = ''
```

`parseTranscript` computes `isSubagentFile` once per file from the path and passes it down.

### Dedup with upgrade

`parseTranscript` currently skips any `requestId` already in the map. It gains one exception:

```
existing.agent === 'unattributed' && parsed.record.agent !== 'unattributed'
  → replace the record, count it as an upgrade (not an add)
```

This is what heals a store migrated from the 7-column format.

### Store (`packages/burn/src/store.ts`)

- `usage.tsv` rows become 9 tab-separated fields. `readRecords` accepts 7 (legacy →
  `agent: 'unattributed'`, `agentId: ''`) or 9; anything else is still discarded.
- `files.tsv` gains a `#version\t2` header line alongside the existing `#count`.
  `readFingerprints` returns `version`; `scan()` treats a missing or older version exactly the
  way it already treats a failed integrity gate — drop every fingerprint and re-read from source.
  The upgrade rule above then relabels each row whose transcript still exists.

### Rollup (`packages/burn/src/summary.ts`)

Inside the existing single pass over records (`summary.ts:109-134`), the `idx === 0` branch
gains an agent accumulator mirroring `perModel`, plus a `Set<string>` of `agentId`s per label.
`attribution` is derived from those totals. No extra pass, no extra read.

### Report (`packages/cli/src/commands/burn/report.ts`)

A new `agentsSection` rendered after `modelsSection`, following the same conventions (top N,
dim parenthetical, unit floor):

```
  by agent
  main                        41.2M  (58% of week)
  harness-task-executor       18.9M  (27% of week, 6 lanes)
  general-purpose              9.1M  (13% of week, 12 lanes)
  unattributed                 1.4M  (2% of week, 3 lanes)

  ⚠ 1.4M units of subagent spend could not be attributed to an agent.
```

`agentsSection` returns no lines when the summary carries no `agents` key, following the
`s.models ?? {}` / `s.models_exhausted ?? []` guards already in the file
(`report.ts:126`, `report.ts:142`) — a summary written before this change is read without
throwing, exactly as `modelsSection` tolerates one written before per-model rollup existed.

When `attribution.degraded` is true the caution is escalated to a red headline naming the
likely cause (the transcript shape changed), consistent with the package's existing rule that
degraded tooling is a headline, not a footnote.

### Skill prose (`agents/skills/*/fleet-command/SKILL.md`, 4 platform copies)

The rationalization row's Reality column becomes:

> Per-subagent token spend _is_ observable after the fact — each dispatched agent writes its own
> transcript, and the burn scanner attributes spend to it. What is not available is a pre-flight
> reservation: attribution is retrospective and machine-local, so it cannot refuse a dispatch
> before it happens. The budget governs slots, passes, fleets, and wall-clock because those are
> the levers that bind _before_ the spend, and says so.

The generated command files (`.gemini-extension/commands/fleet-command.toml`,
`.antigravity-extension/commands/fleet-command.toml`) are regenerated, not hand-edited.

## Integration Points

**Entry Points**

- `harness burn report` — new "by agent" section (no new command, no new flag).
- `state/summary.json` — two additive keys, `agents` and `attribution`.
- `@harness-engineering/burn` public types — `AgentBlock`, `AttributionBlock`, two new
  `UsageRecord` fields.

**Registrations Required**

- Slash-command / plugin manifest regeneration for the `fleet-command` prose edit
  (`.claude-plugin`, `.cursor-plugin`, `.gemini-extension`, `.antigravity-extension`).
- A changeset for `@harness-engineering/burn` and `@harness-engineering/cli`.
- No barrel-export change: `types.ts` is already re-exported from `src/index.ts`.

**Documentation Updates**

- `packages/burn/README.md` — an "Attribution" section stating what the labels mean and that
  `unattributed` is a real, counted bucket.
- `fleet-command` SKILL.md prose (the falsehood).

**Architectural Decisions** — None. This is a small, additive change to one package's grouping
key; no decision here binds a future design the way an ADR-worthy choice would.

**Knowledge Impact**

- The concept "subagent spend is observable post-hoc but not reservable pre-flight" is the
  durable fact this change establishes; it is what a future adaptive-model-routing design has to
  build on and what the corrected `fleet-command` prose now states.

## Success Criteria

1. **When** a scan reads a transcript under a `subagents/` directory whose line carries
   `attributionAgent`, **the system shall** store that value as the record's `agent` and the
   line's `agentId` as its `agentId`.
2. **When** a scan reads subagent spend whose line carries no `attributionAgent`, **the system
   shall** store the record with `agent = 'unattributed'` and still count its units.
3. **If** a line is not subagent spend, **then the system shall not** label it `unattributed` —
   it is labelled `main`.
4. **When** a summary is built, **the system shall** emit an `agents` block that partitions the
   week: every current-week record contributes to exactly one label, so the unrounded per-label
   unit totals sum to the unrounded `wtd.units` total. Because each block rounds independently
   (`summary.ts:209-211`, `summary.ts:285`), the published integers are asserted to within
   ±1 unit per label — never as an exact integer sum.
5. **When** subagent spend exists in the week and none of it carries a readable label, **the
   system shall** set `attribution.degraded = true`.
6. **When** `harness burn report` runs against a summary containing unattributed units, **the
   system shall** print those units as a visible caution line.
7. **When** a pre-migration 7-column `usage.tsv` is read, **the system shall** load every row
   (none discarded) with `agent = 'unattributed'`, and a subsequent scan of a still-present
   transcript **shall** upgrade that row to its real label.
8. **When** the fingerprint version is absent or older than 2, **the system shall** discard all
   fingerprints and re-read every transcript.
9. `harness-burn-hud`'s bin still imports nothing from `@harness-engineering/*`
   (`tests/bin-startup.test.ts` continues to pass).
10. No occurrence of the claim that subagent tokens "are not observable" remains in any shipped
    skill body or generated command file.
11. **When** `harness burn report` runs against a summary containing an `agents` block, **the
    system shall** print a "by agent" section listing each label with its units and percentage
    of the week, and **when** the summary carries no `agents` block **the system shall** print
    no such section and shall not error.

## Implementation Order

1. **Types + store** — `UsageRecord` fields, 9-column write, 7-or-9-column read, `#version`
   header, version-triggered full rescan. Tests for the migration path first.
2. **Classification** — `toRecord` / `parseTranscript` labelling and the `unattributed` upgrade
   rule, against fixture transcripts covering: named subagent, subagent with the field removed,
   main thread, and a `subagents/`-path file with no `isSidechain`.
3. **Rollup + report** — `agents` / `attribution` in `buildSummary`, `agentsSection` in the CLI
   report, degradation headline.
4. **Prose + docs** — `fleet-command` SKILL.md across the four platform copies, manifest
   regeneration, `packages/burn/README.md`, changeset.
