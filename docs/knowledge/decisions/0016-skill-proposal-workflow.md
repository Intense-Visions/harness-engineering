---
number: 0016
title: Skill proposal / refinement workflow — soundness-gated promotion with provenance
date: 2026-05-17
status: accepted
tier: medium
source: docs/changes/hermes-phase-4-skill-proposals/proposal.md
---

## Context

Hermes Phase 4 ("Skill Proposal Loop") had to close three gaps named in the
[Hermes Adoption meta-spec](../../changes/hermes-adoption/proposal.md):

1. **No capture surface** — agents have no way to emit a candidate skill at the
   end of a non-trivial task. The signal evaporates between sessions.
2. **No provenance** — once a skill is in the catalog, harness cannot answer
   "who/what authored this?"
3. **No review queue** — when proposals start arriving, harness needs a place
   for humans to triage them.

The killer-adoption row K1 specified a soundness-gated promotion path "consistent
with harness's mechanical-enforcement ethos." Three approaches were considered:

- **A. Auto-promote on emit (Hermes parity)**. Fastest feedback. Lowest reviewer
  burden. But the catalog drifts toward AI-slop accumulation, and the audit trail
  conflates "human approved this" with "an LLM emitted it."
- **B. Sync soundness-review on emit, then auto-promote if passing**. Catches
  the worst proposals pre-queue but bottlenecks emit on a multi-minute LLM-driven
  review. And mechanical-only review can't catch "passes the gate but is a bad
  idea."
- **C. Queue on emit, gate on approve**. Emit is cheap and non-blocking;
  promotion is gated by both mechanical review _and_ a human decision. The audit
  trail records which channel produced each skill.

## Decision

We adopt **Option C**. Concretely:

- `emit_skill_proposal` (MCP tool) writes `.harness/proposals/<id>.json` with
  `status: open`. It returns immediately; agents do not wait for review.
- A dashboard page (`/s/proposals`) lists proposals with inline content,
  soundness-gate status, and approve/reject/edit/run-gate actions.
- "Approve" runs the soundness-review gate synchronously, then promotes on pass.
  On fail, the proposal stays in the queue with findings surfaced inline.
- Refinement proposals carry a unified diff against the targeted catalog skill.
  In v1 the reviewer applies the diff manually via the edit action; auto-apply
  is a follow-up if queue volume justifies it.
- Every promoted skill carries `provenance: agent-proposed` and an
  `originatingProposalId` pointing back to the proposal. Pre-Phase-4 skills are
  backfilled with `provenance: user-authored` by the one-shot
  `proposal-provenance-backfill` housekeeping task.
- Promotion writes to `agents/skills/claude-code/<name>/` only in v1;
  cross-host emission stays on the existing `harness generate-slash-commands`
  pipeline.

The soundness-review skill currently runs in `--mode spec` against the proposal
content as a degraded mode. A `--mode skill` check vocabulary is a follow-up
spec, triggered by the first wave of real queue contents.

## Consequences

- **Agents can self-improve, mechanically.** A capture path exists that does
  not bypass the mechanical-review discipline harness applies to everything
  else.
- **Catalog provenance becomes a queryable property.** Operators can answer
  "how many of our skills were authored by an agent?" — a question Hermes
  cannot answer because its taxonomy never records the channel.
- **Reviewer UX becomes the bottleneck**, not emit latency. The < 30 s
  per-proposal target (spec D9) is the binding constraint.
- **The soundness gate is degraded in v1**: structural checks substitute for
  the full S-series. Documented degradation, not a defect.
- **Phase 3 sinks pick up `proposal.*` events automatically** via the existing
  webhook + notification fan-out.

## Alternatives considered

- **Option A** (auto-promote) was rejected as inconsistent with harness's
  mechanical-enforcement ethos.
- **Option B** (gate-on-emit) was rejected because it converts emit from a
  fast, non-blocking write into a multi-minute synchronous LLM call.
- **Storing proposals in SQLite** (parallel to Phase 1's FTS5 session store)
  was rejected because volume is low and filesystem JSON is trivially
  grep-able / hand-editable during review.

## References

- Phase 4 spec: `docs/changes/hermes-phase-4-skill-proposals/proposal.md`
- Phase 4 plan: `docs/changes/hermes-phase-4-skill-proposals/plans/main.md`
- Hermes meta-spec K1 row: `docs/changes/hermes-adoption/proposal.md`
- Companion ADR (token scope): `0017-manage-proposals-scope.md`
