---
number: 0053
title: BRD-to-roadmap fan-out is one-to-many, not one-to-one
date: 2026-07-01
status: accepted
tier: medium
source: docs/changes/product-advisor/proposal.md
---

## Context

`product-advisor` (ADR 0052) produces a BRD at the inception of a client engagement and
must hand off to the existing harness pipeline. The obvious handoff is one-to-one: BRD →
a single `harness-brainstorming` session → one `proposal.md` spec.

That is wrong for the domain. A BRD describes an entire **solution scope** for a client
engagement — often several independent capabilities (integration, auth, a rules engine,
reporting). Collapsing that into one brainstorming session would force one oversized spec
and defeat the per-capability design exploration that `harness-brainstorming` exists to
provide. Each capability deserves its own brainstorming → spec → plan → execute cycle.

The question is what `finalize` emits and how the many-item nature is represented.

## Decision

The BRD-to-pipeline handoff is **one-to-many, seeded through the roadmap** — not a direct
one-to-one handoff to brainstorming.

At `finalize`, `product-advisor`:

1. Decomposes the BRD scope into **N candidate work items**, each carrying
   `{ title, summary, brdRefs[], rationale }` — a backreference to the BRD section(s)
   that spawned it.
2. Writes each accepted item via `manage_roadmap` action `add`, `status: backlog`,
   `milestone: "Inception: <engagement>"`.
3. Emits a handoff noting that **each roadmap item independently enters the existing
   `roadmap-pilot → brainstorming → spec → plan → execute` flow**.

The roadmap is the fan-out point. `product-advisor` does not itself run brainstorming or
author specs; it seeds the queue the existing pipeline already drains. A single-item
collapse is treated as a gate violation in the skill.

## Consequences

**Positive:**

- Realizes the originating intent — "feed those in … and have everything continue as it
  does today" — literally: inception seeds the roadmap, and the unchanged pipeline takes
  over per item.
- Each capability keeps its own design-exploration step, so gaps are weighed against
  approaches at the right granularity instead of being pre-committed in one large spec.
- The `brdRefs` backreference makes every roadmap item traceable to the requirement that
  justified it, and back to the client conversation that surfaced it.
- Reuses `manage_roadmap` wholesale; no new queue or handoff mechanism is introduced.

**Negative:**

- Decomposition quality is now load-bearing: a bad fan-out produces junk backlog rows.
  Mitigated by presenting candidates to the SA for confirm/prune before writing them.
- The engagement's roadmap items land in `backlog` and still require the human to promote
  them through the normal flow — inception does not auto-advance work.
- If `manage_roadmap` is unavailable, the fan-out degrades to a "Proposed roadmap items"
  section in `gaps.md`, which must be re-run to seed the roadmap properly.
