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

## Adoption (this PR, phase 2 — downstream adoption)

The reusable primitive above ships the type; this phase makes the fleet family
actually emit and consume it, so #1414 becomes **define + adopt** in one cohesive
PR (not a new PR).

### What was adopted

- **Every fleet member SKILL.md** now REQUIRES each worktree-isolated worker to
  return the canonical `FleetHandoffRecord` (from `@harness-engineering/types`) at
  the end of its DISPATCH phase, replacing any ad hoc per-worker report shape. A
  uniform "Worker handoff — return the canonical `FleetHandoffRecord`" paragraph
  was inserted into the DISPATCH phase of all eleven fan-out members:
  `bug-fleet`, `roadmap-fleet`, `pr-fleet`, `cicd-fleet`, `cleanup-fleet`,
  `security-fleet`, `test-fleet`, `issue-fleet`, `adr-fleet`, `craft-fleet`, and
  `ideate-fleet`. (The task named nine core members plus a check of `craft-fleet`
  and `ideate-fleet`; both fan out workers with a per-item return, so both
  adopted — none skipped.) Domain payloads a member already carries
  (`bug-fleet`'s `Candidate`, `ideate-fleet`'s candidate record) are left intact:
  the canonical record is the **envelope** the worker hands back, and those
  payloads live inside its `summary` / `evidence` / `next_steps`.
- **`fleet-command`** VERIFY now states it parses/validates each lane's worker
  output as the canonical `FleetHandoffRecord` **uniformly** via
  `validateFleetHandoffRecord`, instead of special-casing each member's shape —
  the whole point of the primitive.
- **`docs/reference/fleet-family.md`** codifies the record as the family standard:
  a new "The worker handoff record (canonical)" section (type name, fields,
  bounded guarantee, emitters/consumers) plus a fifth Hard Invariant ("Every
  worker emits the canonical `FleetHandoffRecord`"). The member skills link to it.

### Nature of the adoption

Doc/prose-level. A codebase grep found **no** code that parses fleet worker
output today (`fleet-command` and the members are skill-prose orchestrators; the
only references to the type are its own module and the types barrel). There is no
shared worker-report parser to rewire, so the adoption is the skill + reference
contract — the type/validator is already wired and tested from phase 1. When a
future runtime parses worker output it calls `validateFleetHandoffRecord` /
`parseFleetHandoffRecord` per this contract.

### Generated artifacts

Editing the canonical `agents/skills/claude-code/*/SKILL.md` files updates the
cursor / codex / gemini-cli mirrors automatically (they are symlinks). The plugin
command manifests and gemini `.toml` were regenerated with `pnpm generate:plugin:all`
and the reference docs with `pnpm generate-docs`; no generated file was hand-edited
and no gate was bypassed.
