---
number: 0124
title: Fleet provenance is a canonical record — tolerant reader, strict writer, enforced at both ends
date: 2026-09-06
status: proposed
tier: high
source: 'decision-blocked issue #1856'
---

## Context

`docs/changes/<slug>/provenance.json` is the committed artifact every `-fleet` member
requires as proof the real per-item pipeline ran. It is not advisory. `roadmap-fleet`'s
Iron Law makes it **gating**: an item missing it "did not run the pipeline as required
and is rejected or retried — regardless of how confident the report reads"
(`agents/skills/claude-code/roadmap-fleet/SKILL.md:34`), and the Gate restates it —
"No 'merge-ready' without a verified plan artifact and committed provenance file"
(`:204`). The whole point of the artifact is that VERIFY must not trust a subagent's
self-report (`:225`).

**The contract is stated only in prose, and only as content.** Phase 3 item 5
(`SKILL.md:119`) requires the file to record "the item's **issue number(s)**, the
confirmed **route**, the **pipeline stages run** … and the **assumptions** taken," plus a
route-appropriate artifact path. Phase 4 item 2 (`SKILL.md:136-152`) requires VERIFY to
confirm it. Neither states a **key vocabulary, a type, or a nesting**. The same prose is
inherited family-wide through `docs/reference/fleet-family.md`, whose route-evidence
table (`:64-66`) already keys mechanically on `stages` for all three routes.

**Measured consequence: there is no shape consensus at all.** A census of every committed
provenance file on `main` at `056e1a79d` (89 files under `docs/changes/*/provenance.json`;
all 89 parse, all 89 are JSON objects) finds **117 distinct top-level keys** and **exactly
one key present in all 89: `assumptions`**. Everything else the contract requires is
optional in practice:

- **One field, two spellings.** `issue` (60) vs `issues` (34) — and 5 files carry _both_.
  `closingKeyword` (47, one of them `null`) vs `closing_keyword` (16).
  `planArtifact` (57) vs `plan_path` (15). `specArtifact` (4) vs `spec_path` (3).
  `proposalArtifact` (4) vs `proposal_path` (4).
- **One key, two types.** `issue` is an integer in 40 files and a **list** in 20.
  `reproducingTest` is a string in 17 and an **object** in 1. `pipeline` is a dict in 3, a
  list in 1, and a **string** in 2. `rootCause` is a string in 5, a dict in 1. `fix` is a
  string in 4, a dict in 2.
- **The stage list lives in four places.** `stages` (75), `pipelineStages` (14),
  `pipeline.stages` (3), `stagesRun` (3) — and 6 files carry two of them at once.
- **Identity is optional.** 51 of 89 carry neither `slug` nor `item`.
- **A vocabulary nobody emits.** `docs/reference/fleet-family.md:158` names
  `budgetTokens` / `estimatedTokens` / `withinBudget` as provenance fields; **0 of 89**
  files carry any of the three.

The two artifacts #1856 names are the clean illustration, both produced by the _same_
orchestrator in the _same_ run from briefs differing only in the item:
`docs/changes/no-skipped-tests-playwright-describe-skip-1812/provenance.json` is flat
(`pipelineStages`, `reproducingTest` as a string), and
`docs/changes/drift-t001-issue-ref-false-positive-1824/provenance.json` is nested
(`pipeline.stages`, `reproducingTest` as an object). Both are defensible readings of the
prose. Neither is wrong.

**This is not a hypothetical false negative — it already ships.** The only mechanical
reader of provenance in the tree is `harness waypoint record-provenance`
(`packages/cli/src/commands/waypoint.ts:48`). It reads the stage list as
`Array.isArray(parsed.stages) ? parsed.stages.map(String) : []` (`waypoint.ts:70-71`) —
top-level `stages` only. **14 of the 89 committed files (16%) therefore emit
`stages: []`**, silently, into the SDLC event stream — and _both_ artifacts #1856 names
are among those 14. The same command already guesses at identity: `provenanceItem`
(`waypoint.ts:40-44`) falls back `slug` → `item` → directory basename, a fallback 51 of
89 files depend on. The first automated consumer of this artifact was written as a
tolerant guesser because there was nothing to read against, and it still loses data.

