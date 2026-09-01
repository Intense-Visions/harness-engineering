# Provenance commit trailer

A governed, machine-readable git commit **trailer** that carries the provenance
of an autonomous, agent-authored commit. It makes AI-authored work — specifically
the _autonomous_ tier — mechanically countable, joinable to cost, and auditable
on gated paths. Implemented as a pure primitive in
[`provenance/commit-trailer.ts`](../../packages/core/src/provenance/commit-trailer.ts)
and emitted by the orchestrator's autonomous ship path
([`WorkspaceManager.shipWorkspace`](../../packages/orchestrator/src/workspace/manager.ts)).

## Why a distinct trailer

The only provenance an interactive commit carries today is a freeform
`Claude-Session:` URL line, which the autonomous ship path does not emit and
which is not a parseable schema. The trailer deliberately does **not** co-opt
`Co-authored-by:` — that would conflate the autonomous tier with interactive AI
assistance (which already emits co-author trailers) and defeat mechanical tier
detection. A distinct `Harness-*` namespace keeps tier detection mechanical and
lets the trailer double as the accountability record.

## Schema

Standard git-trailer syntax (`Key: value`, one per line, in a trailing block).
The presence of a `Harness-Run` key is the mechanical **autonomous-tier signal**.

| Key                          | Required | Meaning                                                                        |
| ---------------------------- | -------- | ------------------------------------------------------------------------------ |
| `Harness-Run`                | yes      | `<skill>@<version>` — the primary key; its presence marks an autonomous commit |
| `Harness-Provenance-Version` | yes      | Schema version (currently `1`); bump on any incompatible change                |
| `Harness-Run-Id`             | no       | The orchestrator/fleet run this commit belongs to                              |
| `Harness-Lane`               | no       | The fleet lane / work unit                                                     |
| `Harness-Agent`              | no       | The agent / backend identity that executed the change                          |
| `Harness-Model`              | no       | The model that authored the change                                             |
| `Harness-Session`            | no       | The agent session id, when known                                               |

Keys are emitted in the order above; optional keys are omitted when their value
is absent. Values are single-line — any embedded newline is stripped at format
time so a value can never break the block structure or forge an extra key.

### Example

```
feat(core): add machine-readable provenance trailer

Harness-Run: orchestrator@0.25.0
Harness-Provenance-Version: 1
Harness-Run-Id: run-abc123
Harness-Lane: ISS-1531
Harness-Agent: anthropic
Harness-Model: claude-opus-4-8
```

## Parsing

`parseProvenanceTrailer(message)` scans every `Key: value` line, returns a
structured `ProvenanceTrailer`, and returns `null` when no `Harness-Run` key is
present — i.e. an interactive / non-fleet commit is left entirely unclaimed.
Other trailers (`Claude-Session:`, `Co-authored-by:`) coexisting in the same
message are ignored. `formatProvenanceTrailer` and `parseProvenanceTrailer`
round-trip.

## Squash-merge survival

Because this repo squash-merges PRs (which discards individual branch-commit
messages), `shipWorkspace` also appends the same rendered trailer block to the
**PR body**. So the provenance record survives the squash even when the commit
trailer does not reach the default branch.

## Emission scope

The trailer is emitted only when run context is threaded into
`shipWorkspace(identifier, { …, provenance })`. Any caller that does not thread
it — an interactive commit, or an adopter driving the workspace manager
directly — produces a byte-identical commit and PR body to before.

## Deferred (follow-up on #1531)

- A CI check that verifies trailer presence/shape on every agent commit.
- A `harness provenance <sha>` reader CLI.
- Downstream consumers (cost-per-merged-PR attribution, autonomy-ratio,
  contagion tracing) that read this trailer.
