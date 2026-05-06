---
number: 0007
title: .harness/learnings.md deprecation scope
date: 2026-05-05
status: accepted
tier: medium
source: docs/changes/compound-engineering-adoption/feedback-loops/proposal.md
---

## Context

`.harness/learnings.md` was the unstructured sink for compounding knowledge before this
spec. With `docs/solutions/` taking over for durable, structured post-mortems, it could
be tempting to delete `.harness/learnings.md` outright -- but live consumers still depend
on the path: the runtime read code in `packages/core/src/state/learnings*.ts`, the MCP
`learnings` resource exposed to agents, and skills that record ephemeral session notes
during work in flight.

## Decision

The deprecation is scoped **only to the orchestrator's compounding-knowledge-sink
semantic** -- the role of "this is where durable, future-reusable lessons go." Concretely:

- `harness.orchestrator.md` and `templates/orchestrator/harness.orchestrator.md` replace
  the directive "document learnings in `.harness/learnings.md`" with the compound
  directive (Phase 7).
- `packages/core/src/state/learnings*.ts` runtime read paths are **preserved unchanged**
  (mtime cache loader, lifecycle, content dedup all stay).
- The MCP `learnings` resource is **preserved unchanged**.
- Ephemeral session use of `.harness/learnings.md` for in-flight notes that are not
  durable knowledge is **preserved unchanged**.

The deprecation is semantic, not structural: the file and code paths still exist; only
the orchestrator's instruction to use it as the durable sink moves to `docs/solutions/`.

## Consequences

**Positive:**

- No breakage for live consumers (runtime, MCP, in-flight session use).
- Authors get a clear durable path (`docs/solutions/`) without losing the lightweight
  ephemeral path.

**Negative:**

- Two paths now coexist: `.harness/learnings.md` for ephemeral session notes,
  `docs/solutions/` for durable post-mortems. Authors must understand the split.
- Some confusion is unavoidable until the conventions doc and skill docs catch up.

**Neutral:**

- The conventions doc (`docs/conventions/compound-vs-knowledge-pipeline.md`) explains
  the operational split.
- A future ADR could harden this further (e.g., move ephemeral session notes to a
  different file name) once the durable surface stabilizes.
