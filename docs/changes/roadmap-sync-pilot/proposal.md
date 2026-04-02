# Roadmap Sync, Auto-Pick, and Assignment

**Keywords:** roadmap-sync, tracker-adapter, assignment-affinity, auto-pick, priority-scoring, github-issues, split-authority, state-transition-hooks

## Overview & Goals

Extend the harness roadmap system with three capabilities:

1. **External tracker sync** — Bidirectional sync between `docs/roadmap.md` and external ticketing services (GitHub Issues first), with split authority: roadmap owns planning fields, external service owns execution/assignment fields. Sync fires on every state transition.

2. **Auto-pick pilot** — An AI-assisted mode that selects the next highest-impact unblocked item from the roadmap and routes to `harness:brainstorming` (no spec) or `harness:autopilot` (spec exists). Uses positional priority with optional priority override (when present, priority replaces position as the primary sort key), reads specs to assess impact.

3. **Assignment with affinity** — Assignee field on roadmap features plus an assignment history section in roadmap.md. Affinity-based routing prefers assigning work to whoever has context on related items or their blockers.

### Non-goals

- Linear or Jira adapters (future work, interface designed to support them)
- Full project management in roadmap.md (sprints, story points, epics)
- Real-time conflict resolution beyond the directional guard pattern
- Offline auto-pick (requires external service for coordination)

## Decisions

| #   | Decision                                                                                                         | Rationale                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | Split authority — roadmap owns planning, external owns execution/assignment                                      | Plays to each system's strengths; roadmap.md stays readable and git-tracked, external service handles real-time coordination |
| 2   | Abstract `TrackerSyncAdapter` interface, GitHub Issues first                                                     | Proves the interface with the simplest adapter; Jira/Linear follow the pattern                                               |
| 3   | Positional priority default + optional `Priority` override (when present, replaces position as primary sort key) | Works out of the box with existing roadmaps; power users can override ordering for urgent items                              |
| 4   | AI reads roadmap structure + spec content for next-item selection                                                | Good balance of context vs. cost; enough to reason about impact and effort                                                   |
| 5   | Assignee field + history section in roadmap.md                                                                   | Single file, no extra state; history enables affinity matching                                                               |
| 6   | Sync on every state transition                                                                                   | Keeps external service fresh for distributed coordination                                                                    |
| 7   | Affinity-based assignment — prefer context continuity                                                            | Same person works related items and their blockers, reducing ramp-up time                                                    |
| 8   | Layered extension approach                                                                                       | Builds on proven patterns, avoids new abstractions; sync service can be layered in later if needed                           |

## Technical Design

### 1. Data Model Extensions

**`RoadmapFeature` type** (in `packages/types/src/index.ts`):

```typescript
export interface RoadmapFeature {
  name: string;
  status: FeatureStatus;
  spec: string | null;
  plans: string[];
  blockedBy: string[];
  summary: string;
  assignee: string | null; // NEW — GitHub username, email, or display name
  priority: Priority | null; // NEW — optional override
  externalId: string | null; // NEW — e.g., "github:owner/repo#42"
}

export type Priority = 'P0' | 'P1' | 'P2' | 'P3';
```

**Assignment History section** in roadmap.md:

```markdown
## Assignment History

| Feature             | Assignee | Action    | Date       |
| ------------------- | -------- | --------- | ---------- |
| Core Library Design | @cwarner | completed | 2026-03-15 |
| Graph Connector     | @cwarner | assigned  | 2026-04-01 |
```

New types:

```typescript
export interface AssignmentRecord {
  feature: string;
  assignee: string;
  action: 'assigned' | 'completed' | 'unassigned';
  date: string; // ISO date
}
// Reassignment produces two records: 'unassigned' for the previous assignee,
// then 'assigned' for the new assignee. This preserves a complete audit trail.

export interface Roadmap {
  frontmatter: RoadmapFrontmatter;
  milestones: RoadmapMilestone[];
  assignmentHistory: AssignmentRecord[]; // NEW
}
```

### 2. Parse/Serialize Extensions

Extend `parseRoadmap` and `serializeRoadmap` in `packages/core/src/roadmap/`:

- Parse `Assignee`, `Priority`, and `External-ID` fields from feature blocks (em-dash = null, same as existing optional fields)
- **Parser sentinel:** `parseMilestones` must stop before `## Assignment History`. The parser splits on `## ` headings but must treat `## Assignment History` as a terminal sentinel, not a milestone. Content after this heading is routed to a dedicated `parseAssignmentHistory` function that reads the markdown table into `AssignmentRecord[]`.
- Serialize milestones first, then the assignment history table. Round-trip fidelity is preserved for feature fields; the existing `Milestone:` prefix normalization (strip on parse, omit on serialize) is a known behavior and not a regression.

