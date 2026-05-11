# Plan: Phase 2 — GitHub Issues Adapter + ETag Layer

**Date:** 2026-05-09
**Spec:** `docs/changes/roadmap-tracker-only/proposal.md` (Phase 2, "Implementation Order")
**Tasks:** 18
**Time:** ~75 minutes
**Integration Tier:** medium

## Goal

Ship a working `GitHubIssuesTrackerAdapter` that implements the redesigned wide tracker interface (`fetchAll`, `fetchById`, `fetchByStatus`, `create`, `update`, `claim`, `release`, `complete`, `appendHistory`, `fetchHistory`) end-to-end against GitHub Issues, with a body-metadata block, an ETag cache for cheap reads, a refetch-and-retry conflict policy, and audit history posted as hidden HTML-comment JSON in issue comments — all behind a `factory.ts` so consumers in Phase 4 can swap implementations on a config flag, with **no consumer wired yet** (Phase 4) and **no config schema changes** (Phase 3).

## Scope Notes (read first)

Three things you need to know before reading the tasks:

### 1. The proposal's `If-Match` write semantics do not work on GitHub Issues

The proposal §"Conflict-resolution policy" assumes `update`/`claim`/`release`/`complete` send `If-Match: <etag>` and recover from `412 Precondition Failed`. **This contradicts how the GitHub REST API works.** GitHub's `PATCH /repos/{owner}/{repo}/issues/{issue_number}` is a last-write-wins API: it does not honor `If-Match`, does not return `412`, and does not document any optimistic-concurrency mechanism on issue mutation. ETag is supported for **conditional reads** (`If-None-Match` returning `304 Not Modified`), but writes are unconditional.

This plan therefore implements **Option A from the user prompt: refetch-and-compare for writes** — the closest behavior to the proposal that GitHub actually supports. It works as follows:

- Reads still set `ETag` and accept `If-None-Match` for cheap polling.
- The interface still exposes `ifMatch?: string` so the abstraction is forward-compatible with trackers that do support OCC (GraphQL mutations on GitHub Projects v2, Linear, etc.) and so Phase 4 callers can pass an ETag without conditional logic.
- For each write: when `ifMatch` is present and the cached ETag for the target key still matches `ifMatch`, the adapter does an extra `GET` to refetch the current state, deep-compares the field(s) being written, and synthesizes a `ConflictError` if the server's current state differs in a way that would be clobbered. When `ifMatch` is absent (or mismatches the cache, meaning the caller has stale view anyway), the adapter writes unconditionally — last-write-wins, but with a refetched cache afterwards.
- Bounded retries (default 3) with exponential backoff handle transient `5xx` and rate-limit `403`/`429`, **not** OCC failures.

The decision below records this. The risk is surfaced in `concerns[]` for APPROVE_PLAN — the user should know we are not delivering true OCC.

### 2. The Phase 2 wide interface gets a new name to avoid collision

Phase 1 lifted the existing **small** interface (`fetchCandidateIssues`/`fetchIssuesByStates`/`fetchIssueStatesByIds`/`markIssueComplete`/`claimIssue`/`releaseIssue`) and re-exports it from `@harness-engineering/core` as `IssueTrackerClient` (delegating to `@harness-engineering/types`). That re-export is **load-bearing** — orchestrator already imports `IssueTrackerClient` from `@harness-engineering/core` at four call sites (`orchestrator.ts:5`, `claim-manager.ts:1`, `orchestrator-context.ts:2`, `tracker/adapters/roadmap.ts:3-13`). Renaming it would force unrelated churn into Phase 2 that the proposal scopes to Phase 4.

This plan adopts **option (b) from the user prompt**: the redesigned wide interface is named **`RoadmapTrackerClient`** and lives at `packages/core/src/roadmap/tracker/client.ts`. Both interfaces coexist:

- `IssueTrackerClient` (small, 6 methods) — keeps its current re-export, untouched. Used by orchestrator polling and the file-backed `RoadmapTrackerAdapter`.
- `RoadmapTrackerClient` (wide, 10 methods) — new, used by file-less mode. Phase 4 consumers branch on `roadmap.mode` and pick one.

Rationale: zero Phase 1 churn, preserves layer rules, lets Phase 4 do the consolidation when it is actually consolidating call sites. The proposal's prose says `IssueTrackerClient` for the wide interface; that is captured as a delta in this plan's Decisions and will be reflected in the Phase 6 ADRs.

### 3. The Phase 2 GitHub adapter lives at a different path from the existing GitHub _sync_ adapter

`packages/core/src/roadmap/adapters/github-issues.ts` already exists. It implements `TrackerSyncAdapter` (the **bidirectional** sync engine — `createTicket`/`updateTicket`/`fetchAllTickets`/`fetchTicketState`/`assignTicket`/`addComment`/`fetchComments`). It uses `process.env.GITHUB_TOKEN`, has a working retry loop (`fetchWithRetry`), header builder, and pagination — all reusable patterns. **It is not modified by this plan.**

The new Phase 2 adapter lives at `packages/core/src/roadmap/tracker/adapters/github-issues.ts` (note the `tracker/` segment) and implements `RoadmapTrackerClient`. The two adapters coexist by interface, by directory, and by config knob (`roadmap.tracker.kind: "github"` selects the sync adapter today; `roadmap.tracker.kind: "github-issues"` will select the new one in Phase 4).

To avoid duplicating HTTP plumbing, the new adapter extracts a tiny shared `GitHubHttp` helper (token, headers, retry, fetch override, pagination loop) into `packages/core/src/roadmap/tracker/adapters/github-http.ts`. The existing sync adapter is **not** refactored to consume it in this phase (out of scope, would touch a green file). The helper is a fresh implementation that mirrors `fetchWithRetry` and `headers()` from the sync adapter; future cleanup can deduplicate.

## Decisions (Phase 2 deltas)

| #      | Decision                                                                                                                                                                                                                                                                                                       | Rationale                                                                                                                                                                                                                                                                                                      |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-P2-A | New wide interface named `RoadmapTrackerClient` (not `IssueTrackerClient`). Lives in `packages/core/src/roadmap/tracker/client.ts`. Coexists with the lifted small `IssueTrackerClient`.                                                                                                                       | Zero Phase 1 churn; preserves four orchestrator call sites untouched. Phase 4 will branch consumers on `roadmap.mode` and choose the right interface; that is the right place to resolve naming. The proposal's prose can be reconciled in Phase 6 ADRs.                                                       |
| D-P2-B | Writes are **last-write-wins with refetch-and-compare**, not true `If-Match` OCC. Reads keep `If-None-Match`/304.                                                                                                                                                                                              | GitHub REST does not support `If-Match` on `PATCH /issues/{n}`. Refetch-and-compare gives best-effort conflict detection without inventing a new protocol (e.g., labels-as-locks). Forward-compatible with trackers that do support OCC.                                                                       |
| D-P2-C | Adapter at `packages/core/src/roadmap/tracker/adapters/github-issues.ts` (different path from the existing sync adapter). Shared HTTP helper at `packages/core/src/roadmap/tracker/adapters/github-http.ts`.                                                                                                   | Coexistence with `TrackerSyncAdapter`. Avoids modifying a working green file. Helper deduplicates token/headers/retry/pagination patterns within the new tracker subtree only.                                                                                                                                 |
| D-P2-D | `yaml@^2.8.3` added to `packages/core/package.json` for body-metadata block parse/serialize. Already in repo at root + cli + orchestrator + linter-gen.                                                                                                                                                        | First-class YAML parser is far safer than a hand-rolled regex for arbitrary key/value pairs in user-edited bodies. Same pinned version everywhere keeps the repo consistent.                                                                                                                                   |
| D-P2-E | ETag cache uses a tiny hand-rolled LRU (~30 lines, `Map`-with-touch eviction), not a third-party `lru-cache`. No new runtime dep.                                                                                                                                                                              | Cache is per-process, capped at 500 entries, with no concurrency requirements. Adding an external dep here is overkill and pulls churn into a foundational layer. The shape (`get`/`set`/`invalidate`/`invalidateAll`) is small and stable.                                                                    |
| D-P2-F | Unit tests stub `fetch` with `vi.fn()` (matches the existing `github-issues.test.ts` pattern). Integration tests use `nock`-style recorded fixtures **gated behind `HARNESS_E2E_GITHUB=1`** if and only when written; default test run uses fixtures.                                                          | The existing repo has zero HTTP-mock library dependencies; introducing `nock`/`msw` is a separate decision worth its own ADR. `vi.fn()` covers status/headers/body cleanly. Real-network tests are deferred to Phase 5 or a follow-up.                                                                         |
| D-P2-G | Body-metadata fields canonical for: `spec`, `plan` (singular ref), `blocked_by`, `priority`, `milestone`. Native GitHub fields canonical for: `assignee` (single, from `assignees[0]`), `state`, `milestone-name` (display only). `name` is `issue.title`, `summary` is the body **above** the metadata block. | Matches proposal §"Body metadata block". Single-source-of-truth per field prevents native-vs-block drift. Singular `plan` follows the existing `RoadmapFeature.plans: string[]` for forward parity but persists as `plan: <path>` (one path) in the block; multi-plan support tracked as a Phase 4+ extension. |
| D-P2-H | `blockedBy` resolution is **lazy and N+1-safe**: the body block stores feature names; `fetchAll`/`fetchByStatus` build a name→externalId index from the same response and resolve in-memory. `fetchById` returns the names verbatim (no resolution); callers that need resolution call `fetchAll` first.       | Avoids a hidden N+1 fetch on single-issue reads. The list endpoints already return all issues, so the index is free.                                                                                                                                                                                           |
| D-P2-I | History via comments stores **one event per comment**, prefixed with `<!-- harness-history -->\n`. `fetchHistory` filters all comments client-side (no GitHub-side filter). Pagination follows existing sync adapter's `?per_page=100` pattern.                                                                | Server-side filtering is not available; client-side filter is bounded by issue comment count. Rate-limit budget: 1 comment per state change per feature; 5000 req/hr authenticated covers >1000 features at >1 transition/hour each. Documented in plan.                                                       |
| D-P2-J | ETag cache key shapes: `feature:<externalId>` for individual feature reads, `list:all` for `fetchAll`, `list:status:<sortedStatuses>` for `fetchByStatus`. Writes invalidate `feature:<externalId>` AND `list:*`.                                                                                              | Matches proposal; the sort on status array makes the key deterministic regardless of caller order. Wildcard-invalidate-on-write keeps lists fresh after any mutation.                                                                                                                                          |

