---
'@harness-engineering/core': minor
---

Add a `linear` roadmap tracker kind — a `LinearTrackerAdapter` implementing the full `RoadmapTrackerClient` interface over Linear's GraphQL API, wired into `createTrackerClient({ kind: 'linear', teamId, token })` (falls back to `LINEAR_API_KEY`). This builds on the standalone Linear GraphQL client added earlier; the adapter ships its own transport because `core` cannot depend on `orchestrator`.

Mapping: `externalId` is `linear:<issue-uuid>`; `status` maps via Linear's fixed workflow-state **type** enum (`backlog|unstarted|started|completed`) rather than team-defined state names; `spec`/`plans`/`blockedBy`/`priority`/`milestone`/`summary` round-trip through the shared `<!-- harness-meta -->` body block (same encoding as the GitHub adapter); priority maps P0–P3 ↔ Linear 1–4; history events are stored as marked issue comments. Writes resolve the team's workflow states and assignee user ids on demand, and `update` supports optimistic-concurrency via `ifMatch` (→ `ConflictError`).

⚠️ **Best-effort, not yet validated against a live Linear workspace.** Query/mutation shapes follow Linear's documented schema and the mapping is unit-tested with a mocked transport, but field-level behavior (custom workflow states, priority semantics, user resolution) should be verified against a real workspace before production use. `blocked`/`needs-human` statuses have no native Linear state type and are treated as `started` on write.