**The decision this ADR makes is one 0120 explicitly declined to make.** ADR 0120 treats a
provenance write as an SDLC event source — "a fleet `provenance.json` write →
`sdlc.build.finished.v1`" (`0120-waypoint-sdlc-emission.md:105`) — while stating that "No
TypeScript writes `provenance.json` or handoff records — fleet skill agents author them"
(`:171-172`). 0120 consumes a shape it does not own. **0124 supplies what 0120 assumes.**

**Two sibling lanes in this same fleet run independently hit the same underlying defect
from different directions.** They could not see each other, and neither was looking for a
schema:

1. **`bug-fleet` found a structurally unsatisfiable gate.** `bug-fleet/SKILL.md:160` and
   `:214` require pipeline provenance under `.harness/sessions/<slug>/` from
   `harness-tdd`, with "Absent provenance = the pipeline did not run = rejected." But
   `agents/skills/claude-code/harness-tdd/skill.yaml:49-51` declares
   `state: { persistent: false, files: [] }` — the skill **cannot** emit a session
   artifact. The gate is unsatisfiable as written, and `roadmap-fleet/SKILL.md:139-140`
   records exactly why the family moved off that check: `.harness/sessions/` is
   gitignored and "never survives into a PR." `bug-fleet` was left behind on the
   superseded mechanism.
2. **`craft-fleet` found a provenance pointer that does not resolve.**
   `packages/cli/src/shared/craft/runs/store.ts:84` `deleteRunState()` is called on
   successful finalize by all eleven craft finalizers (e.g.
   `packages/cli/src/code-craft/index.ts:293`), and `pruneOldRuns` expires the rest at
   `RUN_TTL_MS = 24h` (`store.ts:16`, `:93-110`). Issue #1746 publishes
   `.harness/craft/runs/964a84d1-0d1a-47ab-8ed5-587a06c52f25.json` as its provenance.
   That file does not exist; only one unrelated run file survives in the directory. The
   record was deleted by design at the moment the work succeeded.

These are three faces of one problem: **the fleet family has no durable, canonical
provenance contract.** A key-name schema alone would have caught none of #1856's
siblings — one is a member that cannot emit, the other is a pointer that does not
survive. Any contract worth writing has to cover **shape, emittability, and durability**.

**The precedent already exists in this repo, one field over.**
`packages/types/src/fleet-handoff.ts` solved exactly this problem for worker _output_: a
zod `FleetHandoffRecordSchema`, a `FleetHandoffRecord` type, a
`validateFleetHandoffRecord` returning a discriminated
`{ok:true,record} | {ok:false,error}`, a throwing `parseFleetHandoffRecord`, and a
`FLEET_HANDOFF_RECORD_VERSION` constant. Its header states the motivation verbatim:
"Historically each fleet invented its own ad hoc report shape … validated so a malformed
record is rejected rather than silently misread." The committed provenance artifact — the
_gating_ one — has never had the same treatment.

## Decision

The fleet family adopts **one canonical `FleetProvenanceRecord`**, defined in
`@harness-engineering/types` as the structural sibling of `FleetHandoffRecord`
(`packages/types/src/fleet-handoff.ts`): a zod schema, an inferred type, a
`validateFleetProvenanceRecord` returning a discriminated result, a throwing
`parseFleetProvenanceRecord` counterpart, and a `FLEET_PROVENANCE_RECORD_VERSION`
constant. `provenance.json` stops being prose-specified content and becomes a validated
record.

**1. Tolerant reader, strict writer.** The canonical shape is the single source of truth,
but the validator **normalizes on read** rather than rejecting history. It accepts and
folds every alias the census actually observed, and only those:

- `issue` | `issues` → canonical issue list; an integer normalizes to a one-element list.
- `stages` | `pipelineStages` | `pipeline.stages` | `stagesRun` → canonical `stages` list.
- `closingKeyword` | `closing_keyword` → canonical closing keyword.
- `planArtifact` | `plan_path` → canonical plan-artifact path (likewise
  `specArtifact` | `spec_path`, `proposalArtifact` | `proposal_path`).
- `reproducingTest` as a bare string normalizes to the canonical object form with the
  string as its `path`.

**New lane writes MUST emit the canonical shape**; the write path is strict and rejects
aliases and unknown keys, exactly as `FleetHandoffRecordSchema` uses `.strict()` to stop a
fleet "smuggling an ad hoc field back in." Tolerance is a read-side migration affordance,
never a licence to keep inventing keys.