## Observable Truths (Acceptance Criteria)

1. **Ubiquitous:** The system shall export `RoadmapTrackerClient`, `TrackedFeature`, `ConflictError`, `HistoryEvent`, `NewFeatureInput`, `FeaturePatch`, and `createTrackerClient` from `@harness-engineering/core/roadmap/tracker` (verified by typed import test).
2. **Ubiquitous:** `packages/core/src/roadmap/tracker/client.ts` shall define `RoadmapTrackerClient` with exactly these 10 methods: `fetchAll`, `fetchById`, `fetchByStatus`, `create`, `update`, `claim`, `release`, `complete`, `appendHistory`, `fetchHistory`.
3. **Ubiquitous:** `packages/core/src/roadmap/tracker/types.ts` shall continue to re-export the four Phase 1 symbols (`IssueTrackerClient`, `Issue`, `BlockerRef`, `TrackerConfig`) unchanged.
4. **Event-driven:** When `body-metadata.parseBodyBlock(body)` is called on a body with a well-formed `<!-- harness-meta:start --> ... <!-- harness-meta:end -->` block, it shall return `{ summary, meta: { spec, plan, blocked_by, priority, milestone } }` parsed via `yaml`. When the block is missing it shall return `{ summary: body.trim(), meta: {} }`. When the block is malformed YAML it shall log a warning and return `{ summary, meta: {} }`.
5. **Event-driven:** When `body-metadata.serializeBodyBlock(summary, meta)` is called, it shall produce a body with the user summary verbatim, two newlines, then a complete `harness-meta` block containing every non-null field from `meta`. Round-trip `parse(serialize(s, m)) === { summary: s, meta: m }` shall hold for all valid `m`.
6. **State-driven:** While the ETag store has a cached entry under key `K` with etag `E`, a `fetchById`/`fetchAll`/`fetchByStatus` call that hits `K` shall send `If-None-Match: E` and, on `304 Not Modified`, return the cached value without re-parsing.
7. **Event-driven:** When `claim(externalId, assignee)` is called and the issue is currently unassigned with status `planned`, it shall PATCH the issue to assign and apply the in-progress label, post a `<!-- harness-history --> {"type":"claimed",...}` comment, and return `Ok(TrackedFeature)`.
8. **Event-driven:** When `claim(externalId, assignee, ifMatch)` is called with a stale `ifMatch` and the server-side state shows the issue is **already claimed by someone else**, the adapter shall return `Err(ConflictError)` with a message naming the current assignee — without writing.
9. **Event-driven:** When `claim(externalId, assignee, ifMatch)` is called with a stale `ifMatch` but the server-side state shows the issue is **already claimed by the same `assignee`**, the adapter shall return `Ok(TrackedFeature)` (idempotent) — without writing.
10. **Event-driven:** When `complete(externalId)` is called on an issue already in the `done` terminal state, it shall return `Ok(TrackedFeature)` (idempotent) — without writing.
11. **Event-driven:** When `appendHistory(externalId, event)` is called, it shall POST a comment whose body starts with `<!-- harness-history -->\n` followed by `JSON.stringify(event)` and return `Ok(undefined)`.
12. **Event-driven:** When `fetchHistory(externalId)` is called, it shall return only events parsed from comments matching the `<!-- harness-history -->` prefix, in chronological order, ignoring all other comments.
13. **Event-driven:** When `fetchAll()` returns features and a body block references `blocked_by: A, B`, the resulting `TrackedFeature.blockedBy` shall list externalIds for features whose `name` matches `A` or `B` (resolved from the same response). Names with no matching feature in the response are filtered out (warned in debug log).
14. **Event-driven:** When `createTrackerClient({ kind: 'github-issues', repo: 'owner/repo', token })` is called, it shall return a `Result<RoadmapTrackerClient>` whose `Ok` value is a fully-functional `GitHubIssuesTrackerAdapter`. When `kind` is unknown it shall return `Err`.
15. **Event-driven:** When `pnpm --filter @harness-engineering/core test` runs the new test files, all tests shall pass with **zero modifications** to any existing test in the repo.
16. **Event-driven:** When `harness validate`, `harness check-deps`, and `pnpm run generate:barrels:check` run after Phase 2 lands, all three shall pass.
17. **Unwanted:** If any file under `packages/core/src/roadmap/tracker/**` imports from `packages/orchestrator/src/**`, `packages/intelligence/src/**`, or any other higher-layer package, then `harness check-deps` shall report a layer violation.
18. **Unwanted:** If a write operation (`update`/`claim`/`release`/`complete`) is called and a refetch shows a clobbering external change to a field in the patch, then the adapter shall **not** issue the PATCH and shall return `Err(ConflictError)` with the diff.

## File Map

```
CREATE packages/core/src/roadmap/tracker/client.ts
       (RoadmapTrackerClient interface + TrackedFeature, NewFeatureInput, FeaturePatch, HistoryEvent, ConflictError)
CREATE packages/core/src/roadmap/tracker/body-metadata.ts
       (parseBodyBlock, serializeBodyBlock, BodyMeta type)
CREATE packages/core/src/roadmap/tracker/etag-store.ts
       (ETagStore class — get/set/invalidate/invalidateAll, hand-rolled LRU)
CREATE packages/core/src/roadmap/tracker/conflict.ts
       (refetchAndCompare helper, ConflictError class, retry policy)
CREATE packages/core/src/roadmap/tracker/factory.ts
       (createTrackerClient(config) -> Result<RoadmapTrackerClient>)
CREATE packages/core/src/roadmap/tracker/adapters/github-http.ts
       (GitHubHttp class — token, headers, fetchWithRetry, paginate; reusable HTTP plumbing)
CREATE packages/core/src/roadmap/tracker/adapters/github-issues.ts
       (GitHubIssuesTrackerAdapter implementing RoadmapTrackerClient)
CREATE packages/core/tests/roadmap/tracker/body-metadata.test.ts
CREATE packages/core/tests/roadmap/tracker/etag-store.test.ts
CREATE packages/core/tests/roadmap/tracker/conflict.test.ts
CREATE packages/core/tests/roadmap/tracker/factory.test.ts
CREATE packages/core/tests/roadmap/tracker/adapters/github-issues.test.ts
CREATE packages/core/tests/roadmap/tracker/adapters/github-issues-conflict.test.ts
       (focused suite for the refetch-and-compare path on update/claim/release/complete)
CREATE packages/core/tests/roadmap/tracker/adapters/github-issues-history.test.ts
       (focused suite for appendHistory + fetchHistory comment filtering)
CREATE packages/core/tests/roadmap/tracker/public-surface.test.ts
       (typed test verifying the Phase 2 public surface: RoadmapTrackerClient + 10 methods + types)

MODIFY packages/core/src/roadmap/tracker/index.ts
       (add re-exports: RoadmapTrackerClient, TrackedFeature, ConflictError, HistoryEvent, NewFeatureInput, FeaturePatch, createTrackerClient. Phase 1 re-exports stay.)
MODIFY packages/core/src/roadmap/index.ts
       (add re-exports for the new public symbols flowing from ./tracker)
MODIFY packages/core/package.json
       (add "yaml": "^2.8.3" to dependencies)
```

Files **not** touched in this phase:

- `packages/core/src/index.ts` — auto-generated; new exports flow through `export * from './roadmap'`. Verified by `pnpm run generate:barrels:check` in Task 18.
- `packages/core/src/roadmap/adapters/github-issues.ts` (sync adapter) — not modified; coexists.
- `packages/core/src/roadmap/tracker/types.ts` (Phase 1 re-export) — not modified.
- All orchestrator code — Phase 4.
- `harness.config.json`, validators — Phase 3.
- Any `manage_roadmap` / dashboard / pilot code — Phase 4.
- Any docs / ADRs / knowledge graph — Phase 6.

## Skeleton

_Skeleton produced (rigor: standard, task count: 18, > threshold of 8). Approval to be obtained at APPROVE_PLAN._

1. **Foundation: types and skill-of-art interface (~3 tasks, ~10 min)**
   `RoadmapTrackerClient`, supporting types, dependency add, public surface scaffolding.
2. **Body-metadata module with TDD (~2 tasks, ~10 min)**
   Parser/serializer round-trip tests then implementation.
3. **ETag store with TDD (~1 task, ~4 min)**
   Hand-rolled LRU with eviction tests.
4. **Conflict helper with TDD (~1 task, ~5 min)**
   Refetch-and-compare logic, retry/backoff, `ConflictError`.
5. **GitHub HTTP helper (~1 task, ~5 min)**
   Token/headers/retry/pagination — extracted minimal patterns.
6. **GitHub adapter — reads (~2 tasks, ~10 min)**
   `fetchAll`, `fetchById`, `fetchByStatus` + ETag integration.
7. **GitHub adapter — writes (~3 tasks, ~15 min)**
   `create`, `update`, `claim`, `release`, `complete` with refetch-and-compare.
8. **GitHub adapter — history (~1 task, ~5 min)**
   `appendHistory`, `fetchHistory` with HTML-comment prefix.
