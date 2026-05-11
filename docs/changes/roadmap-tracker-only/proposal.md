# Tracker-Only Roadmap (File-less Mode)

> Opt-in mode where the configured external tracker is the canonical roadmap, eliminating `docs/roadmap.md` as a multi-session conflict surface.

**Date:** 2026-05-09
**Status:** Proposed
**Keywords:** roadmap, tracker, github-issues, file-less, multi-session, etag, concurrency, centralization

## Overview

Today, the project roadmap lives in a single markdown file (`docs/roadmap.md`) that every consumer reads and writes: the orchestrator (claim/release on every tick), the dashboard (claim flow), the `manage_roadmap` MCP tool, the brainstorming and planning skills, and the bidirectional GitHub Issues sync engine. With multi-session orchestration, this file becomes a constant source of write conflicts — the in-process mutex protects only one process, and across orchestrator + dashboard + MCP calls there is no coordination.

This change adds **file-less mode**: an opt-in configuration where `docs/roadmap.md` does not exist and the configured external tracker (GitHub Issues today) is the canonical store of truth. All consumers talk to the tracker through a shared `IssueTrackerClient` interface, lifted from the orchestrator into `packages/core` so non-orchestrator users (CLI, dashboard, MCP, skills) can use it directly. ETag-conditional reads keep the API call cost negligible. Write conflicts are detected via refetch-and-compare rather than `If-Match`, because GitHub REST does not honor `If-Match` on issue PATCH; this is best-effort detection (see ADR 0009 §Consequences for the rationale).

### Goals

1. **Eliminate multi-session file conflicts.** Removing `roadmap.md` removes the contended resource. Concurrency is delegated to the tracker.
2. **Centralize roadmap state across clones.** All clones see the same state at the same time — no merge conflicts on the roadmap when teammates push changes simultaneously.
3. **Preserve all existing tooling.** Brainstorming, planning, pilot scoring, dashboard claim, MCP `manage_roadmap`, and CLI commands all work in file-less mode with no UX change for end users (their commands are the same; the storage backend differs).
4. **Stay opt-in.** Existing projects with `roadmap.md` keep working unchanged. File-less mode is activated explicitly via `roadmap.mode: "file-less"` and a one-shot migration command.
5. **Avoid new infrastructure.** No new daemon, no new process, no new sync layer — just a tracker-backed implementation of the existing operations.

### Non-Goals

