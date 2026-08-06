# harness:uat-signoff

**Keywords:** uat-signoff, change-lifecycle, human-authority, acceptance, execution-outcome, advisory-record, success-criteria, signoff-artifact

## Overview

`harness:uat-signoff` is a human-judged user-acceptance-testing sign-off skill.
It walks a human through accepting a shipped change one acceptance item at a
time (ACCEPT / REJECT / CHANGES_REQUESTED), captures one overall decision plus
the signer, writes a durable `signoff.md` artifact, and records a single
`execution_outcome` graph node. It is the far-end, human-authority mirror of the
harness lifecycle's machine gates (`acceptance-eval`, `outcome-eval`): those are
LLM-judged and authority-derived; this one is human-judged and advisory.

This proposal reworks the skill's artifact model. The original shipped against an
`docs/inception/<engagement>/` engagement model (reading `brd.md` + `gaps.md`).
That directory is not the lifecycle the rest of the harness uses. Every other
downstream stage — spec, plan, code, review, `outcome-eval` — operates on the
**change lifecycle** directory `docs/changes/<slug>/`. UAT sign-off is the last
stage of that same lifecycle and must operate on the **same** `<slug>`, reading
the change's own `proposal.md` (its `## Success Criteria`) as the acceptance
checklist and recording the human's sign-off beside it.

### Goals

1. Resolve the change under `docs/changes/<slug>/` — the same slug used by
   spec/plan/code/review/outcome-eval — and build the acceptance checklist from
   that change's `proposal.md` `## Success Criteria` (plus `plans/` and any prior
   review/outcome-eval records as supporting context).
2. Record the human sign-off in the same place: `docs/changes/<slug>/signoff.md`
   (per-item disposition + overall decision + signer + ISO timestamp).
3. Persist exactly one `execution_outcome`-shaped graph node via
   `ExecutionOutcomeConnector` (`source: 'uat-signoff'`, `result` from the overall
   decision, metadata carrying the slug + criteria refs + `signedOffBy`).
4. Preserve the core contract: the human is the authority — no `deriveAuthority`,
   no LLM verdict, advisory / record-only, never blocks.

### Non-goals (YAGNI)

- Authoring or amending the change's `proposal.md` / plans. This skill reads the
  acceptance basis; requirement changes go back through brainstorming/planning.
- Any machine verdict or ship-authority derivation. That is `outcome-eval`'s
  contract, under different (authority-derived, blocking) rules.
- A new graph node type. The sign-off reuses the shared `execution_outcome` shape
  so the existing eval-fail-rate signal and effectiveness baselines consume it
  for free.
- Migrating any on-disk `docs/inception/` artifacts. The engagement model was
  never shipped to adopters as data; this is a source-and-skill rework only.

## Decisions made

- **Decision: address the change by `slug`, not `engagement`.** The public tool
  input and recorder input rename `engagement` → `slug`; the graph node id /
  identifier become `outcome:uat-signoff:<slug>:<uuid>` /
  `uat-signoff:<slug>`. Rationale: the whole lifecycle keys on the change slug;
  a second name for the same concept invites drift with `outcome-eval`, which
  already resolves `docs/changes/<slug>/proposal.md`.
- **Decision: the acceptance basis is `proposal.md` `## Success Criteria`.**
  Rationale: `outcome-eval` already judges against that exact section (via its
  `## Success Criteria` → `## User-Visible Behavior` → `## Overview` fallback).
  UAT reusing it means the human signs off against the same criteria the machine
  gate judged — one source of truth, no renumbering.
- **Decision: rename `brdRefs` → `criteriaRefs`.** Rationale: the refs now point
  at Success-Criteria ids, not BRD/gap ids. The metadata key should name what it
  carries.
- **Decision: sign-off artifact stays adjacent — `docs/changes/<slug>/signoff.md`.**
  Rationale: co-locating the sign-off with the change it accepts keeps the whole
  lifecycle for one change in one directory, discoverable by slug.
- **Decision: keep the graph wiring byte-for-byte in contract.** The recorder
  still maps onto `ExecutionOutcome` and ingests via `ExecutionOutcomeConnector`;
  only the field names carried in metadata change. Rationale: the eval-fail-rate
  signal reads `metadata.result` + `metadata.timestamp` only — the rework must not
  disturb that.

## Technical design

### Data structures (`packages/intelligence/src/uat-signoff/types.ts`)

- `UatItemDisposition = 'ACCEPT' | 'REJECT' | 'CHANGES_REQUESTED'` (unchanged).
- `UatOverallDecision = 'ACCEPTED' | 'REJECTED' | 'CHANGES_REQUESTED'` (unchanged).
- `UatSignoffItem { id; disposition; note? }` — `id` reuses the Success-Criterion
  id verbatim (e.g. `SC3`), never invented.
- `UatSignoffInput` — `engagement` → `slug`; `brdRefs` → `criteriaRefs`; docstring
  updated to name `docs/changes/<slug>/` as the owner. Everything else unchanged.

### Recorder (`packages/intelligence/src/uat-signoff/recorder.ts`)

