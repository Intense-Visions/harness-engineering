# Bidirectional Analysis Sync via Tracker Comments

Centralize intelligence pipeline analysis results by using the external issue tracker as a bidirectional distribution channel. When an analysis completes, it auto-publishes as a structured comment on the corresponding tracker ticket. Team members can then pull those analyses locally via `sync-analyses`, eliminating the need for every engineer to run the pipeline independently.

## Goals

1. Any engineer with tracker access can see analysis results (risk, complexity, predictions) directly on the relevant issue
2. Any engineer can hydrate their local `.harness/analyses/` from published tracker comments without running the pipeline
3. The publish/pull format is tracker-agnostic — GitHub Issues first, but the design must not preclude Linear, Jira, etc.
4. Auto-publish is the default behavior when a tracker is configured; manual `publish-analyses` CLI remains available

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Summary header + collapsible `<details>` with full `AnalysisRecord` JSON | Engineers need complete data to avoid re-running analysis locally. Summary for triage scanning, JSON for machine consumption and pull-back. |
| 2 | Dual-mode distribution (publish + pull) | Tracker-only excludes local-only workflows. Bidirectional sync makes the tracker the shared source of truth without git bloat. |
| 3 | Auto-publish by default when tracker is configured | Extra config flags add friction. If you've configured a tracker, sharing intent is implicit. |
| 4 | `"_harness_analysis": true` discriminator in JSON fence | Marker and payload are the same artifact. Tracker-agnostic — any system that stores markdown comments works. No separate tag to drift. |
| 5 | Store `externalId` on `AnalysisRecord` at analysis time | Eliminates fragile prefix-matching. Direct lookup at publish time. Features without `externalId` are naturally excluded. |
| 6 | Full dual-mode in one pass | Ship the complete feature — publish + pull + auto-publish — together to enable round-trip integration testing. |

## Technical Design

### Type Changes

`AnalysisRecord` — add field:

```typescript
externalId: string | null;  // e.g. "github:owner/repo#42", populated at analysis time
```

`TrackerSyncAdapter` interface — add method:

```typescript
/** Fetch all comments on an external ticket */
fetchComments(externalId: string): Promise<Result<TrackerComment[], Error>>;
```

New type:

```typescript
interface TrackerComment {
  id: string;        // tracker-native comment ID
  body: string;      // raw markdown body
  createdAt: string; // ISO timestamp
  author: string;    // who posted it
}
```

### Comment Format

Published comments follow this structure:

````markdown
## Harness Analysis: {identifier}

**Risk:** {riskLevel} ({confidence}% confidence)
**Route:** {recommendedRoute}
**Analyzed:** {analyzedAt}

{reasoning bullets}

<details>
<summary>Full Analysis Data</summary>

```json
{
  "_harness_analysis": true,
  "_version": 1,
  ...full AnalysisRecord fields
}
```

</details>
````

The `_version` field enables forward-compatible parsing if the schema evolves.

### Adapter Implementation — GitHub

- `addComment()` — already implemented (`POST /repos/{owner}/{repo}/issues/{number}/comments`)
- `fetchComments()` — new: `GET /repos/{owner}/{repo}/issues/{number}/comments`, paginated, uses existing `fetchWithRetry` and auth headers. Returns `TrackerComment[]` mapped from GitHub's response.

Future adapters (Linear, Jira, etc.) implement the same `fetchComments` and `addComment` interface — the comment format and discriminator key are tracker-agnostic.

### Publish Flow (orchestrator + CLI)

```
Analysis completes -> AnalysisRecord saved with externalId
  -> if tracker configured: renderAnalysisComment(record) -> adapter.addComment()
  -> update published-analyses.json index
```

Auto-publish fires in the orchestrator after analysis. `publish-analyses` CLI remains for manual/re-publish use — reads `.harness/analyses/`, filters by `externalId` presence and published index, publishes unpublished records.

### Pull Flow (`sync-analyses` CLI)

```
For each roadmap feature with externalId:
  -> adapter.fetchComments(externalId)
  -> scan comment bodies for ```json fence containing "_harness_analysis": true
  -> parse AnalysisRecord from JSON
  -> take the most recent if multiple exist
  -> write to .harness/analyses/{issueId}.json
```

Skip features without `externalId`. Skip issues with no analysis comments. Warn on JSON parse failures but continue.

### File Layout

| File | Action |
|------|--------|
| `packages/types/src/tracker-sync.ts` | Add `fetchComments`, `TrackerComment` |
| `packages/orchestrator/src/core/analysis-archive.ts` | Add `externalId` to `AnalysisRecord` |
| `packages/core/src/roadmap/adapters/github-issues.ts` | Implement `fetchComments` |
| `packages/cli/src/commands/publish-analyses.ts` | Rework: use `record.externalId`, new comment format with discriminator |
| `packages/cli/src/commands/sync-analyses.ts` | New: pull command |
| `packages/cli/src/commands/_registry.ts` | Register `sync-analyses` |
| Orchestrator pipeline (where analysis completes) | Wire auto-publish hook |

## Success Criteria

1. After an orchestrator analysis run with a configured tracker, a structured comment appears on the corresponding GitHub issue containing a human-readable summary and a collapsible `<details>` block with the full `AnalysisRecord` JSON
2. The JSON fence contains `"_harness_analysis": true` and `"_version": 1` — parseable by `sync-analyses`
3. Running `harness sync-analyses` on a clean machine (no local analyses) hydrates `.harness/analyses/` from tracker comments, producing `AnalysisRecord` files identical in schema to locally-generated ones
4. Duplicate publishes are prevented — re-running publish on the same analysis does not create a second comment
5. `publish-analyses` uses `record.externalId` directly with no prefix matching — features without `externalId` are skipped with a warning
6. `fetchComments` is defined on `TrackerSyncAdapter` (not GitHub-specific) — any future adapter can implement it
7. `sync-analyses` gracefully handles: issues with no analysis comments, malformed JSON, multiple analysis comments on the same issue (takes most recent)
8. Existing tracker sync functionality (create/update/fetch tickets, assign, existing addComment) is not broken

## Implementation Order

### Wave 1 — Type foundations
- Add `externalId: string | null` to `AnalysisRecord`
- Add `fetchComments()` and `TrackerComment` to `TrackerSyncAdapter` interface

### Wave 2 — Adapter + rendering (parallelizable)
- Implement `fetchComments` on `GitHubIssuesSyncAdapter`
- Rework `renderAnalysisComment()` — summary header + `<details>` with discriminator JSON
- Update analysis pipeline to populate `externalId` on records at analysis time

### Wave 3 — CLI commands (parallelizable)
- Rework `publish-analyses` — use `externalId` directly, new comment format
- New `sync-analyses` — fetch comments, parse JSON fence, hydrate local archive
- Register `sync-analyses` in command registry

### Wave 4 — Orchestrator integration
- Wire auto-publish after analysis completion when tracker is configured

### Wave 5 — Tests
- `fetchComments` unit tests (mock fetch, pagination, error handling)
- `renderAnalysisComment` format tests (discriminator present, valid JSON in fence)
- `sync-analyses` parsing tests (happy path, no analysis comment, malformed JSON, multiple comments)
- Round-trip integration test: publish -> fetchComments -> parse -> compare to original record