Feature block becomes:

```markdown
### Core Library Design

- **Status:** in-progress
- **Spec:** docs/changes/core-library-design/proposal.md
- **Summary:** Design and implement core module structure
- **Blockers:** —
- **Plan:** docs/plans/2026-03-01-core-library-plan.md
- **Assignee:** @cwarner
- **Priority:** P1
- **External-ID:** github:harness-eng/harness#42
```

### 3. Tracker Sync Adapter Interface

New file `packages/core/src/roadmap/tracker-sync.ts`:

```typescript
export interface TrackerSyncAdapter {
  /** Push a new roadmap item to the external service */
  createTicket(feature: RoadmapFeature, milestone: string): Promise<Result<ExternalTicket>>;

  /** Update planning fields on an existing ticket */
  updateTicket(
    externalId: string,
    changes: Partial<RoadmapFeature>
  ): Promise<Result<ExternalTicket>>;

  /** Pull current assignment + status from external service */
  fetchTicketState(externalId: string): Promise<Result<ExternalTicketState>>;

  /** Fetch all tickets matching the configured labels (paginated) */
  fetchAllTickets(): Promise<Result<ExternalTicketState[]>>;

  /** Assign a ticket to a person */
  assignTicket(externalId: string, assignee: string): Promise<Result<void>>;
}

export interface ExternalTicket {
  externalId: string; // "github:owner/repo#42"
  url: string;
}

export interface ExternalTicketState {
  externalId: string;
  status: string; // External status (e.g., "open", "closed")
  labels: string[]; // External labels (used for status disambiguation)
  assignee: string | null;
}

export interface SyncResult {
  created: ExternalTicket[];
  updated: string[]; // externalIds that were updated
  assignmentChanges: Array<{ feature: string; from: string | null; to: string | null }>;
  errors: Array<{ featureOrId: string; error: Error }>;
}

export interface TrackerSyncConfig {
  kind: 'github'; // Narrowed to GitHub-only for now; widen when adapters are added
  repo?: string; // "owner/repo" for GitHub
  labels?: string[]; // Auto-applied labels for filtering + identification
  statusMap: Record<FeatureStatus, string>; // Maps roadmap status -> external status
  reverseStatusMap: Record<string, FeatureStatus>; // External status+label -> roadmap
}
```

**Status mapping strategy for GitHub Issues:**

GitHub Issues have only two states: `open` and `closed`. To disambiguate multiple roadmap statuses that map to `open`, the adapter uses **labels** as a secondary discriminator:

- Push: `in-progress` -> open + label `"in-progress"`, `blocked` -> open + label `"blocked"`, `planned` -> open + label `"planned"`, `backlog` -> open (no status label)
- Pull (reverse): `closed` -> `done` (unambiguous). For `open` issues, check labels: label `"in-progress"` -> `in-progress`, label `"blocked"` -> `blocked`, label `"planned"` -> `planned`, no status label -> no change (preserve current roadmap status).
- If the reverse mapping is still ambiguous (multiple status labels), preserve the current roadmap status and log a warning.

The `reverseStatusMap` config supports compound keys like `"open:in-progress"` (state + label) to express this:

```json
{
  "reverseStatusMap": {
    "closed": "done",
    "open:in-progress": "in-progress",
    "open:blocked": "blocked",
    "open:planned": "planned"
  }
}
```

### 4. GitHub Issues Adapter

New file `packages/core/src/roadmap/adapters/github-issues.ts`:

- Implements `TrackerSyncAdapter`
- Uses `@octokit/rest` or raw GitHub REST API with `GITHUB_TOKEN`
- `createTicket` -> `POST /repos/{owner}/{repo}/issues` with title = feature name, body = summary + spec link, labels from config
- `updateTicket` -> `PATCH /repos/{owner}/{repo}/issues/{number}`
- `fetchTicketState` -> `GET /repos/{owner}/{repo}/issues/{number}`
- `assignTicket` -> `POST /repos/{owner}/{repo}/issues/{number}/assignees`
- `statusMap` maps to open/closed + labels (e.g., `in-progress` -> open + label "in-progress")

### 5. Sync Engine

New file `packages/core/src/roadmap/sync-engine.ts`:

