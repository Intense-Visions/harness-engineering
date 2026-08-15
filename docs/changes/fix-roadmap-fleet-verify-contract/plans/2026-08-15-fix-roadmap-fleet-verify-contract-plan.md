# Plan: satisfiable roadmap-fleet VERIFY provenance + closing-keyword contract

- **Slug:** `fix-roadmap-fleet-verify-contract`
- **Issues:** #1298, #1297
- **Proposal:** `docs/changes/fix-roadmap-fleet-verify-contract/proposal.md`
- **Primary surface:** `agents/skills/claude-code/roadmap-fleet/SKILL.md`

## Approach

Single-surface skill-contract edit plus generated-mirror regeneration. Both issues touch the same SKILL.md (VERIFY, DISPATCH, Gates, Rationalizations, Examples, Success Criteria, Test Scenarios), so they are one lane. Session state stays gitignored; we route the verifiable proof to a committed provenance file instead.

## Tasks

### T1 — Iron Law: swap the leave-behind evidence (#1298)

- In the Iron Law prose, change "a plan directory plus an autopilot-state" to "a plan directory plus a committed pipeline-provenance file".
- Checkpoint: Iron Law no longer names session/autopilot state as the evidence.

### T2 — DISPATCH: mandate the provenance file (#1298)

- Add a numbered DISPATCH step: each lane MUST write and commit `docs/changes/<slug>/provenance.json` with fields — issue number(s), pipeline stages run, plan-artifact path, assumptions.
- Explain it replaces gitignored session state and survives into the PR.
- Checkpoint: DISPATCH carries an explicit MUST-write-provenance instruction with all four fields.

### T3 — DISPATCH: closing-keyword contract (#1297)

- Add a numbered DISPATCH step: full resolution → `Closes #<N>`; slice of a multi-finding issue → `Refs #<N>` + flag for manual reconciliation.
- State the failure modes of each wrong default (stranded row vs prematurely-closed issue).
- Checkpoint: DISPATCH states both keyword cases and the default reasoning.

### T4 — VERIFY: require plan + provenance; check PR-body keyword (#1298, #1297)

- Replace the autopilot-state bullet with the committed provenance-file bullet (both committed on the branch).
- Add a VERIFY step checking the PR body carries the scope-correct closing keyword.
- Renumber subsequent VERIFY steps; update the classify step to name provenance + keyword.
- Checkpoint: VERIFY requires plan + provenance, and checks the PR-body keyword; numbering is consistent.

### T5 — Gates + Rationalizations + Examples + Success Criteria + Test Scenarios (#1298, #1297)

- Gates: the "no merge-ready without a verified artifact" gate references plan + committed provenance (not session state); add a closing-keyword gate.
- Rationalizations table: replace "autopilot-state" with the provenance file.
- Examples (Phase 4 lines + hand-built rejection): swap autopilot-state → provenance.json; show `Closes #N` in bodies.
- Success Criteria: add provenance + scope-correct closing keyword.
- Test Scenarios: update Scenario 1 to mention provenance; add Scenario 4 for the closing-keyword contract.
- Checkpoint: no `autopilot-state`/`session state` remains as a _required_ artifact; provenance + keyword are consistent throughout.

### T6 — Regenerate generated mirrors

- Run `pnpm generate:plugin:all` to regenerate `.claude-plugin`, `.cursor-plugin`, `.gemini-extension`, `.antigravity-extension`, and codex command copies from the edited source. Never hand-edit them.
- Checkpoint: `pnpm generate:plugin:check` passes (no drift).

### T7 — Dogfood + validate

- Write this branch's own `provenance.json` under `docs/changes/<slug>/` — dogfooding the contract being added.
- `pnpm prettier --write` changed markdown/json; run any SKILL.md lint/validation; add a changeset if the pre-push gate asks.
- Checkpoint: prettier clean, validation passes, provenance file present and committed.

## Verification

- Independent check: `grep` confirms no required autopilot-state remains; provenance + closing-keyword contract present in DISPATCH, VERIFY, Gates.
- `pnpm generate:plugin:check` green (mirrors match source).
- Pre-push gauntlet green without `--no-verify`.

## Risks / rollback

- **Mirror drift** if regeneration is skipped — mitigated by T6 + the `:check` gate.
- Pure-docs change: rollback is reverting the branch; no runtime/behavioral risk.
