---
number: 0128
title: Item-type routing resolves from the issue type label; ADR 0103's roadmap-kind tier is struck, not built
date: 2026-09-08
status: proposed
tier: medium
source: decision-blocked issue #2056
---

## Context

ADR **0103** (`status: accepted`) is the canonical item-type routing contract for the build-shaped `-fleet` members. Its clause 3 states classification as a **metadata-first, rubric-fallback** rule, restated canonically in `docs/reference/fleet-family.md:54-58`:

1. **Explicit metadata** — a GH issue label (`bug`/`defect` -> bug; `feature`/`enhancement` -> feature) **or a roadmap shard's kind/type field**.
2. **Spec presence** — an approved spec linked (roadmap `spec:` non-null or a `proposal.md`) -> **spec-ready**.
3. **Rubric fallback** — `harness-router`'s scope rubric applied by judgment over the item text.

Issue #2056 reports that **both** metadata tiers are dead. This record is drafted only after re-deriving each claim first-party at base `738b296c0`. **One of the two claims is confirmed and strengthened; the other is refuted, which materially narrows the decision.**

### Claim 1 — "the explicit issue label is read by nothing": REFUTED

#2056 supports this claim with a grep for `route:[a-z-]*-fleet`. That is **the wrong signal**. ADR 0103 never mentions the `route:*` family, and neither does `fleet-family.md:56`; the metadata tier-1 signal is the **type** label (`bug`/`defect`/`feature`/`enhancement`), which is a different axis. ADR 0127 draws exactly this distinction — `route:*` answers "whose queue", the type axis answers "which pipeline" — and #2056 imports 0127's `route:*` evidence into a tier it does not govern.

Measured directly over the live corpus (295 open issues, `gh issue list --state open --limit 500`):

| Signal                     | Count   | Share   |
| -------------------------- | ------- | ------- |
| Carries >=1 **type** label | **125** | **42%** |
| Carries no type label      | 170     | 58%     |
| `bug`                      | 91      |         |
| `enhancement`              | 26      |         |
| `documentation`            | 14      |         |

Tier 1 resolves for **42% of the open backlog**. It is under-populated, not dead, and the fix for the remaining 58% is already owned: ADR 0127's migration step 1 backfills a type label onto every open issue that lacks one. The "metadata-first is false in practice" framing does not survive the correct measurement.

### Claim 2 — "the roadmap shard kind field does not exist": CONFIRMED, and more strongly than #2056 argued

#2056 evidences this by grepping the 300 shard files for `Kind`, finding zero. That establishes the field is **unpopulated**. The stronger fact is that it is **absent from the model**, so it could not be populated even by hand:

- `packages/core/src/roadmap/serialize.ts:110-134` emits exactly eight item fields — `Assignee`, `Priority`, `External-ID`, `Status`, `Spec`, `Summary`, `Blockers`, `Plan`. There is no `Kind` and no `Type`.
- `packages/core/src/roadmap/preservation.ts` defines `MODELED_FIELD_KEYS` as the round-trip field set, documented as "Source of truth is `parseFeatureBlock` in `./parse`" and "**a new serialized field fails that test until it is added here**" (`preservation.test.ts`).
- The same module is the monolith write-preservation guard (#839): `serializeRoadmap` "emits ONLY the fields `parseRoadmap` models" and "silently discards ... `- **Key:**` bullets whose key is not modeled". A hand-added `- **Kind:**` bullet is therefore **detected as unpreservable and the write refused** — the lossy-serializer hazard #2056 flags, confirmed at its source.

So tier 2 is not an unpopulated field: **it names a field the schema has never had.** An accepted ADR describes a mechanism that does not exist.

### Claim 3 — "nothing distinguishes a metadata-resolved route from a guessed one": PARTLY REFUTED, and the residue is precise

The signal **is** modeled in the run surface. `roadmap-fleet/SKILL.md:87` defines `routeSignal` (`"label" | "spec-present" | "rubric"`), `:71` requires recording which rule fired, `:95` surfaces it in the CONFIRM batch as an overridable decision, and `security-fleet/SKILL.md:68,88` carries the same field. `fleet-family.md:60` places it on the spine.

What is genuinely missing is **durability**. The committed pipeline-provenance file (`roadmap-fleet/SKILL.md:119`) records the item's issue numbers, the confirmed **route**, the pipeline **stages**, and the **assumptions** — but **not** `routeSignal`. So the distinction exists in the ephemeral CONFIRM surface and is dropped from the only artifact that survives into the PR and into VERIFY. The invisibility is real, but it is a one-field gap in the provenance record, not an absent concept.

### Why this needs a decision record rather than a build item

0103 is **accepted**, and states its own amendment rule: "Superseding it requires a replacement ADR the build-shaped members adopt." Striking a clause from an accepted contract is not a code change.

It is also **load-bearing for a record already awaiting sign-off**. ADR 0127 (`proposed`) names the replacement routing axis as "type labels plus the roadmap shard's kind field", and its migration step 1 commits to "records the kind for roadmap-tracked items in their shards" — a step that silently requires a schema change it does not state. Whichever way this decision goes changes 0127's step 1. The two records are related but not coupled in the fan-out sense: 0127 is already drafted, and this decision constrains how its migration executes rather than determining which options 0127 had.

### The coverage fact that decides it

If tier 2 is struck, roadmap-tracked items must reach a type label some other way. They already do: **297 of 299** shard item rows carry a populated `External-ID` (only 2 are unset), so essentially every roadmap-tracked item resolves to a GH issue that can carry the type label. The shard field is not required for coverage.

## Decision

**Strike ADR 0103's `roadmap kind/type field` clause rather than building the field, and make the resolved signal durable.** Item-type routing resolves metadata-first from the **GH issue type label**; the roadmap shard carries no parallel kind field.

This is a **decision record, not an executed migration**: accepting it authorizes the amendment and changes no behavior on its own.

### 1. The amended resolution rule

ADR 0103 clause 3 and `docs/reference/fleet-family.md:56` are amended to state the mechanism that exists:

1. **Explicit metadata** — a GH issue type label (`bug`/`defect` -> bug; `feature`/`enhancement` -> feature; `documentation` -> feature).
2. **Spec presence** — an approved spec linked (roadmap `spec:` non-null or a `proposal.md`) -> **spec-ready**.
3. **Rubric fallback** — `harness-router`'s scope rubric by judgment, with ambiguity resolving to **feature** (the existing safe default).

The words "or a roadmap shard's kind/type field" are removed. Nothing else in 0103 changes: the three routes, the CONFIRM override, and the route-aware VERIFY artifact table all stand.

### 2. Roadmap-tracked items resolve through their External-ID, not a shard field

A roadmap shard does not store item type. For a roadmap-tracked item the classifier follows the shard's `External-ID` to its GH issue and reads that issue's type label — available for **297 of 299** item rows. Item type has **one** writable home.

### 3. `routeSignal` becomes durable, not just surfaced

The committed pipeline-provenance file (`docs/changes/<slug>/provenance.json`) records **`routeSignal`** alongside the `route` it already carries, so a rubric-derived route is distinguishable from a metadata-resolved one in the artifact that survives into the PR and into VERIFY. This is the half of #2056's third direction that survives measurement, and it is what stops the fallback from degrading invisibly.

### 4. 0127's migration step 1 is corrected in the same motion

ADR 0127's step 1 currently reads "backfills a type label onto the 171 open issues that lack one ... **and records the kind for roadmap-tracked items in their shards**". The second half is struck: the backfill writes **type labels on issues only**. This makes 0127's step executable as written instead of silently depending on a schema change. Of the issues lacking a type label, the large majority carry the `roadmap` label, so they are reached by the issue-label backfill without any shard work.

### Scope boundary

This ADR edits no schema, populates no label, and changes no member SKILL. Amending 0103's clause, amending `fleet-family.md:56`, adding `routeSignal` to the provenance record, and correcting 0127's step 1 are downstream implementation items a human authorizes separately.

### Alternatives Considered

#### Option A — Build tier 2: add `Kind` to the shard item schema and populate it

Add a `Kind` field to the roadmap item model, emit it from `serialize.ts`, parse it in `parse.ts`, register it in `preservation.ts`'s `MODELED_FIELD_KEYS`, extend `preservation.test.ts`, and backfill ~300 shards.

**Rejected on two grounds.**

_It creates a second source of truth for one axis._ With 297/299 shards carrying an External-ID, nearly every roadmap-tracked item would have **both** a shard `Kind` and a GH type label describing the same property, across a tracker boundary that already needs conflict machinery (`sync-engine.ts`, `reconcile.ts`, `tracker/conflict.ts`, `tracker/conflict-body.ts`). Item type would join the set of fields requiring conflict resolution, and the two copies would drift — the exact failure ADR 0103 clause 1 exists to prevent by stating the rubric once.

_The blast radius is real and lands on a guarded invariant._ The change touches the roadmap model, `parse.ts`, `serialize.ts`, `preservation.ts` + its test, `migrate/types.ts`, and the tracker adapters (`github-issues.ts`, `pnyon.ts`, `waypoint-http.ts`) that would have to decide whether the field syncs — roughly twenty files in the roadmap module — plus a ~300-shard backfill, to buy coverage the type label already provides.

**The condition under which A becomes right** is stated honestly in the Consequences: an adopter running file-less or tracker-less, where no GH issue backs a shard.

#### Option C — Accept rubric-only routing and declare the metadata tiers aspirational

Declare that routing is rubric-driven in practice, and require only that a rubric-derived route be reported as such.

**Rejected on its premise.** Rubric-only is not the end state: tier 1 resolves for **42%** of the open backlog today, and ADR 0127's backfill raises that further. Declaring the metadata tier aspirational would document the system as weaker than it measurably is, and would strand 0127's replacement axis — which depends on the type label being a real consumer — without justification. Its **reporting** half is orthogonal and correct, and is adopted here as clause 3 rather than discarded with the rest of the option.

#### Amending 0103 in place rather than by a replacement record

0103's own Reversibility clause requires "a replacement ADR the build-shaped members adopt", and a silent edit to an accepted record would leave no trace of why the clause was struck. This record is that trace; the in-place edits to 0103 and `fleet-family.md` are the downstream implementation item it authorizes.

## Consequences

### Positive

- **An accepted ADR stops describing machinery that does not exist.** 0103 has specified a `roadmap kind` field since 2026-08-26 that `serialize.ts` has never emitted — the failure mode ADRs exist to prevent rather than cause.
- **Item type keeps exactly one writable home.** The GH type label is the single source of truth, avoiding a shard/issue duplicate pair across a tracker boundary that already carries conflict machinery.
- **Unblocks ADR 0127's migration step as written.** 0127's step 1 currently depends on a schema change it does not state; correcting it to "type labels on issues only" makes the step executable and keeps its stated ordering constraint (backfill -> stop the write -> freeze) intact.
- **The rubric fallback stops degrading invisibly.** Recording `routeSignal` in the committed provenance file makes "guessed by rubric" durably distinguishable from "resolved from metadata" in the artifact VERIFY reads — the concern behind #2056 that survives measurement.
- **Costs no member a behaviour change.** Nothing reads a shard kind field today, so striking the clause removes no working path.
- **Small, reversible amendment** — a clause in one ADR, one line of the spine doc, and one field in a provenance record.

### Negative / trade-offs

- **File-less and tracker-less adopters lose tier 1 entirely.** Where a shard has no backing GH issue, item type has no metadata home and routing falls to spec-presence then rubric. This is the honest cost of rejecting Option A, and it is a **portability** cost — harness features ship to adopters whose setup is not this repo's. Mitigation: tier 2 (spec presence) still fires, and the rubric's ambiguity default is `feature`, the safe direction. If an adopter materially depends on file-less routing accuracy, Option A becomes the right call for them and this record should be revisited rather than worked around.
- **58% of the open backlog still has no type label**, so tier 1 does not resolve for the majority _today_. This decision does not fix that by itself — it depends on ADR 0127's backfill actually running. Until it does, the rubric fallback carries most items, and clause 3 is what makes that visible instead of silent.
- **A second record now depends on this one.** 0127 is `proposed` and its step 1 needs the correction in clause 4. If this record is rejected at sign-off, 0127's migration step must be re-drafted rather than left as-is, since it would otherwise commit to a nonexistent field.
- **Following an External-ID to read a label is a lookup, not a field read.** Classification for roadmap-tracked items costs a tracker round-trip (or a cached sync) where a shard field would have been local. At SELECT's scale (a scored batch, once per run) this is affordable, but it is a real added dependency on tracker availability.

### Neutral

- **Nothing is deleted and no data migrates.** No shard changes, no label changes, no issue histories rewritten; the amendment is observable only as corrected prose plus one added provenance field.
- **Reversibility is high.** Re-adding the shard field later is the Option A work, unblocked by anything here; superseding this record requires a replacement ADR, not a code change.
- The corpus counts are a **draft-time snapshot** (295 open issues, 299 shard rows at `738b296c0`) and will drift. They are evidence for the shape of the distribution, not a durable inventory.

## Assumptions made

Recommended-option defaults taken while drafting, per the family's front-load / park-unforeseen interaction model (ADR 0088). **The human has not settled the direction** — the conductor's brief supplied no answered fork, and #2056 itself states the three directions are "none obviously right". Assumption 1 is therefore the primary sign-off question, not a routine default.

1. **Direction = Option B (strike the clause), plus the reporting half of Option C.** Taken as the recommended default because the coverage measurement (297/299 External-IDs) showed the shard field buys no coverage the type label lacks, while `preservation.ts`'s guarded round-trip invariant showed Option A's cost is real. A human may choose Option A at sign-off; the condition under which that is right (file-less / tracker-less adopters) is stated in the Consequences rather than buried.
2. **#2056's tier-1 claim is treated as refuted rather than as the issue's framing.** The issue's grep targets `route:*`, which ADR 0103 does not govern; the type-label measurement replaces it. This narrows the decision from "both tiers are dead" to "one tier is absent from the schema".
3. **The `documentation` type label maps to `feature`.** 0103's map names only `bug`/`defect` and `feature`/`enhancement`; `documentation` (14 open issues) is assigned the `feature` route as the safe default rather than left unmapped. A human may prefer it stay unmapped and fall to the rubric.
4. **0127's step-1 correction is stated here rather than by editing 0127.** 0127 is `proposed` and awaiting the same sign-off pass; amending a record another lane drafted, mid-review, would obscure the review. If 0127 is accepted before this record, its step 1 needs the correction applied as part of _this_ record's implementation item.
5. **`routeSignal` is added to the provenance file only**, not to a new artifact or a CI check. The cheapest sufficient mechanism for the stated problem; a stronger gate (VERIFY rejecting rubric-routed items) was not proposed because no evidence shows rubric routing is wrong, only that it is invisible.
6. **The `supersedes` frontmatter field is deliberately left unset.** This record amends one clause of 0103; 0103's three routes, CONFIRM override, and route-aware VERIFY table stand untouched. Marking 0103 superseded would silently retire an accepted contract that remains in force, so the amendment is scoped in prose instead.
7. **Advisor discover/analyse/propose artifacts were kept out of the commit**, per this lane's decision-record-only scope; the durable form of the proposal is the alternatives recorded above.

## References

- Decision-blocked issue: **#2056** (filed by a prior `adr-fleet` lane after VERIFY of ADR 0127 surfaced the tier-2 gap).
- Amends clause 3 of [`0103-fleet-item-type-routing.md`](0103-fleet-item-type-routing.md) — the accepted routing contract, whose Reversibility clause requires a replacement record for exactly this change.
- Corrects migration step 1 of [`0127-retire-route-fleet-label-family.md`](0127-retire-route-fleet-label-family.md) (`proposed`), which names the shard kind field as one leg of its replacement axis.
- Family policy: [`0088-front-load-park-unforeseen-interaction-model.md`](0088-front-load-park-unforeseen-interaction-model.md).
- Spine document to amend: `docs/reference/fleet-family.md:54-58` (§Item-type routing, classification rule) and `:60` (spine placement of `routeSignal`).
- Schema evidence: `packages/core/src/roadmap/serialize.ts:110-134` (emitted field set), `packages/core/src/roadmap/preservation.ts` (`MODELED_FIELD_KEYS`, the #839 monolith write-preservation guard).
- Provenance record to extend: `agents/skills/claude-code/roadmap-fleet/SKILL.md:119`.
- Classifier sites: `agents/skills/claude-code/roadmap-fleet/SKILL.md:61-71,86-87` and `agents/skills/claude-code/security-fleet/SKILL.md:68,88`.
