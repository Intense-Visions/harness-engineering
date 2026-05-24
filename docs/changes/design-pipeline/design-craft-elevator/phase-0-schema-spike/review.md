# Phase 0 Schema-Fit Review

> Sprint 0 deliverable: review pass over the 9 paper catalog entries +
> 1 benchmark specimen (10 artifacts total) against the proposed
> rubric/pattern/exemplar/BenchmarkScore schemas in the spec
> (lines 128–286).
>
> **Question:** Do the schemas accept all 10 paper artifacts with no
> ambiguity? Is any field over-constrained for future entries? Is any
> field under-constrained (allows incoherent data)?
>
> **Decision rule per Phase 0 exit criterion:** if any _blocking_
> ambiguity surfaces, Phase 0 stops and the schemas are revised before
> Phase 1A begins. _Non-blocking_ observations are recorded as
> Phase 1 follow-ups.

---

## Summary

| Artifact                                       | Schema         | Accepted?          | Blocking issue?         |
| ---------------------------------------------- | -------------- | ------------------ | ----------------------- |
| `rubrics/hierarchy-clarity.md`                 | rubric         | Yes                | No                      |
| `rubrics/typography-craft.md`                  | rubric         | Yes                | No                      |
| `rubrics/motion-quality.md`                    | rubric         | Yes                | No                      |
| `patterns/spring-physics-microinteraction.md`  | pattern        | Yes                | No                      |
| `patterns/skeleton-content-matched.md`         | pattern        | Yes                | No                      |
| `patterns/stagger-timing.md`                   | pattern        | Yes                | No                      |
| `exemplars/linear-empty-list.md`               | exemplar       | Yes (with caveat)  | No (Observation O3)     |
| `exemplars/stripe-loading-state.md`            | exemplar       | Yes                | No                      |
| `exemplars/raycast-command-palette.md`         | exemplar       | Yes (with caveat)  | No (Observation O4)     |
| `benchmark-specimens/empty-state-vs-linear.md` | BenchmarkScore | Yes (with caveats) | No (Observations O5–O8) |

**Verdict:** All 10 artifacts are accepted by the proposed schemas
without blocking ambiguity. Eight non-blocking observations are
recorded below as Phase 1 follow-ups. **No Phase 0 stop-condition
triggered. Schemas are locked for Phase 1.**

---

## Observations (non-blocking, tracked for Phase 1)

### O1 — `source.url` should be documented as optional

**Where surfaced:** all three rubrics, all three patterns.

**Issue:** The spec example (line 213) shows `source: { ref, url }`
with both fields present. The motion-quality and typography-craft
rubrics synthesize craft principles from sources where a single URL
does not exist (or is one of many). Schema should mark `url`
optional, `ref` required.

**Adjustment:** None to Phase 0 artifacts. Phase 1 catalog-entry
schema (Task 3 of plan) marks `url` as optional.

### O2 — `applicableTo.kind` must remain an open-ended string

**Where surfaced:** all three patterns.

**Issue:** The three Phase 0 patterns use five distinct `kind` values
(`jsx-attribute`, `css-property`, `component-name`, `jsx-text`,
`jsx-pattern`, `css-selector`, `animation-property`). The catalog
will grow many more. Schema must NOT enumerate `kind` — must allow
arbitrary strings (validated downstream by the pattern matcher, not
the schema).

**Adjustment:** None to Phase 0 artifacts. Phase 1 catalog-entry
schema codifies `kind` as `string` (no enum).

### O3 — Exemplar shape uses `addedBy` while rubric/pattern shapes use `contributors`

**Where surfaced:** `linear-empty-list.md`.

**Issue:** Spec line 269 shows `addedBy: @chadjw` on exemplars. The
rubric and pattern shapes use `contributors: [@chadjw]` (array). The
Phase 0 exemplars include both `addedBy` and `contributors` to
preserve forward-compat.

**Adjustment:** Phase 1 catalog-entry schema should standardize on
`contributors: string[]` for all three kinds. `addedBy` may remain as
an exemplar-specific alias (back-compat) or be removed. Decision
deferred to Phase 1 Task 4 author.

### O4 — `componentType` must remain an open-ended string

**Where surfaced:** `raycast-command-palette.md` (uses
`componentType: CommandPalette`, which is outside the v1 seed list
of EmptyState / LoadingState / ErrorState / Modal / Button per spec
line 458).

**Issue:** If the schema enums `componentType` to the v1 seed list,
the catalog cannot grow to additional component types without
schema revisions. Schema must keep `componentType` as a free string.

