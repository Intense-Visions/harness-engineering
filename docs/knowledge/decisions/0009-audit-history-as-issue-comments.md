---
number: 0009
title: Roadmap audit history stored as GitHub issue comments
date: 2026-05-09
status: accepted
tier: medium
source: docs/changes/roadmap-tracker-only/proposal.md
---

## Context

The pre-Phase-2 sketch of file-less roadmap mode stored audit history (assignment events, status transitions, release events) in a local file `docs/roadmap.audit.jsonl`. That design re-created the per-clone divergence that file-less mode is meant to eliminate: each developer's `harness:roadmap-pilot` affinity score would read a different history depending on which clone the audit log lived in, the file would either be gitignored (creating noise) or checked in (creating merge conflicts), and there would be no surface in the GitHub UI for the audit trail.

Three alternatives were considered:

1. **Local file (`docs/roadmap.audit.jsonl`)** — rejected. Re-creates per-clone divergence; defeats the file-less goal.
2. **`.harness/audit.jsonl` checked-in** — rejected. Bloats git history with every claim/release event; creates a merge-conflict surface that mirrors the original `docs/roadmap.md` problem.
3. **GitHub issue comments** — chosen. Comments are centralized (every clone sees the same comments), append-only by convention (harness never edits or deletes them), and visible in the GitHub UI as a native audit trail.

## Decision

Each history event is posted as a GitHub issue comment with a content-addressed HTML-comment marker on the first line and a JSON envelope on the second line:

```
<!-- harness-history hash:<short8> -->
{"type":"assigned","actor":"alice","at":"2026-05-09T12:00:00Z","details":{...}}
```

The hash is `sha256(type + actor + at + JSON.stringify(details ?? {}))` truncated to 8 hex chars (`packages/core/src/roadmap/migrate/history-hash.ts`). The marker prefix lets `fetchHistory(externalId, limit?)` filter the issue's comment list and parse only the harness-managed envelopes — comments authored by humans in the GitHub UI are ignored. `appendHistory(externalId, event)` computes the hash for the incoming event and skips the write if the hash already exists on the issue (idempotency).

The cost is one extra GitHub API call per history event, bounded by the human action rate (claims, releases, completions). The polling cost (`fetchHistory`) is bounded by the page size and is short-circuited by the same ETag-conditional read pattern that protects the issue-list endpoint.

See Phase 2 `GitHubIssuesTrackerAdapter.appendHistory` and Phase 5 `packages/core/src/roadmap/migrate/history-hash.ts` for the implementation.

## Consequences

**Positive:**

- Append-only, conflict-free, visible to all clones and the GitHub UI. Survives clone deletion or fresh checkouts — every clone reads the same history from the tracker.
- The hash check on `appendHistory` makes migration re-runs (`harness roadmap migrate --to=file-less` re-execution) idempotent without bookkeeping state outside the tracker.
- Audit events round-trip through standard GitHub permissions: privileged users can edit or delete comments, and harness simply ignores any comment whose body fails the hash check on re-parse.

**Negative:**

- History is not queryable without listing the issue's full comment thread. Cross-feature queries like "all `assigned` events for actor `alice` since date X" require listing comments per issue and aggregating in-process. A future enhancement could maintain a comment-aggregating cache, but this round avoids the new infrastructure.
- The 8-character hash truncation could in theory collide for two different events. Practically, the hash space is 2^32 and events for a given issue are bounded by the human action rate; collisions have not been observed.

**Neutral:**

- History events are not editable post-hoc by harness. A privileged user can edit a comment in the GitHub UI; harness will ignore the edited version (hash mismatch) and treat the event as absent. This is acceptable for an audit trail (tampering is detected by absence, not by silent overwrite).

**F2 honesty footnote:** A consequence of the comment-based model is that there is no transactional read-modify-write on issue state. When two clients race a `claim()` call, concurrent claim races are detected best-effort via refetch-and-compare (NOT atomically prevented). GitHub REST does not honor `If-Match` on issue PATCH. The detection is best-effort: the losing call returns `ConflictError` when detection succeeds, but interleavings where the read-and-write windows are microscopic may produce two apparent successes. See proposal §"Success Criteria" F2 wording (Task 1) and Phase 2 decision D-P2-B.

## Related

- ADR 0008 — IssueTrackerClient abstraction lives in `@harness-engineering/core`
- ADR 0010 — `tracker.kind` schema decoupling between workflow and roadmap sync
- Phase 5 migration knowledge entry: `docs/knowledge/roadmap/roadmap-migration-to-file-less.md`
- Implementation: `packages/core/src/roadmap/migrate/history-hash.ts`