9. **Factory + public-surface barrel (~2 tasks, ~6 min)**
   `createTrackerClient`, index.ts re-exports, public-surface lock.
10. **Validation gate (~2 tasks, ~5 min)**
    `harness validate` + `check-deps` + `barrels:check` + full core test run.

**Estimated total:** 18 tasks, ~75 minutes.

> **APPROVE_PLAN gate:** task count is 18 (= 18, threshold +20 = high) and checkpoints below = 4 (≤ 6). Plan stays at `medium` complexity. Approval may proceed without auto-upgrade. The two architectural risks (D-P2-A, D-P2-B) and the test-infrastructure decision (D-P2-F) MUST be confirmed at the gate.

## Tasks

### Task 1: Add `yaml` dependency to core; create `RoadmapTrackerClient` interface scaffold

**Depends on:** none | **Files:** `packages/core/package.json`, `packages/core/src/roadmap/tracker/client.ts` | **Category:** structure

1. Edit `packages/core/package.json`. Insert `"yaml": "^2.8.3",` into `"dependencies"` in alphabetical order (after `"tree-sitter-wasms": "0.1.13",` and before `"web-tree-sitter": "^0.24.7",`).
2. Run `pnpm install` from the repo root.
3. Create `packages/core/src/roadmap/tracker/client.ts` with exactly:

   ```ts
   /**
    * Phase 2 wide tracker interface (file-less roadmap mode).
    * See docs/changes/roadmap-tracker-only/proposal.md §"IssueTrackerClient interface".
    *
    * Named `RoadmapTrackerClient` (not `IssueTrackerClient`) to avoid colliding
    * with the small interface lifted in Phase 1 (decision D-P2-A).
    */
   import type { Result, FeatureStatus, Priority } from '@harness-engineering/types';

   export interface TrackedFeature {
     externalId: string; // "github:owner/repo#42"
     name: string;
     status: FeatureStatus;
     summary: string;
     spec: string | null;
     plans: string[];
     blockedBy: string[]; // externalIds resolved at read time when possible
     assignee: string | null;
     priority: Priority | null;
     milestone: string | null;
     createdAt: string;
     updatedAt: string | null;
   }

   export interface NewFeatureInput {
     name: string;
     summary: string;
     status?: FeatureStatus;
     spec?: string | null;
     plans?: string[];
     blockedBy?: string[];
     priority?: Priority | null;
     milestone?: string | null;
     assignee?: string | null;
   }

   export type FeaturePatch = Partial<
     Omit<TrackedFeature, 'externalId' | 'createdAt' | 'updatedAt'>
   >;

   export type HistoryEventType =
     | 'created'
     | 'claimed'
     | 'released'
     | 'completed'
     | 'updated'
     | 'reopened';

   export interface HistoryEvent {
     type: HistoryEventType;
     actor: string;
     at: string; // ISO timestamp
     details?: Record<string, unknown>;
   }

   /**
    * ConflictError signals that a write would clobber an external change.
    * Synthesized via refetch-and-compare on writes (D-P2-B); GitHub REST does
    * not natively return 412 on issue PATCH.
    */
   export class ConflictError extends Error {
     readonly code = 'TRACKER_CONFLICT' as const;
     readonly externalId: string;
     readonly diff: Record<string, { ours: unknown; theirs: unknown }>;
     constructor(
       externalId: string,
       diff: Record<string, { ours: unknown; theirs: unknown }>,
       message?: string
     ) {
       super(message ?? `Conflict on ${externalId}: ${Object.keys(diff).join(', ')}`);
       this.name = 'ConflictError';
       this.externalId = externalId;
       this.diff = diff;
     }
   }

   export interface RoadmapTrackerClient {
     // Reads
     fetchAll(): Promise<Result<{ features: TrackedFeature[]; etag: string | null }, Error>>;
     fetchById(
       externalId: string
     ): Promise<Result<{ feature: TrackedFeature; etag: string } | null, Error>>;
     fetchByStatus(statuses: FeatureStatus[]): Promise<Result<TrackedFeature[], Error>>;

     // Writes (ifMatch is forward-compatible; current GitHub backend uses refetch-and-compare)
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

     // History
     appendHistory(externalId: string, event: HistoryEvent): Promise<Result<void, Error>>;
     fetchHistory(externalId: string, limit?: number): Promise<Result<HistoryEvent[], Error>>;
   }
   ```

4. Run `pnpm --filter @harness-engineering/core typecheck`. Expect exit 0.
5. Run `harness validate`. Expect pass.
6. Commit: `feat(core/tracker): add RoadmapTrackerClient interface and yaml dep [phase-2]`

### Task 2: Lock the public surface with a typed test (red)

**Depends on:** Task 1 | **Files:** `packages/core/tests/roadmap/tracker/public-surface.test.ts`

1. Create the file with:

   ```ts
   import { describe, it, expectTypeOf } from 'vitest';
   import type {
     RoadmapTrackerClient,
     TrackedFeature,
     NewFeatureInput,
     FeaturePatch,
     HistoryEvent,
   } from '@harness-engineering/core';
   import { ConflictError, createTrackerClient } from '@harness-engineering/core';

   describe('roadmap/tracker Phase 2 public surface', () => {
     it('exposes RoadmapTrackerClient with the 10 wide methods', () => {
       type Methods = keyof RoadmapTrackerClient;
       expectTypeOf<Methods>().toEqualTypeOf<
         | 'fetchAll'
         | 'fetchById'
         | 'fetchByStatus'
         | 'create'
         | 'update'
         | 'claim'
         | 'release'
         | 'complete'
         | 'appendHistory'
         | 'fetchHistory'
       >();
     });

     it('exposes TrackedFeature with externalId pattern fields', () => {
       expectTypeOf<TrackedFeature>().toHaveProperty('externalId');
       expectTypeOf<TrackedFeature>().toHaveProperty('blockedBy');
       expectTypeOf<TrackedFeature>().toHaveProperty('createdAt');
     });

     it('exposes NewFeatureInput, FeaturePatch, HistoryEvent', () => {
       expectTypeOf<NewFeatureInput>().toHaveProperty('name');
       expectTypeOf<FeaturePatch>().toMatchTypeOf<Partial<TrackedFeature>>();
       expectTypeOf<HistoryEvent>().toHaveProperty('type');
     });

     it('exposes ConflictError as a class', () => {
       expect(typeof ConflictError).toBe('function');
     });

     it('exposes createTrackerClient as a function', () => {
       expect(typeof createTrackerClient).toBe('function');
     });
   });
   ```

   (Note: `expect` and `it` from vitest; add the imports.)

2. Run `pnpm --filter @harness-engineering/core test packages/core/tests/roadmap/tracker/public-surface.test.ts`. **Expect FAILURE** at typecheck (no `RoadmapTrackerClient` re-export from `@harness-engineering/core` yet, no `createTrackerClient`, no `ConflictError` value export).
3. Do NOT commit yet. The test goes green at Task 16.

### Task 3: Implement body-metadata parser tests first (TDD)

**Depends on:** Task 1 | **Files:** `packages/core/tests/roadmap/tracker/body-metadata.test.ts`

1. Create the file with these test groups:
   - **`parseBodyBlock`** — a) body with no block → `{ summary: trimmed body, meta: {} }`. b) body with valid block, all five fields → meta has all five with correct types. c) body with valid block, partial fields → missing fields are `undefined`/null. d) body with malformed YAML inside the markers → returns `{ summary, meta: {} }` and logs a warning (use `vi.spyOn(console, 'warn')`). e) body with `<!-- harness-meta:start -->` but no `:end --> ` → treated as missing block (no infinite reach). f) body with the block at the **start** rather than the end → still parsed; summary = empty string. g) body with **two** blocks → first wins, second ignored (warned).
   - **`serializeBodyBlock`** — a) summary plus full meta → produces a body that, when re-parsed, yields the same input. b) summary plus empty meta → produces summary verbatim with no block. c) summary plus partial meta (only `priority` set) → block contains only `priority` line. d) `summary` containing the literal string `<!-- harness-meta:start -->` (user-quoted in prose) — the serializer always appends a fresh canonical block at the end; the false marker in summary is preserved as-is.
   - **`round-trip`** — `parse(serialize(s, m))` deep-equals `{ summary: s, meta: m }` for a property table of representative inputs.

2. Run `pnpm --filter @harness-engineering/core test packages/core/tests/roadmap/tracker/body-metadata.test.ts`. **Expect FAILURE** (module does not exist).

### Task 4: Implement `body-metadata.ts` to make tests pass

**Depends on:** Task 3 | **Files:** `packages/core/src/roadmap/tracker/body-metadata.ts`