**2. No retrofit.** The 89 existing files are not rewritten. History stays readable
through the tolerant reader; the strict writer stops the divergence growing. A retrofit
would rewrite the evidentiary record of 89 already-verified items to fix a reader.

**3. Enforce at both ends.** The lane validates the record **before committing it**, so a
malformed record fails the lane loudly at write time where the author can still fix it;
and the orchestrator validates again at **VERIFY**, because VERIFY's entire premise is
that it does not trust the producer. Single-ended enforcement fails in one direction or
the other: write-time-only trusts the lane it exists to check, VERIFY-only discovers the
defect after the branch, the PR, and the CI run are already spent.

**4. Malformed is a distinct disposition from did-not-run. This is load-bearing.** VERIFY
resolves a provenance artifact into exactly **three** outcomes, and must never collapse
the third into the first:

- **Absent or unreadable** — the file is missing, or is not parseable JSON. Verdict:
  _the pipeline did not run._ Reject per the Iron Law.
- **Present and conforming** — parses, and normalizes cleanly under the tolerant reader.
  Verdict: provenance satisfied; VERIFY proceeds to the route-appropriate artifact and CI.
- **Present, parseable, but failing validation** — verdict: **`MALFORMED`**, reported with
  the failing field and the reason (the `{ code, message, issues }` error shape
  `validateFleetHandoffRecord` already establishes). This is **not** "did not run."

Conflating malformed with did-not-run is precisely the false negative #1856 reports: a
lane that ran the real pipeline, did the work correctly, and wrote a record with the wrong
key name gets rejected as a fabricator. The remedies differ — a malformed record is
repaired and re-verified; a did-not-run item is rejected or retried — and so the verdicts
must differ. A `MALFORMED` item is returned to its lane for repair, not thrown out.

**5. The contract covers durability and emittability, not only key names.** The two
sibling findings prove a shape-only schema is insufficient:

- **Durable-by-commit.** The record must be **committed onto the branch**, so it survives
  into the PR where the orchestrator can read it. Gitignored tool state
  (`.harness/sessions/`, `.harness/debug/`) does not satisfy the contract —
  `roadmap-fleet/SKILL.md:139-142` already establishes this and `bug-fleet/SKILL.md:160`
  has not caught up.
- **Pointers must resolve at read time.** A path a record publishes as evidence must
  still resolve when VERIFY reads it. A pointer into TTL-expiring or
  deleted-on-success storage (`store.ts:16`, `:84`) is **not** valid provenance; the
  evidence is copied into the committed record, or the record cites something durable.
  This is why #1746's `.harness/craft/runs/…` pointer is dead.
- **A member that cannot emit is non-conforming.** A gate no member can satisfy is a
  defect in the gate, not in the member. A skill declaring `state.persistent: false` and
  `files: []` (`harness-tdd/skill.yaml:49-51`) cannot be the emitter its own VERIFY
  demands, and that mismatch is a conformance failure of the member — surfaced as such,
  not silently rejecting every item that route produces.

**6. Stated once, referenced everywhere.** The canonical shape is stated once in
`docs/reference/fleet-family.md`, and each `-fleet` SKILL.md references it rather than
restating content in prose. `fleet-family.md:64-66` and `:158` are reconciled against the
canonical vocabulary — including the `budgetTokens` / `estimatedTokens` / `withinBudget`
fields, which no committed file carries.

**7. `harness waypoint record-provenance` is the first consumer.**
`packages/cli/src/commands/waypoint.ts:40-72` is the natural enforcement seam and the
existing proof of harm: it replaces its hand-rolled `parsed.stages`-only read and its
`slug` → `item` → dirname guess with `validateFleetProvenanceRecord`, recovering the
stage list for the 14 files it currently zeroes out. ADR 0120 already named this command
the sanctioned seam (`0120:171-172`); this decision gives it something to validate
against.

**Assumptions made (answered at CONFIRM).** The two forks were answered by the human at
the fleet's CONFIRM round and are adopted as decided — **F1 = tolerant reader, strict
writer** (one canonical record, aliases normalized on read, canonical required on write,
no retrofit of the 89) and **F2 = enforce at both ends** (lane validates before commit,
orchestrator validates at VERIFY, and a malformed record is rejected _as malformed_,
explicitly distinguished from "pipeline did not run"). Everything else here is derived
from those two answers plus the verified evidence above. The following are this ADR's own
recommended-option defaults, each a mechanism choice that an equivalent mechanism
satisfies equally:

