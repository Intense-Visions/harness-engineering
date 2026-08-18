# Plan — Canonical bounded handoff record for fleet workers (#1396)

## Goal

Ship ONE shared, bounded handoff record that every fleet-family worker
(bug-fleet, roadmap-fleet, pr-fleet, cicd-fleet, cleanup-fleet, security-fleet,
test-fleet, issue-fleet, adr-fleet) can emit from each worktree-isolated worker,
so `fleet-command` can parse any fleet's worker output uniformly instead of
special-casing each fleet's ad hoc report shape. Modeled on a Ralph-loop bounded
structured report (the normalized report handed from one continuing round to the
next).

## Scope (this PR)

- The reusable primitive only: the shared type + a validation helper + tests.
- Landed in `@harness-engineering/types`, mirroring the existing shared-type +
  zod-validator pattern (`plan-task.ts` `PlanTaskSchema`, `maintenance-findings.ts`
  contract + parse/format helpers).
- A short reference-doc note pointing fleets at the new type.
- NOT in scope: retrofitting the nine fleet SKILL.md files (downstream adoption).

## Design

`packages/types/src/fleet-handoff.ts`:

- `FleetHandoffStatusSchema` — enum `done | parked | blocked | failed`, mirroring
  the fleet DISPATCH contract (a worker returns a branch, parks on an unforeseen
  fork, or fails).
- `FleetHandoffEvidenceSchema` — `{ kind, ref, note? }`, a verifiable pointer
  (path / URL / branch / SHA / check name) the orchestrator independently confirms.
- `FleetHandoffRecordSchema` — the bounded envelope: `status`, `fleet`, `item`,
  `summary`, `evidence[]` (default `[]`), `next_steps[]` (default `[]`),
  `blocker?`, `v?`. `.strict()` rejects unknown keys so a fleet cannot smuggle an
  ad hoc field back in.
- Cross-field invariant enforced in code (not just schema): any non-`done` status
  MUST carry a non-empty `blocker`.
- `validateFleetHandoffRecord(input)` — non-throwing discriminated result
  (`{ ok, record } | { ok:false, error }`) with `SCHEMA` / `BLOCKER_REQUIRED`
  error codes.
- `parseFleetHandoffRecord(input)` — throwing counterpart.
- `FLEET_HANDOFF_RECORD_VERSION`, `FLEET_HANDOFF_BLOCKER_REQUIRED_STATUSES` consts.

## Tasks

1. Author `packages/types/src/fleet-handoff.ts` (schema + validator + helpers).
2. Export the surface from the `@harness-engineering/types` barrel (`src/index.ts`).
3. Add unit tests (`packages/types/tests/fleet-handoff.test.ts`): valid record
   passes; missing required field / unknown key / bad status / malformed evidence
   rejected; non-`done`-without-blocker rejected; non-object rejected.
4. Add the module to the types reference index (`docs/reference/api/types.md`).
5. Build + test + full gate.

## Verification

- `pnpm --filter @harness-engineering/types build` — succeeds.
- `pnpm --filter @harness-engineering/types test` — all tests green (valid passes,
  malformed rejected).
- Pre-commit `harness ci check` + pre-push gauntlet green.

## Bounded-record guarantee

"Bounded" = a fixed, documented field set with enforced semantics: `.strict()`
rejects unknown keys, required fields are non-empty, and the validator rejects a
record whose status demands a blocker but omits it. A malformed record is
rejected, never silently misread.