1. Create the file:

   ```ts
   import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
   import type { Priority } from '@harness-engineering/types';

   const START_MARKER = '<!-- harness-meta:start -->';
   const END_MARKER = '<!-- harness-meta:end -->';

   export interface BodyMeta {
     spec?: string | null;
     plan?: string | null; // singular ref; multi-plan deferred
     blocked_by?: string[];
     priority?: Priority | null;
     milestone?: string | null;
   }

   export interface ParsedBody {
     summary: string;
     meta: BodyMeta;
   }

   /**
    * Tolerant parser. See spec §"Body metadata block".
    * - Missing block → meta = {}
    * - Malformed YAML → log warning, meta = {}
    * - Multiple blocks → first wins
    */
   export function parseBodyBlock(body: string): ParsedBody {
     const startIdx = body.indexOf(START_MARKER);
     if (startIdx === -1) return { summary: body.trim(), meta: {} };

     const endIdx = body.indexOf(END_MARKER, startIdx + START_MARKER.length);
     if (endIdx === -1) return { summary: body.trim(), meta: {} };

     // Warn on multiple blocks
     const secondStart = body.indexOf(START_MARKER, endIdx + END_MARKER.length);
     if (secondStart !== -1) {
       // eslint-disable-next-line no-console
       console.warn('harness-meta: multiple blocks found; first wins.');
     }

     const yamlText = body.slice(startIdx + START_MARKER.length, endIdx).trim();
     let meta: BodyMeta = {};
     try {
       const parsed = parseYaml(yamlText);
       if (parsed && typeof parsed === 'object') {
         meta = normalizeBodyMeta(parsed as Record<string, unknown>);
       }
     } catch (e) {
       // eslint-disable-next-line no-console
       console.warn(
         `harness-meta: malformed YAML, treating block as missing: ${(e as Error).message}`
       );
       meta = {};
     }

     // Summary is everything before the start marker, trimmed.
     const summary = body.slice(0, startIdx).trim();
     return { summary, meta };
   }

   function normalizeBodyMeta(raw: Record<string, unknown>): BodyMeta {
     const out: BodyMeta = {};
     if (typeof raw.spec === 'string') out.spec = raw.spec;
     if (typeof raw.plan === 'string') out.plan = raw.plan;
     if (typeof raw.blocked_by === 'string') {
       out.blocked_by = raw.blocked_by
         .split(',')
         .map((s) => s.trim())
         .filter(Boolean);
     } else if (Array.isArray(raw.blocked_by)) {
       out.blocked_by = (raw.blocked_by as unknown[]).filter(
         (v): v is string => typeof v === 'string'
       );
     }
     if (typeof raw.priority === 'string' && ['P0', 'P1', 'P2', 'P3'].includes(raw.priority)) {
       out.priority = raw.priority as Priority;
     }
     if (typeof raw.milestone === 'string') out.milestone = raw.milestone;
     return out;
   }

   /**
    * Always emits a canonical block at the end of the body.
    * Empty meta → no block (returns summary verbatim, trimmed).
    */
   export function serializeBodyBlock(summary: string, meta: BodyMeta): string {
     const ordered: Record<string, unknown> = {};
     if (meta.spec !== undefined && meta.spec !== null) ordered.spec = meta.spec;
     if (meta.plan !== undefined && meta.plan !== null) ordered.plan = meta.plan;
     if (meta.blocked_by !== undefined && meta.blocked_by.length > 0) {
       ordered.blocked_by = meta.blocked_by.join(', ');
     }
     if (meta.priority !== undefined && meta.priority !== null) {
       ordered.priority = meta.priority;
     }
     if (meta.milestone !== undefined && meta.milestone !== null) {
       ordered.milestone = meta.milestone;
     }

     const trimmed = summary.trim();
     if (Object.keys(ordered).length === 0) return trimmed;

     const yamlBody = stringifyYaml(ordered).trimEnd();
     const block = `${START_MARKER}\n${yamlBody}\n${END_MARKER}`;
     return trimmed.length > 0 ? `${trimmed}\n\n${block}` : block;
   }
   ```

2. Run `pnpm --filter @harness-engineering/core test packages/core/tests/roadmap/tracker/body-metadata.test.ts`. **Expect PASS** (all groups). Iterate until green.
3. Run `harness validate` and `harness check-deps`. Expect pass.
4. Commit: `feat(core/tracker): body-metadata parse/serialize with yaml round-trip [phase-2]`

### Task 5: Implement `etag-store.ts` with TDD

**Depends on:** Task 1 | **Files:** `packages/core/tests/roadmap/tracker/etag-store.test.ts`, `packages/core/src/roadmap/tracker/etag-store.ts`

1. Create the test file. Cover: a) `set`+`get` round-trip returns `{ etag, data }`. b) `get` on missing key returns `null`. c) `invalidate(key)` removes the entry. d) `invalidateAll()` empties the cache. e) LRU eviction: cap=3, set 4 keys, the first one is evicted (verify via `get` returning null). f) "Touch on get" semantics: set A, B, C; `get(A)` to touch; set D; expect B (not A) evicted.
2. Run the test. **Expect FAILURE** (module does not exist).
3. Create `packages/core/src/roadmap/tracker/etag-store.ts`:

   ```ts
   /**
    * Per-process LRU ETag cache. Keys: `feature:<externalId>`, `list:all`,
    * `list:status:<sortedStatuses>`. No cross-process invalidation.
    * See spec §"ETag store" and decision D-P2-E (no third-party LRU).
    */
   export class ETagStore {
     private readonly max: number;
     private readonly cache = new Map<string, { etag: string; data: unknown }>();

     constructor(max = 500) {
       this.max = max;
     }

     get(key: string): { etag: string; data: unknown } | null {
       const entry = this.cache.get(key);
       if (!entry) return null;
       // touch: move to end of insertion order
       this.cache.delete(key);
       this.cache.set(key, entry);
       return entry;
     }

     set(key: string, etag: string, data: unknown): void {
       if (this.cache.has(key)) this.cache.delete(key);
       this.cache.set(key, { etag, data });
       if (this.cache.size > this.max) {
         const oldestKey = this.cache.keys().next().value;
         if (oldestKey !== undefined) this.cache.delete(oldestKey);
       }
     }

     invalidate(key: string): void {
       this.cache.delete(key);
     }

     invalidateAll(): void {
       this.cache.clear();
     }

     /** Invalidate all keys matching a prefix. Used when writes invalidate `list:*`. */
     invalidatePrefix(prefix: string): void {
       for (const key of [...this.cache.keys()]) {
         if (key.startsWith(prefix)) this.cache.delete(key);
       }
     }

     get size(): number {
       return this.cache.size;
     }
   }
   ```

4. Run the test. **Expect PASS**.
5. Run `harness validate` and `harness check-deps`. Expect pass.
6. Commit: `feat(core/tracker): in-memory LRU ETag store [phase-2]`

### Task 6: Implement `conflict.ts` (refetch-and-compare helper) with TDD

**Depends on:** Task 1 | **Files:** `packages/core/tests/roadmap/tracker/conflict.test.ts`, `packages/core/src/roadmap/tracker/conflict.ts`

1. Create the test file. Cover:
   a) `refetchAndCompare(current, patch)` where the server's current state matches what the cached ETag implied → returns `{ ok: true }` (no conflict).
   b) Server's `assignee` differs from caller's stale view, and `patch.assignee` would clobber it → returns `{ ok: false, diff: { assignee: { ours: 'X', theirs: 'Y' } } }`.
   c) Server's status is more advanced than caller's view (e.g., `done` already), patch tries to set it back to `in-progress` → conflict (terminal state is sticky for status).
   d) Idempotent claim: server already claimed by same `assignee` we are about to set → `{ ok: true, idempotent: true }`.
   e) Idempotent complete: server already `done`, patch sets `done` → `{ ok: true, idempotent: true }`.
   f) `withBackoff(fn, { maxAttempts: 3, baseDelayMs: 10 })` retries on transient errors but bubbles `ConflictError` immediately.

2. Run the test. **Expect FAILURE**.
3. Create `packages/core/src/roadmap/tracker/conflict.ts`:

   ```ts
   import type { Priority, FeatureStatus } from '@harness-engineering/types';
   import type { TrackedFeature, FeaturePatch } from './client';
   import { ConflictError } from './client';

   export interface CompareResult {
     ok: boolean;
     idempotent?: boolean;
     diff?: Record<string, { ours: unknown; theirs: unknown }>;
   }

   /**
    * Compare a planned patch against the server's freshly-fetched state.
    * Returns ok:true when the patch is safe (or idempotent); ok:false with diff
    * when applying the patch would clobber an external change.
    *
    * Rules per spec §"Conflict-resolution policy" + decision D-P2-B:
    * - terminal state 'done' is sticky: any patch that would un-set it conflicts
    * - assignee mismatch is a conflict unless our patch is exactly the server's value (idempotent)
    * - status mismatch is a conflict unless our patch matches (idempotent)
    * - other field mismatches are flagged as a diff
    */
   export function refetchAndCompare(server: TrackedFeature, patch: FeaturePatch): CompareResult {
     const diff: Record<string, { ours: unknown; theirs: unknown }> = {};
     let idempotent = true;

     // Status: terminal-sticky, idempotent if same
     if (patch.status !== undefined) {
       if (server.status === 'done' && patch.status !== 'done') {
         diff.status = { ours: patch.status, theirs: server.status };
       } else if (server.status !== patch.status) {
         idempotent = false;
       }
     }

     // Assignee: idempotent only when equal
     if (patch.assignee !== undefined) {
       if (server.assignee !== null && server.assignee !== patch.assignee) {
         diff.assignee = { ours: patch.assignee, theirs: server.assignee };
       } else if (server.assignee !== patch.assignee) {
         idempotent = false;
       }
     }

     // Other scalar fields: diff if server already has a different non-null value
     for (const key of ['priority', 'milestone', 'spec'] as const) {
       const next = patch[key];
       if (next === undefined) continue;
       const cur = server[key];
       if (cur !== null && cur !== next) {
         diff[key] = { ours: next, theirs: cur };
       } else if (cur !== next) {
         idempotent = false;
       }
     }

     // Arrays (plans, blockedBy): diff only on inequality of intent (no merge here)
     if (patch.plans !== undefined && !arraysEqual(patch.plans, server.plans)) {
       idempotent = false;
       if (server.plans.length > 0 && server.plans.some((p) => !patch.plans!.includes(p))) {
         diff.plans = { ours: patch.plans, theirs: server.plans };
       }
     }
     if (patch.blockedBy !== undefined && !arraysEqual(patch.blockedBy, server.blockedBy)) {
       idempotent = false;
       if (
         server.blockedBy.length > 0 &&
         server.blockedBy.some((b) => !patch.blockedBy!.includes(b))
       ) {
         diff.blockedBy = { ours: patch.blockedBy, theirs: server.blockedBy };
       }
     }

     if (Object.keys(diff).length > 0) return { ok: false, diff };
     return { ok: true, idempotent };
   }

   function arraysEqual<T>(a: T[], b: T[]): boolean {
     if (a.length !== b.length) return false;
     const sa = [...a].sort();
     const sb = [...b].sort();
     return sa.every((v, i) => v === sb[i]);
   }

   export interface BackoffOpts {
     maxAttempts: number;
     baseDelayMs: number;
     sleep?: (ms: number) => Promise<void>;
   }

   export async function withBackoff<T>(fn: () => Promise<T>, opts: BackoffOpts): Promise<T> {
     const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
     let lastErr: unknown;
     for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
       try {
         return await fn();
       } catch (err) {
         if (err instanceof ConflictError) throw err; // do not retry conflicts
         lastErr = err;
         if (attempt === opts.maxAttempts - 1) break;
         await sleep(opts.baseDelayMs * Math.pow(2, attempt));
       }
     }
     throw lastErr;
   }

   export { ConflictError } from './client';
   ```