- **Alias set is closed to what was observed.** Only the aliases the 89-file census
  actually contains are tolerated. New aliases are not accepted; the strict writer is what
  prevents the set growing.
- **Conflict resolution when a file carries two spellings.** The canonical key wins (6
  files carry two stage locations, 5 carry both `issue` and `issues`). A conflicting
  duplicate is reported as a warning on read, not a rejection — rejecting would fail
  history the no-retrofit rule promises to keep readable.
- **Location.** `packages/types/src/fleet-provenance.ts`, mirroring
  `fleet-handoff.ts`, rather than a new package or a home in `core`.
- **Versioning.** A `FLEET_PROVENANCE_RECORD_VERSION` constant with parsers tolerating an
  absent or unknown `v`, copying the `FLEET_HANDOFF_RECORD_VERSION` convention — which is
  what makes the 89 unversioned files readable.
- **Required-field floor.** The four things `roadmap-fleet/SKILL.md:119` already names in
  prose — issue(s), route, stages, assumptions — plus a stable item identity, are the
  required core; the route-conditional artifact path is required per route per
  `fleet-family.md:64-66`. Everything else is optional.
- **Implementation is downstream.** This ADR documents the decision; the schema, the
  validator, the `fleet-family.md` rewrite, the per-member SKILL.md references, and the
  `waypoint.ts` migration are separate build items.

## Consequences

### Positive

- **The family's most important gate stops guessing.** VERIFY reads one normalized record
  instead of probing JSON keys by hand — which is how #1856 was caught at all, and which
  the issue correctly notes "does not scale and will not survive automation."
- **A live data-loss bug gets a fix target.** `harness waypoint record-provenance`
  currently emits `stages: []` for 14 of 89 committed files
  (`packages/cli/src/commands/waypoint.ts:70-71`), including both artifacts #1856 names.
  A canonical reader recovers all 14.
- **The false negative the Iron Law would otherwise produce is closed by construction.**
  Separating `MALFORMED` from did-not-run means a correct lane with a mis-keyed record is
  repaired, not accused of fabricating its work — while the Iron Law keeps its full force
  against an artifact that is genuinely absent.
- **History stays readable and the divergence stops growing.** No retrofit means the 89
  files remain the evidentiary record of 89 verified items; the strict writer means file
  90 is the last shape anyone has to normalize.
- **Two independent sibling defects get a common frame.** `bug-fleet`'s unsatisfiable
  `.harness/sessions/` gate and `craft-fleet`'s dead `.harness/craft/runs/` pointer stop
  being two unrelated bugs and become two conformance failures against one contract.
- **ADR 0120's assumption is discharged.** The SDLC emission layer gets the shape it
  already consumes.

### Negative / trade-offs

- **The tolerant reader is permanent debt.** Alias normalization for `issue`/`issues`,
  four stage locations, two closing-keyword spellings and string-or-object
  `reproducingTest` is code that exists only to read files nobody will write again.
  Mitigation: the alias set is closed to the observed census, it is covered by fixtures
  drawn from the real 89, and it is deletable in one commit if the corpus is ever retired.
- **Tolerance can hide non-conformance.** A lane emitting `pipelineStages` still
  normalizes cleanly and never learns it is wrong. Mitigation: the strict _writer_ is the
  enforcement point — write-time validation fails that lane loudly before the commit, so
  read-side tolerance never becomes the write-side contract.
- **Double enforcement means double failure surface.** A validator bug can now fail a lane
  at write time _and_ at VERIFY. Mitigation: both ends call the same
  `validateFleetProvenanceRecord`, so there is one implementation to be wrong, not two —
  the same single-definition argument `fleet-handoff.ts` makes for the handoff record.
- **A third VERIFY disposition is a real cost.** `MALFORMED` adds a state every member's
  VERIFY prose and every downstream report must handle; a member that forgets it will fall
  back to rejecting, reintroducing the false negative this ADR exists to remove.
  Mitigation: it is stated once in `fleet-family.md` and referenced, not restated.
