# Emit a machine-readable provenance trailer from agent-authored commits

**Status:** Draft · **Tier:** Small · **Type:** feature (core primitive + orchestrator wiring)
**Issue:** github:Intense-Visions/harness-engineering#1531 · **Milestone:** v5.0 — Trust & Security Model · **Priority:** P1
**Keywords:** provenance, commit-trailer, fleet, orchestrator, ship, telemetry, tier-detection, git, parser, accountability

## Overview

Harness-authored work is statistically invisible. Measured across two orgs, a dogfood product repo carries 974 AI co-author trailers in 4,618 commits (21%) while its highest-volume author shows 5 trailers across 3,988 commits — because the autonomous fleet/orchestrator commit path emits nothing machine-readable that distinguishes it from an ordinary commit. The consequences compound: org-wide AI-adoption reporting undercounts by roughly 5x and cannot separate the autonomous tier from interactive assistance; cost attribution has no key to join spend to authorship; and in a regulated codebase there is no record of which agent, skill and version produced a change touching a gated path.

Today the only provenance carried by a commit is a freeform `Claude-Session:` URL line appended by the interactive Claude Code client — an ad-hoc convention that is not emitted by the autonomous ship path and is not a governed, parseable schema. This change introduces a **distinct, structured, machine-readable git commit trailer** carrying provenance for agent-authored commits, emits it on the commit path the orchestrator's autonomous ship uses, and ships a **deterministic parser** so telemetry and tier-detection can read it mechanically. It deliberately does **not** co-opt `Co-authored-by:` — a distinct namespace (`Harness-*`) keeps tier detection mechanical and lets the trailer double as the accountability record.

### Goals

1. Define a governed, deterministically-parseable commit-trailer schema (key:value lines) carrying the run's provenance: skill@version, run id, model, session id, lane, agent id, and a schema version.
2. Emit the trailer on the autonomous fleet/orchestrator commit path (`WorkspaceManager.shipWorkspace`) so every fleet-authored commit carries it — without co-opting `Co-authored-by:`.
3. Ship a pure parser utility that extracts the trailer from any commit message and returns a structured record (or `null` for a non-fleet commit), so telemetry / tier-detection reads it mechanically.
4. Survive the repo's squash-merge path: the same trailer block is also appended to the PR body, so the provenance record survives even when the branch commit's message is discarded by a squash.
5. Leave interactive (non-fleet) commits byte-unaffected.

### Non-goals (YAGNI — deferred remainder, tracked on #1531)

- A CI check that verifies trailer presence/shape on every agent commit (`Suggested surfaces: git plumbing` — a follow-up gate).
- A `harness provenance <sha>` CLI reader command (downstream ergonomics, a follow-up).
- The downstream consumers themselves (cost-per-merged-PR attribution, autonomy-ratio, contagion tracing) — this change is the _foundation_ those consume; they are separate roadmap items.
- Retrofitting historical commits.

## Decisions made

1. **Distinct `Harness-*` trailer namespace, not `Co-authored-by:`.** The issue is explicit: co-opting `Co-authored-by:` would conflate the autonomous tier with interactive AI assistance (which already emits co-author trailers) and make mechanical tier detection impossible. The primary key is `Harness-Run: <skill>@<version>`; the record is completed by `Harness-Lane`, `Harness-Agent`, `Harness-Run-Id`, `Harness-Model`, `Harness-Session`, and a `Harness-Provenance-Version` schema-version key. All keys share the `Harness-` prefix so a parser keys off the namespace, and the presence of `Harness-Run` is the mechanical tier signal.

2. **Git-trailer syntax (`Key: value`, one per line, in a trailing block).** The trailer conforms to the same `Key: value` convention `git interpret-trailers` and `Co-authored-by:`/`Signed-off-by:` already use, so it is `git log --grep`-friendly and survives standard git tooling. Values are single-line and any embedded newline/CR is stripped at format time so a value can never break the block structure or forge extra keys.

3. **A pure core primitive, IO-free, in `packages/core/src/provenance`.** The schema, formatter, appender and parser are pure functions with no git/IO dependency — the same shape as the existing rule-provenance reporter that already lives there. This keeps them trivially testable and reusable by both the orchestrator (emit) and any future telemetry/CLI consumer (parse). The existing ADR-0100 rule-to-failure reporter is a different provenance concept; the new commit-trailer file lives alongside it under the same module with a clearly distinct name.