- **No local-only / offline file-less mode.** File-less requires a configured external tracker. Teams without one stay on `roadmap.md`.
- **No Linear or other tracker support in this change.** The interface is designed pluggable; only the GitHub Issues backend ships in this round.
- **No replacement of the existing `fullSync` push/pull engine.** It remains for file-backed projects. File-less projects bypass it (the tracker IS the truth, so there's nothing to sync).
- **No positional ordering in file-less mode.** Sort is `Priority` (P0–P3) → fall back to issue creation order. This is a deliberate semantic change documented in the migration guide.
- **No real-time push (SSE/webhooks) from the tracker.** Polling + ETag is sufficient for this round. WebSocket/SSE remains a future optimization.

## Decisions

| #   | Decision                                                                                                            | Rationale                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Pluggable `IssueTrackerClient` abstraction lifted from orchestrator into `packages/core`                            | Lets non-orchestrator consumers (CLI, dashboard, MCP, skills) use the same interface; preserves layer rules; keeps door open for Linear/Jira backends without rework                                                                                                                           |
| D2  | File-less mode requires a configured external tracker — no local fallback                                           | A local-file fallback would either re-create per-clone divergence or re-create the original file conflict. Forcing teams who want centralization to configure a real tracker keeps the design honest                                                                                           |
| D3  | Hybrid storage: native fields + fenced YAML metadata block in body + audit history as issue comments                | Native fields keep issues looking normal in GitHub; the body block round-trips fields GitHub doesn't model; issue comments are append-only and centralized (revising the original local-file audit log proposal)                                                                               |
| D4  | Drop positional ordering in file-less mode; sort by Priority then issue number                                      | Reordering by rewriting N issue bodies is operationally noisy and rate-limit-pressuring. `Priority` field is the explicit lever for "do this next"                                                                                                                                             |
| D5  | Activation via explicit `roadmap.mode: "file-less"` config flag (default `"file-backed"`)                           | Implicit activation (file absent + tracker present) is too easy to trigger accidentally. Explicit flag is self-documenting and lets `harness validate` enforce consistency                                                                                                                     |
| D6  | Migration via explicit `harness roadmap migrate --to=file-less` command with `--dry-run` and idempotent re-run      | Auto-migration on first run is dangerous (mass issue creation). Explicit, auditable, recoverable                                                                                                                                                                                               |
| D7  | Coordination via thin client + per-process ETag store + `If-None-Match` reads + refetch-and-compare write conflicts | Solves the rate-limit problem with a well-trodden HTTP pattern; no broker, no central cache, no new process; keeps architecture flat. GitHub REST does not honor `If-Match` on issue PATCH, so concurrent-write detection is best-effort via refetch-and-compare (see ADR 0009 §Consequences). |

## Technical Design

### Package layout

New module: `packages/core/src/roadmap/tracker/`

```
packages/core/src/roadmap/tracker/
  index.ts                    # Re-exports: IssueTrackerClient, types, factory
  types.ts                    # IssueTrackerClient interface, TrackedFeature, ConflictError
  factory.ts                  # createTrackerClient(config) -> IssueTrackerClient
  body-metadata.ts            # parseBodyBlock / serializeBodyBlock (fenced HTML-comment block)
  etag-store.ts               # In-memory LRU ETag cache, per-process
  conflict.ts                 # 412 retry policy
  adapters/
    github-issues.ts          # GitHubIssuesTrackerAdapter — implements IssueTrackerClient
```

The interface lives in `core` (under existing layer rules in `harness.config.json`, `core` cannot import from higher layers, but other packages can import from core). The orchestrator's existing `RoadmapTrackerAdapter` is **kept** as the file-backed implementation and re-implements the lifted interface. Both adapters become interchangeable behind the factory.

### `IssueTrackerClient` interface

```ts
export interface IssueTrackerClient {
  // Reads
  fetchAll(): Promise<Result<{ features: TrackedFeature[]; etag: string | null }, Error>>;
  fetchById(
    externalId: string
  ): Promise<Result<{ feature: TrackedFeature; etag: string } | null, Error>>;
  fetchByStatus(statuses: FeatureStatus[]): Promise<Result<TrackedFeature[], Error>>;

  // Writes (all accept optional ifMatch for ETag-conditional updates)
  create(feature: NewFeatureInput): Promise<Result<TrackedFeature, Error>>;
  update(
    externalId: string,
    patch: FeaturePatch,
    ifMatch?: string
  ): Promise<Result<TrackedFeature, ConflictError | Error>>;
  claim(
    externalId: string,
    assignee: string,
    ifMatch?: string
  ): Promise<Result<TrackedFeature, ConflictError | Error>>;
  release(
    externalId: string,
    ifMatch?: string
  ): Promise<Result<TrackedFeature, ConflictError | Error>>;
  complete(
    externalId: string,
    ifMatch?: string
  ): Promise<Result<TrackedFeature, ConflictError | Error>>;

  // History (append-only, no conflict surface)
  appendHistory(externalId: string, event: HistoryEvent): Promise<Result<void, Error>>;
  fetchHistory(externalId: string, limit?: number): Promise<Result<HistoryEvent[], Error>>;
}
```

`TrackedFeature` is the unified shape:

```ts
export interface TrackedFeature {
  externalId: string; // "github:owner/repo#42" (or future "linear:TEAM-123")
  name: string;
  status: FeatureStatus;
  summary: string;
  spec: string | null;
  plans: string[];
  blockedBy: string[]; // by feature name (resolved at read time)
  assignee: string | null;
  priority: Priority | null;
  milestone: string | null;
  createdAt: string; // for sort ordering in file-less mode
  updatedAt: string | null;
}
```

`ConflictError` is a distinct error type so callers can choose: refetch+retry, or bubble up to the user.

### Body metadata block

GitHub issue body shape:

```markdown
<!-- Free-form description written by humans -->

This is the user-authored summary. Edit freely.

<!-- harness-meta:start -->

spec: docs/changes/auth/proposal.md
plan: docs/changes/auth/plans/2026-04-01-auth-plan.md
blocked_by: api-gateway, identity-store
priority: P1
milestone: v1.0 MVP

<!-- harness-meta:end -->
```

- Format is YAML between the delimiters (small, predictable, human-readable).
- Parser is tolerant: missing block → all fields default to null/empty. Malformed YAML → log warning, treat as missing.
- Serializer always emits a complete block at the end of the body, preserving everything before it.
- Block fields are the **canonical** source for these fields. Native GitHub fields (assignee, state, milestone) take precedence for those particular fields.

### Audit history as issue comments

Each history event is posted as a comment with a structured prefix:

```
<!-- harness-history -->
{"type":"assigned","actor":"alice","at":"2026-05-09T12:00:00Z"}
```

The HTML comment hides the JSON in normal GitHub rendering. `fetchHistory` filters comments by the prefix and parses the JSON. `appendHistory` posts a new comment.

This revises the original (local-file) audit-log decision because a local log is per-clone and per-machine — each developer's pilot scoring would compute affinity from a different history. Issue comments are append-only, conflict-free, visible to all clones and the GitHub UI, and survive clone deletion. The cost (one extra API call per history event) is bounded by human action rate.

### ETag store

```ts
// packages/core/src/roadmap/tracker/etag-store.ts
export class ETagStore {
  private cache = new LRUCache<string, { etag: string; data: unknown; cachedAt: number }>({
    max: 500,
  });

  get(key: string): { etag: string; data: unknown } | null;
  set(key: string, etag: string, data: unknown): void;
  invalidate(key: string): void;
  invalidateAll(): void;
}
```

Per-process, in-memory only. Keys: `feature:<externalId>` for individual features, `list:<status>` for filtered lists, `list:all` for full fetch. Writes invalidate the touched key plus `list:*`. No cross-process invalidation — cross-process consistency relies on the next read's `If-None-Match` returning either fresh data (200) or confirming staleness (304).

### Conflict-resolution policy

> _Note: the policy below describes idealized OCC semantics. GitHub REST does not honor `If-Match` on issue PATCH, so this is implemented via refetch-and-compare (see ADR 0009 §Consequences). The retry-on-412 cells describe the behavior the implementation synthesizes by comparing fresh server state with the client's last-known ETag — there is no real 412 on the wire; `ConflictError` is raised when the comparison detects divergence._

`update`/`claim`/`release`/`complete` accept `ifMatch?: string`. If GitHub returns 412 (Precondition Failed):

| Operation                 | Retry strategy                                                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claim(id, alice, etag)`  | Refetch. If status is now `in-progress` and assignee is alice → success (idempotent). If assignee is someone else → return `ConflictError("already claimed by X")`. Otherwise re-apply. |
| `release(id, etag)`       | Refetch. If status is no longer `in-progress` → success (idempotent). Otherwise re-apply.                                                                                               |
| `complete(id, etag)`      | Refetch. If status is `done` → success. Otherwise re-apply (terminal state is sticky).                                                                                                  |
| `update(id, patch, etag)` | Refetch. Re-apply patch by deep-merging into current state. If a field in `patch` was changed externally to something incompatible, return `ConflictError` with the diff.               |

Retries are bounded (default 3 attempts) with exponential backoff, then the error surfaces.

### Config schema

`harness.config.json` gains:

```json
{
  "roadmap": {
    "mode": "file-less",
    "tracker": {
      /* existing schema unchanged */
    }
  }
}
```

`mode` is one of `"file-backed"` (default) or `"file-less"`. Validation rules added to `validateHarnessConfig`:

- `mode: "file-less"` AND `roadmap.tracker` absent → error
- `mode: "file-less"` AND `docs/roadmap.md` exists → error (run `harness roadmap migrate` to reconcile)
- `mode: "file-backed"` (or absent) → existing behavior unchanged

### Consumer migrations

| Consumer                               | Today                                   | After                                                                                                                                                                                                        |
| -------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `manage_roadmap` MCP tool              | Reads/writes `docs/roadmap.md` directly | Branches on `roadmap.mode`. File-backed: unchanged. File-less: instantiates `IssueTrackerClient`, dispatches to its operations.                                                                              |
| Orchestrator's `RoadmapTrackerAdapter` | File-backed only                        | Kept as one adapter; new `GitHubIssuesTrackerAdapter` registered; `tracker.kind: "github-issues"` config selects the new one (separate from `roadmap.tracker.kind: "github"` which is for file-backed sync). |
| Dashboard claim endpoint               | File lock + parse + write               | Branches on mode. File-less: calls `client.claim()` with ETag, surfaces conflict to UI ("claimed by X — refresh").                                                                                           |
| `harness:brainstorming` Phase 4 step 7 | Calls `manage_roadmap add`              | Unchanged — `manage_roadmap` is the abstraction layer.                                                                                                                                                       |
| `harness:roadmap-pilot`                | Reads roadmap, scores                   | Branches on mode. File-less: revised scoring formula (D4); affinity reads from `fetchHistory()`.                                                                                                             |
| `fullSync` engine                      | Active                                  | File-less: not invoked (the tracker IS the truth). Stays alive for file-backed projects.                                                                                                                     |

### Migration command

`harness roadmap migrate --to=file-less [--dry-run]`:

1. Verify `roadmap.tracker` is configured. Bail if not.
2. Parse current `docs/roadmap.md`.
3. For each feature without an `External-ID`: `client.create(feature)`. Record the new external ID.
4. For each feature: `client.update(externalId, fullPatch)` to write the body metadata block.
5. Write any pre-existing assignment-history rows to issue comments via `client.appendHistory()`.
6. Move `docs/roadmap.md` → `docs/roadmap.md.archived`.
7. Update `harness.config.json` to set `roadmap.mode: "file-less"`.
8. Print summary: N features migrated, M issues created, K updated, audit events posted.

`--dry-run` performs steps 1–4 in-memory and prints the plan, no API writes.

Re-runs are idempotent: features with an `External-ID` are skipped at step 3; step 4 is a no-op if the body block already matches.

## Integration Points

### Entry Points

| Entry point                                                     | Type              | Notes                                                                                     |
| --------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------- |
| `packages/core/src/roadmap/tracker/index.ts`                    | Public API barrel | Re-exports `IssueTrackerClient`, `TrackedFeature`, `ConflictError`, `createTrackerClient` |
| `harness roadmap migrate`                                       | New CLI command   | Top-level subcommand under `harness roadmap` (group may need to be created)               |
| `manage_roadmap` MCP tool                                       | Behavior branches | No new MCP tool; existing one becomes mode-aware                                          |
| `roadmap.mode` field in `harness.config.json`                   | New config field  | Optional; default `"file-backed"`                                                         |
| `tracker.kind: "github-issues"` in orchestrator workflow config | New tracker kind  | Selects `GitHubIssuesTrackerAdapter`                                                      |
| `GET /api/roadmap`, `POST /api/actions/roadmap/claim`           | Behavior branches | No new HTTP routes; existing ones gain a mode branch                                      |

### Registrations Required

- **Barrel export regeneration:** `packages/core/src/roadmap/index.ts` re-exports the new `tracker/` submodule public surface.
- **CLI command registration:** `harness roadmap migrate` in the CLI command tree.
- **Tracker adapter registry:** Orchestrator factory gains `kind: "github-issues"` mapping to `GitHubIssuesTrackerAdapter`.
- **Config schema update:** Validator accepts the new `roadmap.mode` field.
- **`harness validate` rules:** Two consistency checks (mode + tracker presence; mode + file presence).
- **`.harness/.gitignore`:** No new entries needed under the revised audit-log decision (issue comments).

### Documentation Updates

| Doc                                                    | Change                                                                                                          |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `docs/guides/roadmap-sync.md`                          | Add a "File-less mode" section: what, how to opt in, behavioral differences, migration command, troubleshooting |
| `docs/reference/configuration.md`                      | Document `roadmap.mode` and validation rules                                                                    |
| `docs/reference/cli-commands.md`                       | Document `harness roadmap migrate`                                                                              |
| `docs/reference/mcp-tools.md`                          | Update `manage_roadmap` description to note mode-aware behavior                                                 |
| `docs/knowledge/dashboard/claim-workflow.md`           | Update step 4 to describe file-less branch — `client.claim()` with ETag, conflict surfacing                     |
| `AGENTS.md` (root)                                     | One-line note in the Roadmap section pointing at the new mode flag                                              |
| `packages/core/CHANGELOG.md`                           | Entry for the new tracker submodule and lifted interface                                                        |
| `packages/orchestrator/CHANGELOG.md`                   | Entry for the new `github-issues` tracker kind                                                                  |
| `packages/cli/CHANGELOG.md`                            | Entry for `roadmap migrate`                                                                                     |
| `docs/changes/roadmap-tracker-only/migration.md` (new) | Step-by-step for existing projects: dry-run, verification, rollback recipe via the archived file                |

### Architectural Decisions (ADRs)

1. **Tracker abstraction lives in `packages/core`, not `packages/types` or `packages/orchestrator`.** Interface plus reference implementations live together; non-orchestrator consumers need to import the implementation, not just the type.
2. **Audit history stored as GitHub issue comments rather than a local file.** Centralization is the explicit goal; a local audit log re-creates the per-clone divergence we're trying to escape.

ADR files: `docs/decisions/ADR-XXXX-tracker-abstraction-in-core.md` and `docs/decisions/ADR-XXXX-audit-history-as-issue-comments.md` (numbers TBD when written).

### Knowledge Impact

- **New `business_concept`:** `File-less Roadmap Mode` (domain: `roadmap`, new). Cross-links to existing `Roadmap Claim Workflow` and `Web Dashboard`.
- **New `business_rule`:** `Tracker as Source of Truth` — when `roadmap.mode: file-less`, the configured external tracker is canonical; `docs/roadmap.md` must not exist; all reads/writes go through `IssueTrackerClient`.
- **New `business_process`:** `Roadmap Migration to File-less Mode` — captures the `harness roadmap migrate` flow including dry-run, idempotence, archive behavior.
- **Updated business process:** `Roadmap Claim Workflow` — add a branch describing the file-less path.

Knowledge files land under new `docs/knowledge/roadmap/` domain.

## Success Criteria

### Functional

| #   | Criterion                                                                                                                                                                                                                                                                                                                                                                | Verification                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | A file-less project completes a full feature lifecycle (create → claim → release → claim → complete) entirely through `IssueTrackerClient`                                                                                                                                                                                                                               | Integration test against a real test repo (or recorded fixture); asserts no file is created/modified under `docs/`                                                                                                                     |
| F2  | Best-effort detection of concurrent claim races: when a concurrent claim is detected via refetch-and-compare, the losing call returns `ConflictError`. GitHub REST does not honor `If-Match` on PATCH, so detection is not guaranteed for interleavings where the window between read and write is microscopic (see ADR 0009 §Consequences and Phase 2 decision D-P2-B). | Unit test: two clients race `claim()` with stale ETags; the test asserts that EITHER one returns `ConflictError` (detection case) OR both succeed and the integration test layer logs the missed race for telemetry (undetected case). |
| F3  | `manage_roadmap show`/`query` produce identical output in both modes for an equivalent set of features                                                                                                                                                                                                                                                                   | Snapshot test                                                                                                                                                                                                                          |
| F4  | `harness roadmap migrate --to=file-less --dry-run` produces a complete plan without making any GitHub API writes                                                                                                                                                                                                                                                         | Test using a mocked adapter that fails on any write call                                                                                                                                                                               |
| F5  | `harness roadmap migrate --to=file-less` is idempotent: a second run after partial failure completes without duplicating issues                                                                                                                                                                                                                                          | Test simulating midway failure + re-run                                                                                                                                                                                                |
| F6  | `harness:roadmap-pilot` recommends a feature in file-less mode using the revised scoring formula and references priority/affinity inputs in its rationale                                                                                                                                                                                                                | Snapshot test on a file-less fixture                                                                                                                                                                                                   |
| F7  | The dashboard claim flow surfaces a conflict when an ETag-conditional claim fails                                                                                                                                                                                                                                                                                        | Manual browser test + Playwright with a mocked client returning 412                                                                                                                                                                    |
| F8  | `harness validate` reports a config error for both invariants from §Config schema                                                                                                                                                                                                                                                                                        | Unit test on the validator                                                                                                                                                                                                             |
| F9  | A `harness:brainstorming` session in a file-less project writes a spec AND adds the feature to the tracker (creating a new issue)                                                                                                                                                                                                                                        | End-to-end test (or documented manual verification step if E2E is too flaky)                                                                                                                                                           |

### Performance

| #   | Criterion                                                                                  | Threshold   |
| --- | ------------------------------------------------------------------------------------------ | ----------- |
| P1  | An orchestrator tick that finds no state changes consumes ≤1 conditional GET returning 304 | ≤1 API call |
| P2  | A full roadmap fetch of 100 features completes in < 2s on a warm ETag cache                | ≤2s p95     |
| P3  | A cold pilot scoring run on a 50-feature roadmap completes in < 5s                         | ≤5s p95     |
| P4  | Migration of a 50-feature `roadmap.md` completes in < 60s including history backfill       | ≤60s p95    |

### Compatibility

| #   | Criterion                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------- |
| C1  | A project with `mode: "file-backed"` (or no `mode` field) behaves identically to before this change  |
| C2  | All existing tracker-sync tests (`fullSync`, `syncToExternal`, `syncFromExternal`) pass unchanged    |
| C3  | All existing orchestrator tracker adapter tests pass unchanged                                       |
| C4  | The lifted `IssueTrackerClient` interface in `packages/core` does not introduce new layer violations |
| C5  | The dashboard renders correctly for both modes without component-level branching                     |

### Documentation

| #   | Criterion                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------- |
| D1  | A user reading `docs/guides/roadmap-sync.md` can opt into file-less mode without consulting source code |
| D2  | The migration guide includes a rollback recipe using `roadmap.md.archived`                              |
| D3  | Both ADRs explain the chosen approach AND the alternatives that were rejected                           |
| D4  | `docs/knowledge/dashboard/claim-workflow.md` accurately describes the file-less branch                  |

## Implementation Order

```
Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5 ──► Phase 7
                                       │                       ▲
                                       └─► Phase 6 ────────────┘
                                           (in parallel with Phase 5)
```

**Phase 1 — Lift the tracker abstraction into core.**
Move the interface and shared types from orchestrator to `packages/core/src/roadmap/tracker/`. No behavior change. Refactor existing `RoadmapTrackerAdapter` to implement the lifted interface. All existing orchestrator tests pass unchanged.

**Phase 2 — Build the GitHub Issues adapter + ETag layer.**
Implement `GitHubIssuesTrackerAdapter` with conditional reads/writes and the body metadata block. Implement `body-metadata.ts`, `etag-store.ts`, `conflict.ts`. Implement history via issue comments. Unit tests for body parsing/serialization (round-trip, tolerance). Integration tests for create/claim/release/complete and the conflict path.

**Phase 3 — Config schema, validation, mode plumbing.**
Add `roadmap.mode` to the config and validator. Add the two `harness validate` rules. Add `getRoadmapMode(config)` helper consumed by all relevant call sites — but the file-less branches throw "not yet wired."

**Phase 4 — Wire file-less mode through each consumer.**
Each consumer's file-less branch becomes functional, gated by the config flag: `manage_roadmap` MCP tool, orchestrator (`tracker.kind: "github-issues"`), dashboard claim endpoint, `harness:roadmap-pilot`. All file-backed paths remain unchanged.

**Phase 5 — Migration command.**
Ship `harness roadmap migrate --to=file-less` with `--dry-run` and idempotent re-run. Migration guide doc with rollback recipe.

**Phase 6 — Documentation, ADRs, knowledge graph.**
All docs reflect the new mode. Two ADRs written. Knowledge files added under new `docs/knowledge/roadmap/` domain. Can run in parallel with Phase 5 once Phase 4 lands.

**Phase 7 — Dashboard conflict UX (file-less GA blocker).**
Wire the React client to the HTTP 409 `TRACKER_CONFLICT` response shape that Phase 4 introduced (decision D-P4-B deferred this from Phase 4). Surface conflicts as a toast ("claimed by X — refresh"), auto-refetch the roadmap state on 409, and scroll-to-row to focus the contested feature. Same treatment for the roadmap-status and roadmap-append endpoints (S5/S6 from Phase 3) when they return conflicts. Must run after Phase 4 (server contract) but before file-less mode is considered GA.

Order-of-magnitude: 1–2 weeks of focused work for Phases 1–6, plus a 1–2 hour follow-up cycle for Phase 7. Gated by test infrastructure for the GitHub-backed integration tests.