```typescript
export interface SyncOptions {
  forceSync?: boolean; // Allow status regressions (default: false)
}

export async function syncToExternal(
  roadmap: Roadmap,
  adapter: TrackerSyncAdapter,
  config: TrackerSyncConfig
): Promise<SyncResult> {
  // For each feature without externalId -> createTicket, store externalId on feature
  // For each feature with externalId -> updateTicket with current planning fields
  // Collects errors per-feature, never throws
}

export async function syncFromExternal(
  roadmap: Roadmap,
  adapter: TrackerSyncAdapter,
  config: TrackerSyncConfig,
  options?: SyncOptions
): Promise<SyncResult> {
  // fetchAllTickets (filtered by configured labels, paginated)
  // For each ticket: pull assignee + status (using label-based reverse mapping)
  // Apply directional guard (no status regression unless forceSync: true)
  // External assignee wins over local assignee
  // Mutates roadmap object in-place with changes
}

export async function fullSync(
  roadmapPath: string,
  adapter: TrackerSyncAdapter,
  config: TrackerSyncConfig,
  options?: SyncOptions
): Promise<SyncResult> {
  // Acquires in-process mutex to prevent concurrent write races
  // Reads roadmap from disk
  // Push first (planning fields out), then pull (execution fields back)
  // Writes updated roadmap back to disk (externalIds, assignees, statuses)
  // Releases mutex
}
```

**Write-back responsibility:** `fullSync` owns the full read-mutate-write cycle including disk I/O. This is necessary because `syncToExternal` stores new `externalId` values and `syncFromExternal` updates assignee/status fields — both must be persisted. The caller (auto-sync hook) treats the call as fire-and-forget at the _caller_ level (does not await the result), but `fullSync` itself completes its write before returning.

**Concurrency guard:** An in-process mutex (simple promise-based lock) prevents concurrent `fullSync` calls from racing on the roadmap file. With 6 trigger points, overlapping state transitions could otherwise produce write conflicts. The mutex serializes writes; if a sync is already in progress, the next one queues behind it.