- **Durability and emittability are conformance claims that need enforcing.** "Pointers
  must resolve" and "a member must be able to emit" are checkable, but nothing checks them
  today. Left unenforced they are aspiration; #1746's dead pointer is what that looks like.
- **Fixing `bug-fleet` and the craft-run pointer is not free.** Neither is fixed by this
  ADR. `bug-fleet` must migrate off `.harness/sessions/` to the committed artifact, and the
  craft finalizers must copy their evidence somewhere durable before
  `deleteRunState` (`store.ts:84`) runs.

### Neutral

- **The types barrel is hand-curated.** `packages/types/src/index.ts` re-exports
  `fleet-handoff` by explicit name (`:460-473`), so a new `fleet-provenance.ts` will
  **silently not surface** to consumers until `index.ts` is edited — the same
  dual-source-of-truth hazard as the curated core barrel. Downstream is automatic once it
  is: `scripts/generate-core-barrel.mjs:212` emits
  `export * from '@harness-engineering/types';`, so `@harness-engineering/core` picks it up
  without an allowlist entry, unlike core's own modules.
- **`FleetHandoffRecord` and `FleetProvenanceRecord` are siblings, not a hierarchy.** One
  is the transient worker→orchestrator report, the other the committed on-branch artifact.
  They overlap in `fleet` / `item` / evidence pointers but are versioned independently.
- **Reversibility is high for the shape, low for the distinction.** The schema, the alias
  set, and the required-field floor are a types-package change plus tests — cheap to
  retune. What is _not_ cheaply reversible is separating `MALFORMED` from did-not-run:
  that is the load-bearing correctness fix, and collapsing it restores the exact false
  negative #1856 reports.

## Alternatives Considered

- **Strict schema with a hard cutover, retrofitting all 89 files.** Rejected — it rewrites
  the committed evidentiary record of 89 already-verified items to accommodate a reader,
  and it is a merge-conflict engine across every open fleet branch. The tolerant reader
  buys the same uniformity without touching history, which is exactly what F1 selects.
- **Prose-only: state the canonical keys in `docs/reference/fleet-family.md` and change no
  code.** Rejected — this is precisely the status quo. `roadmap-fleet/SKILL.md:119` already
  specifies the required _content_ in prose, and 89 files across 117 distinct keys with
  exactly one universal key is the measured result. Prose that is not validated is not a
  contract.
- **Enforce only at VERIFY.** Rejected — the defect is discovered after the branch, the PR
  and a full all-OS CI run are already spent, and the lane that could have fixed it in
  seconds is gone. F2 rules it out.
- **Enforce only at write time.** Rejected — it asks VERIFY to trust the producer, which
  inverts the entire premise stated at `roadmap-fleet/SKILL.md:34` and `:225`. VERIFY
  exists because self-reports are claims, not evidence.
- **Treat a malformed record as "did not run the pipeline."** Rejected — it is the exact
  false negative #1856 reports, and it is the most damaging one available: it rejects a
  lane that did everything right and reports it as having faked its work. The distinction
  is the load-bearing half of this decision.
- **A shape-only schema, leaving durability and emittability out of scope.** Rejected —
  neither sibling finding is a key-name problem. `harness-tdd` cannot emit
  (`skill.yaml:49-51`) and #1746's pointer is deleted on success (`store.ts:84`); a schema
  would have validated both into silence.
- **Per-member schemas, each fleet owning its own provenance shape.** Rejected — it
  re-centralizes nothing and guarantees `fleet-command` special-cases every member, the
  precise failure `fleet-handoff.ts` was written to end. One family-wide artifact deserves
  one family-wide record.
- **Reuse `FleetHandoffRecord` itself for the committed artifact.** Rejected — the handoff
  is a transient bounded report keyed on terminal disposition (`status`, `blocker`); the
  provenance record is a durable, committed, route-shaped account of what ran. Overloading
  one schema for both would force optional fields onto both and weaken each.

## References

- Resolves: #1856 (`provenance.json` has no canonical schema, so VERIFY must guess key
  names — two lanes in one run emitted two different shapes). This ADR answers its
  suggested fixes 1, 2 and 3 as a decision; the implementation is downstream build work.
