---
type: business_concept
domain: cli
tags: [skills, provenance, hermes-phase-4, audit]
---

# Skill Provenance

Every skill in the catalog records the **channel** that produced it. The
provenance field appears in `skill.yaml` and is queried by the dashboard,
review queue, and adoption telemetry to surface "who authored this" at
audit time without re-deriving the answer from git history.

## Values (closed enum)

- `user-authored` — Written by a human contributor. The default for
  every pre-Phase-4 skill via the one-shot backfill.
- `agent-proposed` — Originated from a `emit_skill_proposal` MCP call
  and survived the soundness-review gate plus reviewer approval.
- `community` — Sourced from an external skill repository or third-party
  contribution outside the harness primary maintainers. Currently
  reserved; promotion mechanics for community skills are a follow-up.

Expansion of the enum (e.g. adding `ai-assisted`) requires an ADR
amendment per ADR 0016. The closed set is deliberate: free text would
dilute the audit trail and tempt drift.

## Storage

The field lives in `skill.yaml` as a top-level key:

```yaml
name: example-skill
version: '0.2.0'
description: 'An example skill.'
provenance: user-authored # or 'agent-proposed' / 'community'
originatingProposalId: proposal_abcd1234deadbeef # optional
```

`originatingProposalId` is set only when `provenance !== 'user-authored'`
and points to the proposal JSON in `.harness/proposals/`. The proposal
file is retained after promotion as an audit record.

## Invariants

- A skill with `provenance: agent-proposed` must have a matching
  `originatingProposalId` pointing to a proposal whose
  `status === 'approved'`.
- Refinements stamp `provenance: agent-proposed` even when the
  pre-refinement skill was `user-authored` — the latest channel wins.
- The provenance field never changes silently. Migration paths
  (e.g. agent-touched edits to a user-authored skill) require an
  explicit refinement proposal.

## Surfaces

- **Dashboard:** the proposals page surfaces provenance + originating
  proposal id for each promoted skill.
- **Telemetry:** Phase 0 `skill_invocation` events can be grouped by
  provenance for adoption analytics (derived view; no new event).
- **CLI:** `harness skill info <name>` reports provenance alongside
  the existing metadata.

## Backfill discipline

`proposal-provenance-backfill` walks every catalog yaml and adds
`provenance: user-authored` only when the field is absent. The task is
idempotent — second runs are no-ops. Operators run it once after
upgrading to Phase 4; new skills authored after the upgrade carry
provenance from the start (either from promotion writes or from human
authors using `harness skill create`, which seeds `user-authored` by
default).