**Adjustment:** None to Phase 0 artifacts. The Raycast exemplar is
informally retained as a "v2 candidate" — the v1 seed catalog need
not ship it, but the Phase 0 spike demonstrates the schema accepts
it. Phase 1 catalog-entry schema (Task 3) confirms `componentType` is
a free string.

### O5 — `radarReference` (on exemplar) vs `radar.*` (on BenchmarkScore) asymmetry

**Where surfaced:** all three exemplars and the benchmark specimen.

**Issue:** The exemplar's `radarReference` carries bare integer scores
per dimension (e.g., `hierarchy: 95`). The `BenchmarkScore.radar`
carries a nested `{ score, confidence, notes }` object per dimension.
This asymmetry is correct (exemplars are calibration references and
do not carry confidence/notes; scores reflect curator judgment) but
the schema must encode the distinction explicitly: `radarReference`
is `Record<DimensionName, number>` while `radar` is
`Record<DimensionName, { score, confidence, notes }>`.

**Adjustment:** None to Phase 0 artifacts. Phase 1 catalog-entry
schema (Task 3) and TypeScript schema (Task 8) encode both shapes
explicitly with distinct types.

### O6 — `BenchmarkScore.overall.score` aggregation rule unspecified

**Where surfaced:** `benchmark-specimens/empty-state-vs-linear.md`.

**Issue:** Spec line 159 says "weighted aggregate" but does not name
weights. Without a stable weighting rule, two runs over the same
component could produce different `overall` scores, breaking
fixpoint detection (success criterion #34).

**Adjustment:** None to Phase 0 artifacts. Phase 1 must select and
document a weighting rule before BENCHMARK phase ships. Recommended
starting point: equal weights (mean) with a config knob to override.
Tracked as Phase 1 Task 17 dependency.

### O7 — `BenchmarkScore.overall.confidence` aggregation rule unspecified

**Where surfaced:** `benchmark-specimens/empty-state-vs-linear.md`.

**Issue:** Same shape as O6: how is overall confidence derived from
five per-dimension confidences? Min? Mode? Weighted?

**Adjustment:** None to Phase 0 artifacts. Phase 1 must select a
rule. Recommended: `min` (overall confidence is the weakest
per-dimension confidence) — conservative, easy to reason about.
Tracked as Phase 1 Task 17 dependency.

### O8 — `gaps` is `string[]`; could be more structured to route into POLISH

**Where surfaced:** `benchmark-specimens/empty-state-vs-linear.md`.

**Issue:** The five gaps in the specimen each have an obvious
candidate pattern from the POLISH catalog (e.g., the secondary-CTA
gap maps to a "restraint" pattern; the hierarchy gap maps to a
"weight + color separation" pattern). Today's `string[]` schema
loses this structure.

**Adjustment:** None to Phase 0 artifacts. Phase 1 may evolve to
`gaps: Array<{ summary, impact?, recommendedPatternId? }>`. The
string[] shape is forward-compatible if the strings remain readable
to humans. Tracked as Phase 1 Task 17 / Phase 2A Task 39
enhancement.

---

## Cross-cutting confirmations (no adjustment needed)

- The 3-axis output model (tier × impact × confidence) cleanly
  accommodates all three rubric `findingTemplate` shapes and all
  three pattern `findingTemplate` shapes. No tier × impact pairs were
  rejected; no field was missing.
- The 5-dim radar accommodates the worked benchmark specimen with
  per-dimension narrative + confidence. The schema's structure
  matches what an LLM-judgment call can plausibly populate
  deterministically across runs.
- All three exemplars are link-based with critique notes (no
  screenshots), confirming the v1 spec choice (proposal line 460,
  spec section "Catalog entry formats" exemplar example at line 261)
  is sufficient for schema validation in Phase 0.
- `findingTemplate.code` follows `CRAFT-(C|P)\d{3}` for rubrics and
  patterns. BENCHMARK does not assign per-finding codes (it produces
  scores, not findings) — confirmed by the specimen having no `code`
  field on its top-level shape.

---

## Phase 0 exit decision

**EXIT CRITERION MET.** Schemas accept all 10 paper artifacts. Eight
non-blocking observations recorded as Phase 1 follow-ups (mostly
codifying decisions in the JSON Schema and TypeScript Zod schema
authored in Phase 1 Tasks 1–8). **No schema gap rises to a Phase 0
stop-condition trigger. Schemas are locked for Phase 1.**

Phase 1A may proceed at the APPROVE_PLAN gate.