4. Run the test. **Expect PASS**. Iterate as needed.
5. Run `harness validate` and `harness check-deps`. Expect pass.
6. Commit: `feat(core/tracker): refetch-and-compare conflict helper [phase-2]`

### Task 7: Implement `github-http.ts` shared helper

**Depends on:** Task 1 | **Files:** `packages/core/src/roadmap/tracker/adapters/github-http.ts`

1. Create the file with a small `GitHubHttp` class:

   ```ts
   /**
    * Shared HTTP plumbing for the Phase 2 GitHub Issues tracker adapter.
    * Mirrors `fetchWithRetry` and `headers()` from the existing sync adapter
    * (packages/core/src/roadmap/adapters/github-issues.ts) without reaching
    * across the tracker/sync directory boundary.
    *
    * NOT intended to replace the sync adapter's HTTP code in this phase
    * (out of scope; would touch a green file). Future cleanup may
    * consolidate (decision D-P2-C).
    */
   export interface GitHubHttpOptions {
     token: string;
     fetchFn?: typeof fetch;
     apiBase?: string;
     maxRetries?: number;
     baseDelayMs?: number;
   }

   const DEFAULTS = { maxRetries: 5, baseDelayMs: 1000 };

   export class GitHubHttp {
     private readonly token: string;
     private readonly fetchFn: typeof fetch;
     readonly apiBase: string;
     private readonly retryOpts: { maxRetries: number; baseDelayMs: number };

     constructor(opts: GitHubHttpOptions) {
       this.token = opts.token;
       this.fetchFn = opts.fetchFn ?? globalThis.fetch;
       this.apiBase = opts.apiBase ?? 'https://api.github.com';
       this.retryOpts = {
         maxRetries: opts.maxRetries ?? DEFAULTS.maxRetries,
         baseDelayMs: opts.baseDelayMs ?? DEFAULTS.baseDelayMs,
       };
     }

     headers(extra?: Record<string, string>): Record<string, string> {
       return {
         Authorization: `Bearer ${this.token}`,
         Accept: 'application/vnd.github+json',
         'Content-Type': 'application/json',
         'X-GitHub-Api-Version': '2022-11-28',
         ...(extra ?? {}),
       };
     }

     async request(
       url: string,
       init: RequestInit & { extraHeaders?: Record<string, string> }
     ): Promise<Response> {
       const { extraHeaders, ...rest } = init;
       const merged: RequestInit = {
         ...rest,
         headers: this.headers(extraHeaders),
       };
       return this.fetchWithRetry(url, merged);
     }

     private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
       let last: Response | undefined;
       for (let attempt = 0; attempt <= this.retryOpts.maxRetries; attempt++) {
         const res = await this.fetchFn(url, init);
         if (res.status !== 403 && res.status !== 429 && res.status < 500) return res;
         last = res;
         if (attempt === this.retryOpts.maxRetries) break;
         const retryAfter = res.headers.get('Retry-After');
         let delayMs: number;
         if (retryAfter) {
           const seconds = parseInt(retryAfter, 10);
           delayMs = isNaN(seconds) ? this.retryOpts.baseDelayMs : seconds * 1000;
         } else {
           delayMs = this.retryOpts.baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;
         }
         await new Promise((r) => setTimeout(r, delayMs));
       }
       return last!;
     }

     /**
      * Walk all pages of a paginated GET. Stops when a page returns < perPage items.
      */
     async paginate<T>(
       buildUrl: (page: number) => string,
       perPage = 100,
       extraHeaders?: Record<string, string>
     ): Promise<{ items: T[]; lastEtag: string | null; status: number }> {
       const items: T[] = [];
       let page = 1;
       let lastEtag: string | null = null;
       let status = 200;
       while (true) {
         const res = await this.request(buildUrl(page), {
           method: 'GET',
           extraHeaders,
         });
         status = res.status;
         lastEtag = res.headers.get('ETag');
         if (res.status === 304) return { items, lastEtag, status };
         if (!res.ok) {
           throw new Error(`GitHub ${res.status}: ${await res.text()}`);
         }
         const data = (await res.json()) as T[];
         items.push(...data);
         if (data.length < perPage) break;
         page++;
       }
       return { items, lastEtag, status };
     }
   }

   export function parseExternalId(
     externalId: string
   ): { owner: string; repo: string; number: number } | null {
     const m = externalId.match(/^github:([^/]+)\/([^#]+)#(\d+)$/);
     if (!m) return null;
     return { owner: m[1]!, repo: m[2]!, number: parseInt(m[3]!, 10) };
   }

   export function buildExternalId(owner: string, repo: string, n: number): string {
     return `github:${owner}/${repo}#${n}`;
   }
   ```

2. Run `pnpm --filter @harness-engineering/core typecheck`. Expect exit 0.
3. Run `harness validate` and `harness check-deps`. Expect pass.
4. Commit: `feat(core/tracker): shared GitHubHttp helper for adapter HTTP plumbing [phase-2]`

### Task 8: GitHub adapter — `fetchAll` and `fetchById` (read path with ETag) — tests first

**Depends on:** Tasks 4, 5, 7 | **Files:** `packages/core/tests/roadmap/tracker/adapters/github-issues.test.ts`

1. Create the test file with these test groups (use `vi.fn()` to stub `fetch`, mirroring the existing `github-issues.test.ts` pattern):
   - `fetchAll`: a) Returns `{ features, etag }` from a single page of issues with body-metadata blocks. b) Resolves `blockedBy` names → externalIds via the same response. c) When the cache has a match for `list:all` and the server returns `304`, returns the cached features (asserted via `vi.fn().mock.calls.length`). d) When the cache has a match but the server returns `200` with new etag, replaces the cache. e) Skips PRs (`pull_request` field present). f) Sorts by `createdAt` ascending.
   - `fetchById`: a) Maps native fields + body block correctly. b) Returns `Ok(null)` on 404. c) On 304 with cached entry, returns cached value. d) On Err response, returns `Err`.
2. Run the test. **Expect FAILURE** (adapter does not exist).

### Task 9: GitHub adapter — implement reads to make tests pass

**Depends on:** Task 8 | **Files:** `packages/core/src/roadmap/tracker/adapters/github-issues.ts`

1. Create the adapter with read methods. Skeleton:

   ```ts
   import type { Result, FeatureStatus } from '@harness-engineering/types';
   import { Ok, Err } from '@harness-engineering/types';
   import type {
     RoadmapTrackerClient,
     TrackedFeature,
     NewFeatureInput,
     FeaturePatch,
     HistoryEvent,
     ConflictError,
   } from '../client';
   import { ConflictError as ConflictErrorClass } from '../client';
   import { GitHubHttp, parseExternalId, buildExternalId } from './github-http';
   import { ETagStore } from '../etag-store';
   import { parseBodyBlock, serializeBodyBlock, type BodyMeta } from '../body-metadata';
   import { refetchAndCompare, withBackoff } from '../conflict';

   export interface GitHubIssuesTrackerOptions {
     token: string;
     repo: string; // "owner/repo"
     fetchFn?: typeof fetch;
     apiBase?: string;
     maxRetries?: number;
     baseDelayMs?: number;
     etagStore?: ETagStore;
     /** Label that selects harness-managed issues (default: `harness-managed`). */
     selectorLabel?: string;
   }

   interface RawIssue {
     number: number;
     title: string;
     state: 'open' | 'closed';
     body: string | null;
     labels: Array<{ name: string }>;
     assignees: Array<{ login: string }>;
     milestone: { title: string } | null;
     created_at: string;
     updated_at: string | null;
     pull_request?: unknown;
   }

   export class GitHubIssuesTrackerAdapter implements RoadmapTrackerClient {
     private readonly http: GitHubHttp;
     private readonly owner: string;
     private readonly repo: string;
     private readonly cache: ETagStore;
     private readonly selectorLabel: string;

     constructor(opts: GitHubIssuesTrackerOptions) {
       this.http = new GitHubHttp(opts);
       const [owner, repo] = opts.repo.split('/');
       if (!owner || !repo) throw new Error(`Invalid repo "${opts.repo}", expected "owner/repo"`);
       this.owner = owner;
       this.repo = repo;
       this.cache = opts.etagStore ?? new ETagStore(500);
       this.selectorLabel = opts.selectorLabel ?? 'harness-managed';
     }

     // --- Reads ---

     async fetchAll(): Promise<Result<{ features: TrackedFeature[]; etag: string | null }, Error>> {
       try {
         const cacheKey = 'list:all';
         const cached = this.cache.get(cacheKey);
         const labelsParam = `&labels=${encodeURIComponent(this.selectorLabel)}`;
         const buildUrl = (page: number) =>
           `${this.http.apiBase}/repos/${this.owner}/${this.repo}/issues?state=all&per_page=100&page=${page}${labelsParam}`;

         const headers = cached ? { 'If-None-Match': cached.etag } : undefined;
         const { items, lastEtag, status } = await this.http.paginate<RawIssue>(
           buildUrl,
           100,
           headers
         );

         if (status === 304 && cached) {
           return Ok({ features: cached.data as TrackedFeature[], etag: cached.etag });
         }

         const issues = items.filter((i) => !i.pull_request);
         const nameIndex = new Map<string, string>();
         for (const i of issues) {
           nameIndex.set(i.title, buildExternalId(this.owner, this.repo, i.number));
         }
         const features = issues.map((i) => this.mapIssue(i, nameIndex));
         features.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

         if (lastEtag) this.cache.set(cacheKey, lastEtag, features);
         return Ok({ features, etag: lastEtag });
       } catch (err) {
         return Err(err instanceof Error ? err : new Error(String(err)));
       }
     }

     async fetchById(
       externalId: string
     ): Promise<Result<{ feature: TrackedFeature; etag: string } | null, Error>> {
       try {
         const parsed = parseExternalId(externalId);
         if (!parsed) return Err(new Error(`Invalid externalId: "${externalId}"`));

         const cacheKey = `feature:${externalId}`;
         const cached = this.cache.get(cacheKey);
         const headers = cached ? { 'If-None-Match': cached.etag } : undefined;

         const res = await this.http.request(
           `${this.http.apiBase}/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}`,
           { method: 'GET', extraHeaders: headers }
         );

         if (res.status === 404) return Ok(null);
         if (res.status === 304 && cached) {
           return Ok({ feature: cached.data as TrackedFeature, etag: cached.etag });
         }
         if (!res.ok) return Err(new Error(`GitHub ${res.status}: ${await res.text()}`));

         const data = (await res.json()) as RawIssue;
         const etag = res.headers.get('ETag');
         if (data.pull_request) return Ok(null);
         const feature = this.mapIssue(data, new Map());
         if (etag) this.cache.set(cacheKey, etag, feature);
         return Ok({ feature, etag: etag ?? '' });
       } catch (err) {
         return Err(err instanceof Error ? err : new Error(String(err)));
       }
     }

     async fetchByStatus(statuses: FeatureStatus[]): Promise<Result<TrackedFeature[], Error>> {
       const all = await this.fetchAll();
       if (!all.ok) return all;
       return Ok(all.value.features.filter((f) => statuses.includes(f.status)));
     }

     // --- Stubs for now: write methods + history ---
     async create(_feature: NewFeatureInput): Promise<Result<TrackedFeature, Error>> {
       return Err(new Error('not implemented'));
     }
     async update(
       _id: string,
       _patch: FeaturePatch,
       _ifMatch?: string
     ): Promise<Result<TrackedFeature, ConflictError | Error>> {
       return Err(new Error('not implemented'));
     }
     async claim(
       _id: string,
       _assignee: string,
       _ifMatch?: string
     ): Promise<Result<TrackedFeature, ConflictError | Error>> {
       return Err(new Error('not implemented'));
     }
     async release(
       _id: string,
       _ifMatch?: string
     ): Promise<Result<TrackedFeature, ConflictError | Error>> {
       return Err(new Error('not implemented'));
     }
     async complete(
       _id: string,
       _ifMatch?: string
     ): Promise<Result<TrackedFeature, ConflictError | Error>> {
       return Err(new Error('not implemented'));
     }
     async appendHistory(_id: string, _e: HistoryEvent): Promise<Result<void, Error>> {
       return Err(new Error('not implemented'));
     }
     async fetchHistory(_id: string, _limit?: number): Promise<Result<HistoryEvent[], Error>> {
       return Err(new Error('not implemented'));
     }

     // --- Helpers ---
     private mapIssue(issue: RawIssue, nameIndex: Map<string, string>): TrackedFeature {
       const { summary, meta } = parseBodyBlock(issue.body ?? '');
       const status = this.mapStatus(issue, meta);
       const blockedByExt: string[] = [];
       for (const name of meta.blocked_by ?? []) {
         const ext = nameIndex.get(name);
         if (ext) blockedByExt.push(ext);
         else if (process.env.DEBUG?.includes('harness:tracker')) {
           // eslint-disable-next-line no-console
           console.debug(`harness-tracker: blocked_by "${name}" not in response`);
         }
       }
       return {
         externalId: buildExternalId(this.owner, this.repo, issue.number),
         name: issue.title,
         status,
         summary,
         spec: meta.spec ?? null,
         plans: meta.plan ? [meta.plan] : [],
         blockedBy: blockedByExt,
         assignee: issue.assignees[0]?.login ? `@${issue.assignees[0].login}` : null,
         priority: meta.priority ?? null,
         milestone: issue.milestone?.title ?? meta.milestone ?? null,
         createdAt: issue.created_at,
         updatedAt: issue.updated_at ?? null,
       };
     }

     private mapStatus(issue: RawIssue, meta: BodyMeta): FeatureStatus {
       if (issue.state === 'closed') return 'done';
       const labels = issue.labels.map((l) => l.name);
       if (labels.includes('blocked')) return 'blocked';
       if (labels.includes('needs-human')) return 'needs-human';
       if (labels.includes('in-progress') || issue.assignees.length > 0) return 'in-progress';
       if (labels.includes('planned')) return 'planned';
       return 'backlog';
     }
   }
   ```

2. Run the test. **Expect PASS** for the read group. Iterate.
3. Run `harness validate` and `harness check-deps`. Expect pass.
4. Commit: `feat(core/tracker): GitHub adapter read methods with ETag conditional GET [phase-2]`

### Task 10: GitHub adapter — `create` and `update` — tests + impl

**Depends on:** Task 9 | **Files:** `packages/core/tests/roadmap/tracker/adapters/github-issues.test.ts`, `packages/core/src/roadmap/tracker/adapters/github-issues.ts`

1. Append tests for `create`:
   a) POST `/issues` with title=`name`, body=`serializeBodyBlock(summary, meta)`, labels include `selectorLabel` + status label, milestone resolved by name. b) Returns `Ok(TrackedFeature)` with the new externalId. c) Invalidates `list:*` after create.
2. Append tests for `update`:
   a) Patch with no `ifMatch` issues an unconditional PATCH and returns the updated feature. b) Patch with `ifMatch` matching the cached etag triggers a fresh GET first; on no diff it issues the PATCH; on a server-side diff it returns `Err(ConflictError)` without writing. c) Body-meta fields in patch round-trip via `serializeBodyBlock`. d) Status change applies the new status label and removes prior status labels. e) Invalidates `feature:<externalId>` and `list:*`.
3. Run tests. **Expect FAILURE** (stubs).
4. Implement `create` and `update` in the adapter. Use `refetchAndCompare` for `update`. Sketch:

   ```ts
   async create(feature: NewFeatureInput): Promise<Result<TrackedFeature, Error>> {
     try {
       const meta: BodyMeta = {
         spec: feature.spec ?? undefined,
         plan: feature.plans?.[0] ?? undefined,
         blocked_by: feature.blockedBy,
         priority: feature.priority ?? undefined,
         milestone: feature.milestone ?? undefined,
       };
       const body = serializeBodyBlock(feature.summary ?? '', meta);
       const labels = [this.selectorLabel];
       if (feature.status && feature.status !== 'backlog') labels.push(feature.status);
       const payload: Record<string, unknown> = {
         title: feature.name,
         body,
         labels,
       };
       if (feature.assignee) payload.assignees = [feature.assignee.replace(/^@/, '')];
       const res = await this.http.request(
         `${this.http.apiBase}/repos/${this.owner}/${this.repo}/issues`,
         { method: 'POST', body: JSON.stringify(payload) }
       );
       if (!res.ok) return Err(new Error(`GitHub ${res.status}: ${await res.text()}`));
       const data = (await res.json()) as RawIssue;
       this.cache.invalidatePrefix('list:');
       return Ok(this.mapIssue(data, new Map()));
     } catch (err) {
       return Err(err instanceof Error ? err : new Error(String(err)));
     }
   }

   async update(
     externalId: string,
     patch: FeaturePatch,
     ifMatch?: string
   ): Promise<Result<TrackedFeature, ConflictError | Error>> {
     try {
       const parsed = parseExternalId(externalId);
       if (!parsed) return Err(new Error(`Invalid externalId: "${externalId}"`));

       // Refetch-and-compare guard (decision D-P2-B)
       if (ifMatch) {
         const cur = await this.fetchById(externalId);
         if (!cur.ok) return cur;
         if (!cur.value) return Err(new Error(`Not found: ${externalId}`));
         const cmp = refetchAndCompare(cur.value.feature, patch);
         if (!cmp.ok) return Err(new ConflictErrorClass(externalId, cmp.diff!));
         if (cmp.idempotent) return Ok(cur.value.feature);
       }

       // Build PATCH payload
       const reqBody = await this.buildIssuePatchBody(externalId, patch);
       const res = await this.http.request(
         `${this.http.apiBase}/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}`,
         { method: 'PATCH', body: JSON.stringify(reqBody) }
       );
       if (!res.ok) return Err(new Error(`GitHub ${res.status}: ${await res.text()}`));
       const data = (await res.json()) as RawIssue;
       this.cache.invalidate(`feature:${externalId}`);
       this.cache.invalidatePrefix('list:');
       return Ok(this.mapIssue(data, new Map()));
     } catch (err) {
       return Err(err instanceof Error ? err : new Error(String(err)));
     }
   }

   private async buildIssuePatchBody(
     externalId: string,
     patch: FeaturePatch
   ): Promise<Record<string, unknown>> {
     const out: Record<string, unknown> = {};
     if (patch.name !== undefined) out.title = patch.name;
     if (patch.assignee !== undefined) {
       out.assignees = patch.assignee ? [patch.assignee.replace(/^@/, '')] : [];
     }
     if (patch.status !== undefined) {
       if (patch.status === 'done') out.state = 'closed';
       else out.state = 'open';
     }
     // Body-meta fields → re-serialize body (requires reading current body)
     const bodyTouches: Array<keyof FeaturePatch> = [
       'summary',
       'spec',
       'plans',
       'blockedBy',
       'priority',
       'milestone',
     ];
     if (bodyTouches.some((k) => patch[k] !== undefined)) {
       const cur = await this.fetchById(externalId);
       if (!cur.ok || !cur.value) throw new Error('Cannot rebuild body without current state');
       const meta: BodyMeta = {
         spec: patch.spec ?? cur.value.feature.spec ?? undefined,
         plan: patch.plans?.[0] ?? cur.value.feature.plans[0] ?? undefined,
         blocked_by: patch.blockedBy ?? cur.value.feature.blockedBy,
         priority: patch.priority ?? cur.value.feature.priority ?? undefined,
         milestone: patch.milestone ?? cur.value.feature.milestone ?? undefined,
       };
       out.body = serializeBodyBlock(patch.summary ?? cur.value.feature.summary, meta);
     }
     return out;
   }
   ```

5. Run tests. **Expect PASS**.
6. Run `harness validate`, `harness check-deps`. Expect pass.
7. Commit: `feat(core/tracker): GitHub adapter create/update with refetch-and-compare [phase-2]`

### Task 11: GitHub adapter — `claim`, `release`, `complete` — tests + impl

**Depends on:** Task 10 | **Files:** `packages/core/tests/roadmap/tracker/adapters/github-issues-conflict.test.ts`, `packages/core/src/roadmap/tracker/adapters/github-issues.ts`

[checkpoint:human-verify]

1. Create the focused conflict-suite test file. Cover:
   - `claim`: a) Plain success (assignee, in-progress label, optional history side-effect deferred to Task 12). b) Idempotent: already claimed by same assignee → no PATCH issued (verify via `vi.fn().mock.calls`). c) Conflict: claimed by someone else → returns `Err(ConflictError)` with current assignee in message; no PATCH. d) Stale `ifMatch`: refetch shows same state → still works. e) Stale `ifMatch`: refetch shows external change to body-meta → conflict.
   - `release`: a) Plain success (clear assignees, drop in-progress label). b) Idempotent if not in-progress. c) Conflict if claimed by someone else (we should not release another's claim).
   - `complete`: a) Plain success (close issue, transition status). b) Idempotent if `done`. c) `done` is sticky: server is `done`, our `ifMatch` says `in-progress` → idempotent success (decision D-P2-B / `refetchAndCompare`).
2. Run tests. **Expect FAILURE** (stubs).
3. Implement on top of `update` to centralize the refetch logic. Sketch:

   ```ts
   async claim(externalId: string, assignee: string, ifMatch?: string) {
     return this.update(
       externalId,
       { assignee, status: 'in-progress' },
       ifMatch
     ) as Promise<Result<TrackedFeature, ConflictError | Error>>;
   }
   async release(externalId: string, ifMatch?: string) {
     return this.update(externalId, { assignee: null, status: 'backlog' }, ifMatch);
   }
   async complete(externalId: string, ifMatch?: string) {
     return this.update(externalId, { status: 'done' }, ifMatch);
   }
   ```

4. Add a status-label-pruning step inside `buildIssuePatchBody` when `patch.status` is set: list desired labels = `[selectorLabel] + (status==='backlog' ? [] : [status])` while preserving non-status labels (read current labels via the same refetched issue from `update`).
5. Run tests. **Expect PASS**.
6. Run `harness validate`, `harness check-deps`. Expect pass.
7. Commit: `feat(core/tracker): GitHub adapter claim/release/complete via update + refetch [phase-2]`

### Task 12: GitHub adapter — `appendHistory` and `fetchHistory` — tests + impl

**Depends on:** Task 11 | **Files:** `packages/core/tests/roadmap/tracker/adapters/github-issues-history.test.ts`, `packages/core/src/roadmap/tracker/adapters/github-issues.ts`

1. Create the test file. Cover:
   a) `appendHistory` posts a comment whose body is exactly `<!-- harness-history -->\n${JSON.stringify(event)}`.
   b) `fetchHistory` returns parsed events from comments matching the prefix; ignores comments without it; ignores malformed JSON within prefixed comments (warns).
   c) `fetchHistory` paginates via `?per_page=100` until `data.length < 100`.
   d) `fetchHistory` returns events sorted by `at` ASC (chronological).
   e) `limit` parameter trims the result to the most-recent `limit` events.
2. Run tests. **Expect FAILURE**.
3. Implement:

   ```ts
   private static HISTORY_PREFIX = '<!-- harness-history -->';

   async appendHistory(externalId: string, event: HistoryEvent): Promise<Result<void, Error>> {
     try {
       const parsed = parseExternalId(externalId);
       if (!parsed) return Err(new Error(`Invalid externalId: "${externalId}"`));
       const body = `${GitHubIssuesTrackerAdapter.HISTORY_PREFIX}\n${JSON.stringify(event)}`;
       const res = await this.http.request(
         `${this.http.apiBase}/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}/comments`,
         { method: 'POST', body: JSON.stringify({ body }) }
       );
       if (!res.ok) return Err(new Error(`GitHub ${res.status}: ${await res.text()}`));
       return Ok(undefined);
     } catch (err) {
       return Err(err instanceof Error ? err : new Error(String(err)));
     }
   }

   async fetchHistory(
     externalId: string,
     limit?: number
   ): Promise<Result<HistoryEvent[], Error>> {
     try {
       const parsed = parseExternalId(externalId);
       if (!parsed) return Err(new Error(`Invalid externalId: "${externalId}"`));
       const buildUrl = (page: number) =>
         `${this.http.apiBase}/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}/comments?per_page=100&page=${page}`;
       const { items } = await this.http.paginate<{ body: string; created_at: string }>(buildUrl);
       const events: HistoryEvent[] = [];
       for (const c of items) {
         if (!c.body.startsWith(GitHubIssuesTrackerAdapter.HISTORY_PREFIX)) continue;
         const json = c.body.slice(GitHubIssuesTrackerAdapter.HISTORY_PREFIX.length).trim();
         try {
           events.push(JSON.parse(json) as HistoryEvent);
         } catch (e) {
           // eslint-disable-next-line no-console
           console.warn(`harness-history: malformed JSON in ${externalId}: ${(e as Error).message}`);
         }
       }
       events.sort((a, b) => a.at.localeCompare(b.at));
       return Ok(limit ? events.slice(-limit) : events);
     } catch (err) {
       return Err(err instanceof Error ? err : new Error(String(err)));
     }
   }
   ```

4. Wire `claim`/`release`/`complete` to `appendHistory` as best-effort side effects (non-blocking; on failure, log warning and still return the primary result). Add a single helper `private async logEvent(externalId, type, actor): Promise<void>` and call it after the primary operation succeeds.
5. Run tests. **Expect PASS**.
6. Run `harness validate`, `harness check-deps`. Expect pass.
7. Commit: `feat(core/tracker): history via hidden HTML-comment + JSON [phase-2]`

### Task 13: Implement `factory.ts` — `createTrackerClient(config)` — tests + impl

**Depends on:** Task 12 | **Files:** `packages/core/tests/roadmap/tracker/factory.test.ts`, `packages/core/src/roadmap/tracker/factory.ts`

1. Create the test file. Cover:
   a) `createTrackerClient({ kind: 'github-issues', repo: 'owner/repo', token: 'x' })` returns `Ok(GitHubIssuesTrackerAdapter)`. b) Missing token → `Err`. c) Invalid `kind` → `Err`. d) Reads token from `process.env.GITHUB_TOKEN` when not in config (matches existing convention; verify with `vi.stubEnv`).
2. Run tests. **Expect FAILURE**.
3. Create `packages/core/src/roadmap/tracker/factory.ts`:

   ```ts
   import type { Result } from '@harness-engineering/types';
   import { Ok, Err } from '@harness-engineering/types';
   import type { RoadmapTrackerClient } from './client';
   import { GitHubIssuesTrackerAdapter } from './adapters/github-issues';
   import { ETagStore } from './etag-store';

   export interface TrackerClientConfig {
     kind: 'github-issues';
     repo: string;
     token?: string;
     apiBase?: string;
     selectorLabel?: string;
     etagStore?: ETagStore;
   }

   export function createTrackerClient(
     config: TrackerClientConfig
   ): Result<RoadmapTrackerClient, Error> {
     if (config.kind !== 'github-issues') {
       return Err(new Error(`Unsupported tracker kind: "${config.kind}"`));
     }
     const token = config.token ?? process.env.GITHUB_TOKEN;
     if (!token) {
       return Err(
         new Error('createTrackerClient: missing GitHub token (config.token or GITHUB_TOKEN env)')
       );
     }
     return Ok(
       new GitHubIssuesTrackerAdapter({
         token,
         repo: config.repo,
         apiBase: config.apiBase,
         selectorLabel: config.selectorLabel,
         etagStore: config.etagStore,
       })
     );
   }
   ```

4. Run tests. **Expect PASS**.
5. Run `harness validate`, `harness check-deps`. Expect pass.
6. Commit: `feat(core/tracker): factory createTrackerClient with kind dispatch [phase-2]`

### Task 14: Wire public surface through `tracker/index.ts` and `roadmap/index.ts`

**Depends on:** Task 13 | **Files:** `packages/core/src/roadmap/tracker/index.ts`, `packages/core/src/roadmap/index.ts`

1. Edit `packages/core/src/roadmap/tracker/index.ts` — append the Phase 2 exports without removing Phase 1:

   ```ts
   /**
    * Tracker abstraction — public entry point.
    *
    * Phase 1 surface (existing): IssueTrackerClient (small, 6 methods),
    *   Issue, BlockerRef, TrackerConfig.
    * Phase 2 surface (new): RoadmapTrackerClient (wide, 10 methods),
    *   TrackedFeature, NewFeatureInput, FeaturePatch, HistoryEvent,
    *   ConflictError, createTrackerClient, ETagStore.
    *
    * @see docs/changes/roadmap-tracker-only/proposal.md
    */
   export type { IssueTrackerClient, Issue, BlockerRef, TrackerConfig } from './types';
   export type {
     RoadmapTrackerClient,
     TrackedFeature,
     NewFeatureInput,
     FeaturePatch,
     HistoryEvent,
     HistoryEventType,
   } from './client';
   export { ConflictError } from './client';
   export { createTrackerClient } from './factory';
   export type { TrackerClientConfig } from './factory';
   export { ETagStore } from './etag-store';
   ```

2. Edit `packages/core/src/roadmap/index.ts` — extend the existing tracker re-export line:

   ```ts
   /**
    * Tracker abstraction — IssueTrackerClient and shared types.
    * See packages/core/src/roadmap/tracker/index.ts.
    */
   export type {
     IssueTrackerClient,
     Issue,
     BlockerRef,
     TrackerConfig,
     RoadmapTrackerClient,
     TrackedFeature,
     NewFeatureInput,
     FeaturePatch,
     HistoryEvent,
     HistoryEventType,
     TrackerClientConfig,
   } from './tracker';
   export { ConflictError, createTrackerClient, ETagStore } from './tracker';
   ```

3. Run `pnpm --filter @harness-engineering/core typecheck`. Expect exit 0.
4. Run `pnpm --filter @harness-engineering/core test packages/core/tests/roadmap/tracker/public-surface.test.ts`. **Expect PASS** (Task 2's red test now goes green).
5. Run `harness validate`, `harness check-deps`. Expect pass.
6. Commit: `feat(core/tracker): expose Phase 2 public surface via barrel [phase-2]`

### Task 15: Verify orchestrator + Phase 1 surface still green

**Depends on:** Task 14 | **Files:** none (verification only)

[checkpoint:human-verify]

1. Run `pnpm --filter @harness-engineering/orchestrator typecheck`. Expect exit 0.
2. Run `pnpm --filter @harness-engineering/orchestrator test`. Expect zero failures (Phase 1 surface untouched).
3. Run `pnpm --filter @harness-engineering/core test packages/core/tests/roadmap/tracker/index.test.ts`. **Expect PASS** — the Phase 1 smoke test still confirms the four lifted symbols.
4. Run `grep -rn "RoadmapTrackerClient" packages/orchestrator/src/`. Expect zero matches (Phase 4 wires this; not Phase 2).
5. No commit. This is a gate.

### Task 16: Full core test run + cross-package gate

**Depends on:** Task 15 | **Files:** none

[checkpoint:human-verify]

1. Run `pnpm --filter @harness-engineering/core test`. Expect zero failures including all existing tests (parse, serialize, sync, sync-engine, tracker-sync, github-issues, pilot-scoring) plus the new tracker tests.
2. Run `pnpm --filter @harness-engineering/types typecheck`. Expect exit 0.
3. Run `harness validate`. Expect pass.
4. Run `harness check-deps --json`. Expect `{valid: true, issues: []}`.
5. Run `pnpm run generate:barrels:check`. Expect "Command registry is up to date. Core barrel is up to date."
6. No commit. This is a gate.

### Task 17: Add scope-gated real-network smoke (skipped by default)

**Depends on:** Task 16 | **Files:** `packages/core/tests/roadmap/tracker/adapters/github-issues.e2e.test.ts`

[checkpoint:decision]

**Decision point** (per D-P2-F): the user prompt asks the plan to address "real GitHub repo vs. recorded fixtures" explicitly. This phase ships the **gate scaffold only**; the actual recorded fixtures are deferred to a Phase 5 follow-up unless the user requests otherwise at APPROVE_PLAN.

1. Create the file with a top-level guard:

   ```ts
   import { describe, it } from 'vitest';

   const E2E_ENABLED = process.env.HARNESS_E2E_GITHUB === '1';
   const repo = process.env.HARNESS_E2E_GITHUB_REPO; // "owner/test-repo"

   describe.skipIf(!E2E_ENABLED || !repo)(
     'GitHubIssuesTrackerAdapter — real-network E2E (gated)',
     () => {
       it('TODO(phase-5): create → claim → complete on a real test repo', () => {
         // Intentionally a placeholder. Phase 5 (or a follow-up) will
         // populate this suite. Documented in the migration guide so
         // teams can run a "smoke" before adopting file-less mode.
       });
     }
   );
   ```

2. Run `pnpm --filter @harness-engineering/core test packages/core/tests/roadmap/tracker/adapters/github-issues.e2e.test.ts`. Expect "0 ran, 1 skipped" (or similar).
3. Run `harness validate`. Expect pass.
4. Commit: `test(core/tracker): scaffold gated real-network E2E (skipped by default) [phase-2]`

### Task 18: Final validation gate + handoff

**Depends on:** Task 17 | **Files:** none

[checkpoint:human-verify]

1. Run `pnpm --filter @harness-engineering/core test`. Confirm: full suite green.
2. Run `pnpm --filter @harness-engineering/orchestrator test`. Confirm: full suite green.
3. Run `harness validate` and `harness check-deps`. Confirm both pass.
4. Run `pnpm run generate:barrels:check`. Confirm pass.
5. Run `git log --oneline | head -10`. Confirm Phase 2 commits all carry the `[phase-2]` tag for traceability.
6. Verify no docs under `docs/knowledge/`, `docs/decisions/`, or `docs/changes/roadmap-tracker-only/migration.md` were created (those are Phase 5/6).
7. Verify `docs/roadmap.md` is unchanged (the file-less roadmap proposal entry stays at `planned`).
8. No commit. This task is the gate; a follow-up integration step (harness-integration skill) verifies and writes the final handoff.

## Risks (carried into APPROVE_PLAN)

1. **GitHub PATCH does not honor `If-Match` (decision D-P2-B).** We are not delivering true OCC; we are delivering refetch-and-compare. This is a documented compromise. If the user wants stronger semantics the alternatives are: (i) GraphQL mutations on Projects v2 — significant rewrite; (ii) label-as-lock — adds noise to the issue surface, requires a fairness algorithm; (iii) accept last-write-wins. The plan's choice is the smallest deviation from the proposal that GitHub actually supports.
2. **Refetch-and-compare costs an extra GET per `update` with `ifMatch`.** For a 100-feature roadmap with ~10 writes/hour total, this is ~10 extra GETs/hour — well under the 5000 req/hr authenticated budget.
3. **History via comments scales linearly with state changes.** Estimate: 5 events per feature lifecycle × 1000 features × 1 lifecycle/year = 5000 events/year per project — a fraction of one hour's authenticated rate-limit budget. Documented in plan and SHOULD be revisited if a project posts >100 events/hour.
4. **Body metadata block tolerance edge cases** are covered in Task 3 (multiple blocks, malformed YAML, marker in summary). Documented behavior: first block wins, malformed → meta empty + warning, false markers in summary preserved verbatim.
5. **`blockedBy` resolution at read time depends on the same response containing the referenced features.** For features referenced by name but not in the harness-managed label set, the name silently drops out (with a debug log). This matches D-P2-H and is documented in the plan.
6. **No real-network integration tests in Phase 2.** F1 and F2 in the spec ("integration test against a real test repo") are deferred to Phase 5 or a follow-up; see D-P2-F.
7. **Naming collision parking lot.** Both `IssueTrackerClient` (small) and `RoadmapTrackerClient` (wide) coexist. Phase 4 (consumer wiring) is the natural consolidation point; if Phase 6 ADRs prefer to rename `IssueTrackerClient → RoadmapTrackerClient`, that becomes a small renaming pass after consumers branch on mode.

## Uncertainties (carried from SCOPE)

- [BLOCKING → resolved at APPROVE_PLAN] Confirm the user accepts refetch-and-compare in lieu of true `If-Match` OCC. Without explicit confirmation, the plan stands but the surfaced concern in handoff.concerns[0] flags this for the gate.
- [ASSUMPTION] The token convention is `process.env.GITHUB_TOKEN`. Matches three existing call sites in orchestrator/intelligence/completion. Documented in factory.ts.
- [ASSUMPTION] The label `harness-managed` selects file-less-managed issues and does not collide with any user label. Configurable via `selectorLabel` in adapter options.
- [DEFERRABLE] Singular `plan` in the body block vs. `plans: string[]` on `RoadmapFeature`. Captured in D-P2-G; multi-plan persistence is a Phase 4+ enhancement.
- [DEFERRABLE] Whether `fetchHistory` should accept a `since: string` filter for incremental polling. Not in the proposal; not added here.

## Integration Tier Rationale (medium)

- 7 created source files + 7 created test files + 3 modified files in `packages/core` only.
- New public API surface: 1 interface (`RoadmapTrackerClient`), 5 supporting types, 1 class export (`ConflictError`), 2 utility exports (`createTrackerClient`, `ETagStore`), 1 factory config type.
- One new runtime dependency (`yaml`) — tier-medium signal.
- Zero docs/config/schema/orchestrator/dashboard/cli changes (those are Phases 3–6).
- Tier verdict: **medium** (new feature within existing package, new exports, ~14 files, no new package).

Compared with the spec's Integration Tier table: matches medium signals exactly ("New feature within existing package, new exports, 3-15 files").

## Gates

- Tasks 2 (red test) and Task 14 (resolves it) lock the public surface.
- Task 15 confirms Phase 1 + orchestrator stay green.
- Task 16 is the cross-package gate.
- Task 17 makes the test-infrastructure decision visible (skipped by default; documented).
- Task 18 is the final verification before handoff.
