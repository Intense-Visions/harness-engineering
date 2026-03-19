# State Streams: Multi-Session Isolation for Independent Work Items

**Date:** 2026-03-19
**Status:** Approved
**Keywords:** state-management, streams, multi-session, isolation, handoff, branch-inference, migration, stream-resolver

## Overview

Introduce a stream-based routing layer to the harness state management system so that multiple independent work items can maintain separate state, handoff, learnings, and failures without clobbering each other.

### Goals

- Each independent work stream gets its own isolated state directory
- Stream resolution infers from git branch by default, accepts explicit override, and prompts when ambiguous
- Existing state management functions remain largely unchanged — routing is the new concept
- Migration from single-file state to stream-based layout is automatic and non-destructive

### Non-Goals

- Task dependency graphs or orchestration between streams
- Merging state across streams
- Real-time conflict detection for truly concurrent writes (parallel agents writing to the same stream)

## Decisions

| Decision                                        | Choice                                                                                                 | Rationale                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Multiple state files vs. namespaced single file | Multiple files in separate directories                                                                 | Full isolation — no risk of cross-stream contamination, simpler file I/O                                      |
| Directory layout                                | `.harness/streams/<name>/` with `state.json`, `handoff.json`, `learnings.md`, `failures.md` per stream | Self-contained, easy to archive or delete a stream                                                            |
| Stream resolution order                         | Explicit name → git branch → active stream → prompt                                                    | Predictable precedence; branch inference covers the common case; prompt is the safety net                     |
| Migration strategy                              | One-time migration of existing `.harness/` files into `.harness/streams/default/`                      | No backward compat shim needed; clean cutover                                                                 |
| Learnings/failures scoping                      | Per-stream (not global)                                                                                | Keeps each work stream's institutional knowledge isolated; a cross-stream query can aggregate if needed later |
| Stream index                                    | `.harness/streams/index.json` tracking known streams, branch associations, last-active timestamps      | Enables `listStreams()`, active stream tracking, and "ask when unsure" logic                                  |

## Technical Design

### New Module: `packages/core/src/state/stream-resolver.ts`

```typescript
// Core types
interface StreamInfo {
  name: string;
  branch?: string;
  createdAt: string;
  lastActiveAt: string;
}

interface StreamIndex {
  schemaVersion: 1;
  activeStream: string | null;
  streams: Record<string, StreamInfo>;
}

// Public API
resolveStreamPath(projectPath: string, options?: { stream?: string }): Result<string>
listStreams(projectPath: string): Result<StreamInfo[]>
createStream(projectPath: string, name: string, branch?: string): Result<string>
setActiveStream(projectPath: string, name: string): Result<void>
archiveStream(projectPath: string, name: string): Result<void>
getStreamForBranch(projectPath: string, branch: string): Result<string | null>
```

### Resolution Algorithm (`resolveStreamPath`)

1. If `options.stream` provided → use it directly
2. Else detect current git branch:
   - If branch maps to a known stream in `index.json` → use that stream
   - If branch is `main`/`master` → use active stream from index (or `default`)
3. If no match → return an error indicating the caller should prompt the user
4. Update `lastActiveAt` in index on every resolution

### Directory Layout

```
.harness/
  streams/
    index.json
    default/
      state.json
      handoff.json
      learnings.md
      failures.md
    auth-rework/
      state.json
      handoff.json
      learnings.md
      failures.md
```

### Changes to Existing State Manager (`state-manager.ts`)

- No signature changes to `loadState`, `saveState`, `appendLearning`, etc.
- These functions already take a `projectPath` — callers pass the resolved stream path instead of the bare `.harness/` path
- Add a convenience wrapper: `withStream(projectPath, options?) → streamPath` that callers use before invoking state functions

### Changes to MCP Tools (`packages/mcp-server/src/tools/state.ts`)

- `manage_state` gains optional `stream` input parameter
- `manage_handoff` gains optional `stream` input parameter
- Both resolve the stream path before delegating to core functions
- New tool: `list_streams` — returns known streams with metadata

### Changes to CLI (`packages/cli/`)

- All `harness state` subcommands gain `--stream` flag
- New subcommands: `harness state streams` (list), `harness state stream create <name>`, `harness state stream archive <name>`
- `harness state show` displays which stream is active

### Changes to Skills

- `harness-state-management` SKILL.md Phase 1 (LOAD) updated to resolve stream first
- Skills that call `manage_state` or `manage_handoff` pass `stream` when they know it
- Brainstorming/planning/execution skills don't need changes — they call state tools which handle resolution internally

### Migration Function

- `migrateToStreams(projectPath): Result<void>`
- Checks if `.harness/streams/` exists — if yes, no-op
- Moves `state.json`, `handoff.json`, `learnings.md`, `failures.md` into `.harness/streams/default/`
- Creates `index.json` with a single `default` stream
- Called automatically on first `resolveStreamPath` if old layout detected

## Success Criteria

1. Writing state/handoff in stream A does not affect stream B's files
2. Checking out `feature/auth-rework` and calling `resolveStreamPath` returns the `auth-rework` stream path without explicit flags
3. `--stream bugfix-nav` resolves to that stream regardless of current branch
4. When on `main` with no active stream and no explicit flag, the resolver returns an error so the caller can prompt
5. Running migration when already migrated is a no-op; running on old-layout files moves them correctly
6. All current state manager tests continue to pass
7. `manage_state` and `manage_handoff` MCP tools work with and without the `stream` param
8. CLI `list`, `create`, `archive` subcommands operate correctly on the index
9. `loadRelevantLearnings` can optionally aggregate across all streams
10. `lastActiveAt` updates on resolution; archived streams are marked, not deleted from index

## Implementation Order

1. Core types and stream resolver — `StreamIndex` type, `resolveStreamPath`, index read/write
2. Migration function — `migrateToStreams` with auto-detection of old layout
3. Stream lifecycle — `createStream`, `listStreams`, `archiveStream`, `setActiveStream`
4. Wire up state manager — callers pass resolved stream paths; add `withStream` convenience wrapper
5. MCP tool changes — add `stream` param to `manage_state` and `manage_handoff`; add `list_streams` tool
6. CLI changes — `--stream` flag on existing commands; new `harness state streams` subcommands
7. Skill updates — update `harness-state-management` SKILL.md to document stream resolution in Phase 1
8. Tests — unit tests for resolver, migration, lifecycle; integration tests for MCP tools with streams