4. **Emit at the single autonomous commit chokepoint (`shipWorkspace`).** The orchestrator's `WorkspaceManager.shipWorkspace` is the one place the autonomous pipeline turns accumulated worktree work into a commit (`git commit -m <title>`). The trailer is appended to that commit message there, sourced from an optional `provenance` field on the ship options which the orchestrator populates from live run context (skill/lane, backend model, run id, issue). When no provenance context is threaded (any other caller, or an adopter running the manager directly), the commit message is byte-identical to today — interactive and third-party commits are unaffected.

5. **Append idempotently; also mirror into the PR body for squash survival.** `appendProvenanceTrailer` is a no-op when a `Harness-Run` trailer is already present (a resumed ship re-committing does not double-stamp). Because the repo squash-merges PRs (which discards individual branch-commit messages), the same rendered trailer block is appended to the PR body under a stable marker, so the provenance record survives the squash even if the commit trailer does not reach `main`. This directly satisfies the "survives the squash-merge path, or the PR body carries the equivalent record" acceptance criterion.

## Technical design

### New primitive — `packages/core/src/provenance/commit-trailer.ts`

```ts
export const PROVENANCE_TRAILER_VERSION = 1;

export interface ProvenanceTrailer {
  schemaVersion: number; // Harness-Provenance-Version
  skill: string; // left of @ in Harness-Run
  skillVersion: string; // right of @ in Harness-Run
  runId?: string; // Harness-Run-Id
  model?: string; // Harness-Model
  sessionId?: string; // Harness-Session
  lane?: string; // Harness-Lane
  agent?: string; // Harness-Agent
}

// Deterministic, ordered `Key: value` block. Optional fields omitted when absent.
export function formatProvenanceTrailer(input): string;

// Append the block to a commit/PR message. No-op if a Harness-Run trailer is already present.
export function appendProvenanceTrailer(message: string, input): string;

// Parse the trailing trailer block. Returns null when no Harness-Run key is present
// (an interactive / non-fleet commit).
export function parseProvenanceTrailer(message: string): ProvenanceTrailer | null;
```

Ordering is fixed (`Harness-Run`, `Harness-Provenance-Version`, `Harness-Run-Id`, `Harness-Lane`, `Harness-Agent`, `Harness-Model`, `Harness-Session`) so output is deterministic. `formatProvenanceTrailer` and `parseProvenanceTrailer` round-trip. Values are sanitized (CR/LF stripped) at format time.

### Wiring — `WorkspaceManager.shipWorkspace`

`shipWorkspace(identifier, opts)` gains an optional `opts.provenance: ProvenanceTrailerInput`. When present:

- the commit message becomes `appendProvenanceTrailer(opts.title, opts.provenance)`;
- the PR body becomes `appendProvenanceTrailer(opts.body, opts.provenance)` (survives squash).

The orchestrator's local-ship call site (`settleWorkflowSuccessLocal`) builds the input from live context: `skill`/`lane` from the running workflow, `model` from the last backend definition, `runId` from the flight recorder, `agent`/`session` where available. Absent context degrades field-by-field (the field is simply omitted) — never a crash.

## Acceptance criteria (from #1531)

- [x] Every fleet-authored commit in a fixture run carries a parseable trailer — covered by the `shipWorkspace` wiring test (commit message threaded through `formatProvenanceTrailer`) plus a format→parse round-trip test.
- [x] Interactive (non-fleet) commits are unaffected — covered by (a) `shipWorkspace` with no `provenance` opt producing a byte-identical message, and (b) `parseProvenanceTrailer` returning `null` on a message with no `Harness-Run` key.
- [x] Trailer survives the squash-merge path the repo uses, or the PR body carries the equivalent record — the PR body carries the rendered trailer block.

## Slice boundary

This lands the trailer schema + formatter + parser + orchestrator emission (commit and PR body) + docs + tests — a coherent, mergeable foundation that satisfies all three acceptance criteria mechanically. The **CI presence/shape gate** and the **`harness provenance <sha>` reader CLI** named in the issue's "Suggested surfaces" / "Adopter usage" narrative are deferred as follow-up remainder. Closing keyword: **`Refs #1531`** (a slice), remainder flagged in the PR body.