- `toUatExecutionOutcome(input)` maps onto `ExecutionOutcome` exactly as today,
  substituting `slug` for `engagement` in `id` / `identifier` and carrying
  `criteriaRefs` (was `brdRefs`) in metadata. `result` still derives straight from
  the human's overall `decision` (`ACCEPTED` → success, else failure). No
  `deriveAuthority`, no LLM.
- `UatSignoffRecorder.record(input)` unchanged in shape — ingests one node via
  `ExecutionOutcomeConnector`, returns `{ outcomeId, ingest }`.

### MCP tool (`packages/cli/src/mcp/tools/uat-signoff.ts`)

- `UatSignoffToolInput.engagement` → `slug`; `brdRefs` → `criteriaRefs`.
- Description and schema field docs point at `docs/changes/<slug>/` and Success
  Criteria. Validation renames the `engagement` guard to `slug`.
- Handler flow unchanged: sanitize path → `resolveGraphDir` → load graph → record
  → save → record-only success payload. Still degrade-safe and advisory.

### Skill (`agents/skills/**/uat-signoff/SKILL.md`)

- Phase 1 RESOLVE reads `docs/changes/<slug>/proposal.md` `## Success Criteria`
  (plus `plans/` and any prior review/outcome-eval records) as the checklist,
  instead of `brd.md` + `gaps.md`.
- Phase 4 RECORD writes `docs/changes/<slug>/signoff.md` and calls `uat_signoff`
  with `{ slug, decision, signedOffBy, items, criteriaRefs }`.
- Iron Law, gates, escalation, and the advisory/record-only contract are
  preserved verbatim in intent.
- Mirrored byte-identical across all four platform trees (claude-code, codex,
  cursor, gemini-cli).

## Integration Points

- **Entry Points:** the `uat_signoff` MCP tool (existing — renamed inputs only)
  and the `uat-signoff` skill (existing — reworked basis). No new entry point.
- **Registrations Required:** none new. The tool is already registered in
  `server.ts`; the skill is already tiered. Generated reference docs
  (`docs/reference/mcp-tools.md`, `docs/reference/skills-catalog.md`) regenerate
  from source via `scripts/generate-docs.mjs`.
- **Documentation Updates:** regenerate the two generated reference docs so the
  tool description and skill summary reflect the change-lifecycle model. No
  hand-authored doc changes.
- **Architectural Decisions:** None warrant a standalone ADR — this is a rework of
  an unshipped artifact model within one skill/tool, not a new cross-cutting
  pattern.
- **Knowledge Impact:** reinforces the existing "one change slug, one
  `docs/changes/<slug>/` directory across the whole lifecycle" convention;
  UAT sign-off is now explicitly the terminal stage of that lifecycle.

## Success Criteria

1. **SC1 — slug-addressed change resolution.** Running the skill for a change
   resolves `docs/changes/<slug>/` and builds the acceptance checklist from that
   change's `proposal.md` `## Success Criteria`. No `docs/inception/`,
   `brd.md`, or `gaps.md` path remains in the skill or tool source.
2. **SC2 — sign-off recorded adjacent.** The skill writes
   `docs/changes/<slug>/signoff.md` with the overall decision, signer identity,
   ISO timestamp, and a resolved-vs-rejected split of items keyed by
   Success-Criterion id.
3. **SC3 — graph node preserved.** Exactly one `execution_outcome` node is
   recorded via `ExecutionOutcomeConnector` with `source: 'uat-signoff'`, `result`
   derived from the overall decision, and metadata carrying `slug`,
   `criteriaRefs`, and `signedOffBy`. The node reads back from a real `GraphStore`.
4. **SC4 — human authority preserved.** No `deriveAuthority`, no LLM verdict, no
   blocking. The recorder maps the human decision straight onto `result`; the tool
   returns an advisory record-only payload.
5. **SC5 — renamed contract is consistent.** The tool input, recorder input, and
   all tests use `slug` and `criteriaRefs`; no `engagement`/`brdRefs` identifier
   survives in `uat-signoff` source or tests.
6. **SC6 — platform mirror parity.** `SKILL.md` is byte-identical across the four
   platform trees, and the two generated reference docs regenerate cleanly with
   the tool-count assertion reconciled with `main`.
7. **SC7 — no new `harness validate` findings.** Layer rules respected;
   `intelligence` depends only on `types` + `graph`; the full test suite passes.

## Implementation order

- **Phase 1 — intelligence contract.** Rework `types.ts` (`slug`, `criteriaRefs`)
  and `recorder.ts` (id/identifier/metadata), update
  `tests/uat-signoff/recorder.test.ts`. (SC3, SC4, SC5)
- **Phase 2 — MCP tool.** Rework `tools/uat-signoff.ts` inputs, description,
  schema, validation; update `tools/uat-signoff.test.ts`. Reconcile the tool-count
  assertions in the MCP server tests with `main`. (SC3, SC4, SC5)
- **Phase 3 — skill + mirror.** Rework `SKILL.md` Phases 1/4 to the change model,
  preserve the contract, mirror byte-identical across the four platform trees.
  (SC1, SC2, SC6)
- **Phase 4 — regenerate + verify.** Regenerate the generated reference docs, run
  `harness validate`, the full test suite, and the pre-push gauntlet. (SC6, SC7)