- Widened by two sibling findings from the same fleet run: `harness-tdd` cannot emit the
  `.harness/sessions/` provenance its own VERIFY requires, and #1746 publishes a
  `.harness/craft/runs/` pointer that no longer resolves.
- Refs: #1812, #1824, #1851, #1852 — the two lanes whose divergent artifacts are the
  reported evidence; #1746 — the filed item carrying the dead provenance pointer.
- **Precedent:** `packages/types/src/fleet-handoff.ts` — `FLEET_HANDOFF_RECORD_VERSION`,
  `FleetHandoffRecordSchema` (`.strict()`), `FleetHandoffEvidenceSchema`,
  `validateFleetHandoffRecord` returning `{ok:true,record} | {ok:false,error}` with a
  `{code, message, issues}` error, and `parseFleetHandoffRecord`. The structural model for
  this record, and the source of the "malformed is rejected rather than silently misread"
  principle.
- **The prose contract this replaces:**
  `agents/skills/claude-code/roadmap-fleet/SKILL.md:119` (Phase 3 item 5 — required
  content, no vocabulary), `:136-152` (Phase 4 item 2 — VERIFY requires the committed file
  and the route artifact), `:139-142` (why `.harness/sessions/` was abandoned: gitignored,
  never survives into a PR), `:34` and `:225` (the Iron Law and the no-self-report
  rationalization), `:204` (the merge-ready Gate), `:275` and `:291` (worked examples of
  rejection on a missing artifact).
- **Family inheritance:** `docs/reference/fleet-family.md:64-66` — the route-evidence
  table already keying mechanically on `provenance.json` `stages` for bug / spec-ready /
  feature; `:158` — `budgetTokens` / `estimatedTokens` / `withinBudget` named as
  provenance fields that 0 of 89 committed files carry.
- **The live mechanical reader:** `packages/cli/src/commands/waypoint.ts:48`
  (`record-provenance <file>`), `:40-44` (`provenanceItem` — the
  `slug` → `item` → dirname guess, relied on by 51 of 89 files), `:70-71` (top-level
  `stages` only — the read that zeroes out 14 of 89, including both artifacts #1856 names).
- **Supplies what it assumes:**
  [`0120-waypoint-sdlc-emission.md`](0120-waypoint-sdlc-emission.md) `:105` (a fleet
  `provenance.json` write → `sdlc.build.finished.v1`) and `:171-172` (no TypeScript writes
  it; fleet skill agents author it; `harness waypoint record-provenance` is the sanctioned
  seam). 0120 consumes the shape; 0124 defines it.
- **Companion:** [`0093-fleet-scheduling-depth-lossy-key.md`](0093-fleet-scheduling-depth-lossy-key.md)
  — the same family-wide pattern one layer up: a value every member reports, uncomparable
  because no contract said how to produce it.
- **The two named artifacts:**
  `docs/changes/no-skipped-tests-playwright-describe-skip-1812/provenance.json` (flat —
  `pipelineStages`, `reproducingTest` as a string) and
  `docs/changes/drift-t001-issue-ref-false-positive-1824/provenance.json` (nested —
  `pipeline.stages`, `reproducingTest` as an object).
- **Sibling-finding evidence:** `agents/skills/claude-code/harness-tdd/skill.yaml:49-51`
  (`state: { persistent: false, files: [] }`) against
  `agents/skills/claude-code/bug-fleet/SKILL.md:160` and `:214` (which require
  `.harness/sessions/<slug>/` provenance, "Absent provenance = the pipeline did not run =
  rejected"); `packages/cli/src/shared/craft/runs/store.ts:16` (`RUN_TTL_MS = 24h`), `:84`
  (`deleteRunState` on finalize), `:93-110` (`pruneOldRuns`), called by all eleven craft
  finalizers (e.g. `packages/cli/src/code-craft/index.ts:293`).
- **Barrel wiring:** `packages/types/src/index.ts:460-473` (hand-curated named re-export of
  `fleet-handoff` — the edit a new `fleet-provenance.ts` will also require);
  `scripts/generate-core-barrel.mjs:212` (`export * from '@harness-engineering/types';`,
  so core picks it up without an allowlist entry).
- **Census method:** all 89 `docs/changes/*/provenance.json` on `main` at `056e1a79d`,
  parsed and key-tallied; 117 distinct top-level keys; `assumptions` the only key present
  in all 89.
