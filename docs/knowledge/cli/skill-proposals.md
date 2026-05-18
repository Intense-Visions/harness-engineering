---
type: business_process
domain: cli
tags: [skills, proposals, hermes-phase-4, review-queue, soundness-review]
---

# Skill Proposal Lifecycle

Hermes Phase 4 (K1 from the parent meta-spec) adds a queue-based loop
that lets an agent emit a candidate skill — new or refinement — at the
end of a non-trivial task, and lets a reviewer triage the queue through
the dashboard or CLI. Promotion is gated by the soundness-review skill;
the queue never auto-promotes.

## Stages

1. **Emit.** The agent calls the `emit_skill_proposal` MCP tool with a
   `kind` (`new-skill` or `refinement`), a `proposedBy` identifier,
   a `justification` (20–2000 chars), and content. For new-skill,
   content includes `skillYaml` + `skillMd`. For refinement, content
   carries a unified diff against an existing `targetSkill`. The tool
   validates the cross-field invariants, writes `.harness/proposals/<id>.json`,
   and returns the proposal id + queue URL. It does **not** block on
   any gate.
2. **Queue.** The proposal sits at `status: 'open'` in
   `.harness/proposals/`. The dashboard page at `/s/proposals` and
   the `harness proposals list` CLI both read this directory. A
   `proposal.created` event fires onto the gateway event bus; webhook
   subscribers with the `proposal.*` glob receive it, and any in-process
   notification sinks (Slack) render an envelope.
3. **Run gate.** The reviewer triggers `POST /api/v1/proposals/<id>/run-gate`
   (UI button or CLI). The gate performs mechanical structural checks
   — kebab-case name, parseable `skill.yaml`, SKILL.md size bounds for
   new skills; unified-diff well-formedness for refinements — and
   persists findings + `lastRunAt` into the proposal. Status transitions
   to `gate-running` (pass) or `gate-failed` (any error-severity finding).
4. **Edit (optional).** Reviewer can `PATCH /api/v1/proposals/<id>`
   to amend content. Any edit resets the gate to `not-run` so the
   next approval re-validates.
5. **Approve.** With `status: 'gate-running'` and `gate.lastRunAt`
   within the last 24h with zero errors, `POST /api/v1/proposals/<id>/approve`
   runs the promote routine. For new-skill, it writes
   `agents/skills/claude-code/<name>/skill.yaml` + `SKILL.md` with
   `provenance: agent-proposed` and `originatingProposalId: <id>`. For
   refinement, it verifies the target skill exists and that the
   reviewer applied the diff (file diverges from git HEAD), then stamps
   provenance + `originatingProposalId` onto the existing yaml. Emits
   `proposal.approved`. The slash-command generator picks the skill up
   on its next run.
6. **Reject.** `POST /api/v1/proposals/<id>/reject` with a one-line
   reason transitions the proposal to `rejected` and emits
   `proposal.rejected`. The proposal file stays on disk as an audit
   record; it does not silently disappear.

## Storage

- Location: `.harness/proposals/<id>.json` (one file per proposal).
- Format: validated through `SkillProposalSchema` in
  `@harness-engineering/types`. Schema is strict; cross-field invariants
  enforce the `kind` ↔ content shape relationship.
- IDs: `proposal_<32-hex>` (`crypto.randomUUID` minus hyphens). No
  reuse across promote / reject.

## Surfaces

- **MCP tool:** `emit_skill_proposal` (tier `standard`).
- **CLI:** `harness proposals list|show|approve|reject` plus
  `harness backfill-skill-provenance` (one-shot).
- **Dashboard:** `/s/proposals` review queue page.
- **Gateway routes:** seven routes under `/api/v1/proposals/*`,
  registered in `V1_BRIDGE_ROUTES`. Read scopes use `read-status`;
  mutate scopes use `manage-proposals` (ADR 0017).
- **Events:** `proposal.created`, `proposal.approved`,
  `proposal.rejected`. Fan out via Phase 0 webhook bus and Phase 3
  notification sinks.

## Backfill

`agents/skills/<host>/<skill>/skill.yaml` files without a `provenance`
key get `provenance: user-authored` stamped onto them by the
`proposal-provenance-backfill` maintenance task (one-shot, manual
trigger; cron set to Feb 31 so the auto-scheduler never fires it). The
task is idempotent.

## Soundness-review skill-mode

The Phase 4 spec's D5 + Non-goals reserve `harness:soundness-review
--mode skill` as a follow-up spec. Until that mode exists, the gate's
mechanical checks substitute. Both implementations share the same
finding shape (`{severity, title, detail}`) so swapping one for the
other does not require route, schema, or storage changes.