Hook into existing `autoSyncRoadmap()` in `packages/cli/src/mcp/tools/roadmap-auto-sync.ts` — after local sync completes, if tracker config exists, call `fullSync` (fire-and-forget from the caller's perspective; errors logged but never block the state transition).

### 6. Auto-Pick Pilot

New skill `agents/skills/claude-code/harness-roadmap-pilot/`:

**Selection algorithm:**

1. Parse roadmap, filter to unblocked items with status `planned` or `backlog`
2. Score each candidate using a two-tier sort:
   - **Tier 1 — Priority override:** Items with an explicit `Priority` field are sorted first, grouped by priority level (P0 > P1 > P2 > P3). Items without a priority field fall to Tier 2.
   - **Tier 2 — Weighted score** (for items within the same priority tier, or items with no priority):
     - **Position weight** (0.5): earlier in milestone + earlier milestone = higher
     - **Dependents weight** (0.3): items that unblock more downstream items score higher
     - **Affinity weight** (0.2): bonus if current user completed related items or blockers
3. AI reads top 3-5 candidates' specs (if they exist) and provides a recommendation with reasoning
4. Present recommendation to human for confirmation
5. On confirmation:
   - If spec exists -> transition to `harness:autopilot` with spec path
   - If no spec -> transition to `harness:brainstorming` with feature context
   - Update assignee field + append to assignment history
   - Sync assignment to external service

**Affinity matching:**

- Read assignment history section from roadmap
- Build affinity graph: user -> set of features worked on
- For each candidate, check if the current user completed any of its blockers or sibling items in the same milestone
- Affinity bonus applied in scoring step

### 7. State Transition Hook Extension

Extend the state transition points in `packages/cli/src/mcp/tools/roadmap-auto-sync.ts`:

Current triggers: `save-handoff`, `archive_session`

Add triggers: `task-start`, `task-complete`, `phase-start`, `phase-complete`

Each trigger runs `fullSync` if tracker config is present in `harness.config.json`:

```json
{
  "roadmap": {
    "tracker": {
      "kind": "github",
      "repo": "owner/repo",
      "labels": ["harness-managed"],
      "statusMap": {
        "backlog": "open",
        "planned": "open",
        "in-progress": "open",
        "done": "closed",
        "blocked": "open"
      }
    }
  }
}
```

### 8. File Layout

```
packages/core/src/roadmap/
  parse.ts              # EXTEND — new fields + history section
  serialize.ts          # EXTEND — new fields + history section
  sync.ts               # EXISTING — local state sync (unchanged)
  sync-engine.ts        # NEW — external tracker sync orchestration
  tracker-sync.ts       # NEW — TrackerSyncAdapter interface
  adapters/
    github-issues.ts    # NEW — GitHub Issues implementation
  index.ts              # EXTEND — export new modules

packages/types/src/
  index.ts              # EXTEND — new fields on RoadmapFeature, new types

packages/cli/src/mcp/tools/
  roadmap.ts            # EXTEND — manage_roadmap gets sync action
  roadmap-auto-sync.ts  # EXTEND — additional trigger points + external sync

agents/skills/claude-code/
  harness-roadmap-pilot/ # NEW — auto-pick skill
    SKILL.md
    skill.yaml
```

## Success Criteria

1. When `Assignee`, `Priority`, and `External-ID` fields are present in roadmap.md feature blocks, `parseRoadmap` shall produce a `RoadmapFeature` with the corresponding typed fields populated, and `serializeRoadmap` shall reproduce the original markdown with round-trip fidelity.
2. When an `## Assignment History` section is present in roadmap.md, `parseRoadmap` shall produce an array of `AssignmentRecord` objects with feature, assignee, action, and date fields.
3. When a `TrackerSyncAdapter` implementation calls `createTicket` with a `RoadmapFeature`, the external service shall receive an issue with the feature name as title and summary + spec link as body.
4. When `fullSync` runs and a feature has no `externalId`, the system shall create a ticket and store the resulting `externalId` on the feature.
5. When `fullSync` pulls from the external service and the external assignee differs from the local assignee, the external assignee shall win and the local field shall be updated.
6. When `fullSync` pulls a status that would regress the local status (e.g., `done` -> `in-progress`), the system shall not apply the change unless `forceSync` is true.
7. When a state transition occurs (`task-start`, `task-complete`, `phase-start`, `phase-complete`, `save-handoff`, `archive_session`) and tracker config is present, `fullSync` shall run automatically. The caller does not await the result, but `fullSync` completes its disk write before returning.
8. If the external service API fails during sync, the system shall log the error and shall not block the local operation.
9. When the roadmap pilot skill is invoked, it shall sort unblocked `planned` or `backlog` items using a two-tier sort: explicit priority first (P0 > P1 > P2 > P3), then weighted score (position 0.5, dependents 0.3, affinity 0.2) within each tier.
10. When the pilot AI recommends an item and the human confirms, the system shall transition to `harness:brainstorming` if no spec exists for the feature, or to `harness:autopilot` if a spec exists.
11. When an item is assigned via the pilot, the system shall update the `Assignee` field on the feature, append an `assigned` record to the assignment history, and sync the assignment to the external service.
12. When computing affinity, the system shall read the assignment history and give a scoring bonus to candidates whose blockers or milestone siblings were previously completed by the current user.
13. When multiple `fullSync` calls overlap due to rapid state transitions, the in-process mutex shall serialize them so that only one write to roadmap.md occurs at a time.
14. When pulling status from GitHub Issues, the adapter shall use labels as a secondary discriminator to resolve the ambiguity of multiple roadmap statuses mapping to the `open` state. If ambiguous (multiple status labels or no status label), the current roadmap status shall be preserved.
15. When a feature is reassigned, the system shall append two records to the assignment history: `unassigned` for the previous assignee and `assigned` for the new assignee.
16. The `## Assignment History` heading shall be treated as a parser sentinel — `parseMilestones` shall stop before it and route content to a dedicated `parseAssignmentHistory` function.

## Implementation Order

### Phase 1: Data Model & Parse/Serialize

- Extend `RoadmapFeature` type with `assignee`, `priority`, `externalId`
- Add `AssignmentRecord` type and `assignmentHistory` to `Roadmap`
- Extend `parseRoadmap` for new fields and history section
- Extend `serializeRoadmap` for new fields and history section
- Tests for round-trip fidelity with new and legacy (no new fields) roadmaps

### Phase 2: Tracker Sync Interface & GitHub Adapter

- Define `TrackerSyncAdapter` interface and config types
- Implement `GitHubIssuesSyncAdapter`
- Implement sync engine (`syncToExternal`, `syncFromExternal`, `fullSync`)
- Tests with mocked GitHub API responses

### Phase 3: State Transition Hooks

- Extend `autoSyncRoadmap` to fire on additional state transitions
- Wire sync engine into auto-sync with tracker config detection
- Fire-and-forget execution with error logging
- Integration tests verifying sync triggers

### Phase 4: Roadmap Pilot Skill

- Implement scoring algorithm (position, priority, dependents, affinity)
- AI-assisted recommendation reading spec content
- Skill transitions to brainstorming or autopilot via `emit_interaction`
- Assignment updates (feature field + history + external sync)
- End-to-end test of pick -> assign -> transition flow
