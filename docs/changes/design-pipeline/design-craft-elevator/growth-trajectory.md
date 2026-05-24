# harness-design-craft Catalog Growth Trajectory

> Long-term model for how the `harness-design-craft` catalog evolves
> from its v1 H-seed (10 rubrics + 15 polish patterns + 50 exemplars)
> to a mature corpus (20 + 75 + 400) over 12–24 months, without
> curator-bottleneck stall. Maps to [ADR-0020][adr-0020] (Living
> catalog with growth infrastructure — the H pattern) and is the
> companion document to [contribution.md](./contribution.md).

**Status:** Projection + mechanics spec. Numbers in this document are
targets, not commitments. The mechanisms described (signal feedback
loop, measurement schema) are deliverables of Sprint 3 (Convergence +
Growth Infrastructure) per the [design-craft-elevator
proposal][proposal] Implementation Order.

---

## Why a growth model at all

Catalogs that ship a fixed corpus and stop investing in growth rot.
The prior-art evidence from [REFERENCES.md][refs] is consistent:

- **getdesign.md** (REFERENCES #37) — stalled at ~50 brand analyses
  under single-curator load.
- **pbakaus/impeccable** (REFERENCES #2) — stalled at 29 deterministic
  rules; no contribution lane.
- **VoltAgent/awesome-design-md** (REFERENCES #1) — 68 systems and
  still growing because contribution is one PR.
- **ARIA APG** (REFERENCES #8) — sustained growth over years because
  of WG-managed contribution gate + versioning + signal via WAI bug
  tracker.

The H seed gets `harness-design-craft` to "immediately useful." The
growth infrastructure gets it to "still useful in 24 months." This
document is the operational plan for how growth actually happens.

---

## Targets

### v1 (week 4) — The H seed

| Type      | Count | Composition                                                                                                                                                      |
| --------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rubrics   | 10    | hierarchy clarity, typography craft, motion quality, color confidence, density rhythm, restraint, polish details, copy voice, interaction craft, brand coherence |
| Patterns  | 15    | 3 motion, 3 skeleton, 3 typography, 3 interaction, 3 layout                                                                                                      |
| Exemplars | 50    | 5 component types × 10 exemplars (EmptyState, LoadingState, ErrorState, Modal, Button)                                                                           |

These are the v1 ship targets per the [proposal Success
Criteria][proposal-success]. Sized so that:

- Every rubric covers a distinct named craft dimension (no overlap,
  no gap in the v1 dimension set).
- Every pattern is wired end-to-end (deterministic match-shape
  detection → LLM-judgment suggestion → before/after).
- Every exemplar has radar-reference scores and an authored
  citation rationale.

### 6 months — Signal-driven expansion

| Type      | Count | Growth pattern                                                                                                                                                                                                                                              |
| --------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rubrics   | ~15   | +5 from operational gaps (e.g. "form layout craft" surfaces as a recurring gap in audits) and from cross-domain extension (e.g. brand-voice-leaning rubric added when audit-brand-compliance #3 ships and the surface area suggests sharing infrastructure) |
| Patterns  | ~35   | +20 dominated by signal-driven additions: CRITIQUE finding-shapes recurring N≥5 times are exported as candidate patterns and triaged into PRs                                                                                                               |
| Exemplars | ~150  | +100 dominated by community PRs; coverage extends to new component types (Form, Table, Toast, Toolbar) as exemplars are contributed                                                                                                                         |

The 6-month profile is where the signal feedback loop and community
contribution lane start to dominate over hand-authored seed
expansion. Curator-author bandwidth is conserved for review and
triage rather than first-draft authoring.

### 12–24 months — Mature corpus

| Type      | Count | Growth pattern                                                                                                                                                                                          |
| --------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rubrics   | ~20   | Plateau. The named craft dimensions stabilize; further additions require evidence of a distinct dimension not covered by existing rubrics. Net adds = ~5 over 12 months.                                |
| Patterns  | ~75   | Continuing growth from signal + community. Net adds = ~40 over 12 months. Some early patterns deprecated in favor of refinements (e.g. spring-physics-v2 replacing spring-physics as research evolves). |
| Exemplars | ~400  | Continuing growth from community contribution + per-component-type expansion. Net adds = ~250 over 12 months as exemplar coverage spans most common UI components.                                      |

The 24-month projection (rubrics 20, patterns 75, exemplars 400)
is the design target for the H pattern's success. Reaching it
without curator burnout is the test of whether the growth
infrastructure actually works.

### What we are NOT projecting

- **Linear growth.** Real growth will be lumpy — bursts after
  conference talks, plateaus during quiet periods, surges when a
  related skill ships (e.g. audit-brand-compliance #3 will likely
  drive a wave of brand-coherence rubric additions).
- **Specific community-contributor counts.** Catalog quality depends
  on who contributes, not how many. The growth model is
  contributor-mix-agnostic.
- **Specific deprecation counts.** Some seed entries will be
  superseded; some signal-driven additions will be retired. The
  net counts above account for typical churn but not extraordinary
  events.

---

## Signal feedback loop mechanics

The signal feedback loop is the mechanism that breaks the
curator bottleneck. It turns CRITIQUE operational signal into
candidate catalog additions automatically. Implementation lives in
`packages/cli/src/skills/harness-design-craft/contribution/
signal.ts` (Sprint 3 deliverable).

### Pipeline

```
CRITIQUE finding  →  finding-shape signature  →  aggregator
                                                      ↓
                                          recurrence counter
                                                      ↓
                                    threshold (N≥5) crossed?
                                                      ↓
                                    candidate proposal exported
                                                      ↓
                                .harness/design-craft/proposals/
                                                      ↓
                                    maintainer triages → PR
                                                      ↓
                            same review process as hand-authored
```

### Finding-shape signature

Each CRITIQUE finding is reduced to a **signature** for recurrence
detection. The signature is a tuple:

```
(rubricId, targetPatternKey, tier)
```

where:

- `rubricId` — the rubric that produced the finding.
- `targetPatternKey` — a normalized form of the target (e.g. the
  AST shape of the offending JSX/CSS, OR the component-type
  identifier, OR the file-pattern bucket). Computed by
  `signal.normalizeTarget(finding.target)`. The normalization is
  deliberately coarse — we want different files exhibiting the
  same shape to collide, not be distinct.
- `tier` — the finding's tier (foundational | polish | aspirational
  per [ADR-0019][adr-0019]).

Two findings with the same signature are counted as the same
recurrence even if they came from different audits, projects, or
runIds.

### Recurrence counter

The aggregator maintains a counter per signature:

```ts
type SignatureCounter = {
  signature: string; // serialized (rubricId, targetPatternKey, tier)
  count: number;
  firstSeen: string; // ISO date
  lastSeen: string; // ISO date
  contributingRuns: string[]; // runIds, capped at 100 for storage
  contributingProjects: string[]; // anonymized project keys
};
```

The counter is persisted to `.harness/design-craft/signals.json`
(per-project, gitignored by default; opt-in pseudonymized telemetry
aggregates across projects is a future feature, NOT v1).

### Threshold + export

When `count` crosses the threshold (default N=5, configurable via
`harness.config.json.design.craft.signal.proposalThreshold`), the
aggregator exports a candidate proposal to
`.harness/design-craft/proposals/<signature-hash>.yaml`. The
proposal carries:

- The signature (rubricId, targetPatternKey, tier).
- The recurrence count + window (first-seen / last-seen).
- The contributing runIds and anonymized project keys (capped).
- A **suggested catalog entry skeleton** — typically a pattern
  skeleton if the signature is polish/aspirational, or a rubric-
  refinement skeleton if the signature suggests an existing rubric
  is firing on adjacent but distinct phenomena.
- Provenance metadata: `originatedFromSignal: true`,
  `signatureHash: <hash>`.

### Triage to PR

A maintainer reviews the proposal:

- **Promote to PR.** The skeleton becomes a draft catalog entry
  PR; maintainer fills in prompt / before/after / source / quality
  fields. Same review process as hand-authored (see
  [contribution.md](./contribution.md)).
- **Defer.** The signature is real but doesn't warrant a new
  catalog entry (e.g. it's already covered by an existing pattern;
  the recurrence is a fluke of the audited project set). Mark the
  proposal as `deferred` and the aggregator stops re-exporting at
  the same count.
- **Reject.** The signature is noise (e.g. a rubric prompt that
  over-fires). The rejection triggers a review of the upstream
  rubric — likely a rubric refinement PR.

### Why N=5

Five is small enough to surface real signal within a reasonable
window (a few weeks of usage at modest project counts) and large
enough to filter out one-off project-specific quirks. The value
is configurable; v1 ships with 5 and revisits after the first
quarter of operational data.

### Cross-project signal (future, NOT v1)

v1's signal aggregation is per-project. The signature carries
anonymized project keys but does not actually share across
projects. A future telemetry-opt-in feature could aggregate
signatures across opted-in projects, surfacing cross-org
recurrence patterns at much higher signal quality. Out of scope
for v1; documented here so the v1 signature format is
forward-compatible (do not break the signature schema in v1; do
not require project-identifying data in the signature).

---

## Measurement schema

Per-entry usage counters are the data layer that drives growth
decisions: which entries are working, which are dead weight, which
gaps need filling. Implementation lives in `packages/cli/src/skills/
harness-design-craft/measurement/usage.ts` (Sprint 3 deliverable).

### Counters

| Type     | Counter name         | Increment trigger                                                                                                                     |
| -------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Rubric   | `triggerCount`       | Incremented each time a CRITIQUE phase invokes the rubric and the rubric produces ≥1 finding.                                         |
| Rubric   | `invocationCount`    | Incremented each time CRITIQUE invokes the rubric (regardless of whether findings result).                                            |
| Pattern  | `applyCount`         | Incremented each time a POLISH finding cites the pattern.                                                                             |
| Pattern  | `applicabilityCount` | Incremented each time the pattern's deterministic match-shape fires (regardless of whether the LLM ultimately produces a suggestion). |
| Exemplar | `citeCount`          | Incremented each time a BENCHMARK score cites the exemplar (the existing `citationCount` field on the exemplar YAML).                 |
| Exemplar | `comparisonCount`    | Incremented each time the exemplar is loaded into a BENCHMARK comparison set (regardless of whether it's cited in the final output).  |

Counters are per-entry, persisted in `.harness/design-craft/
usage.json` per project. A `getCatalogStats()` export aggregates
them and is the stable API for dashboards.

### Derived metrics

The dashboard surfaces (and the maintainer reviews) several derived
metrics:

- **Hit rate** (rubrics): `triggerCount / invocationCount`. Rubrics
  with very low hit rate (<5% over 100+ invocations) are flagged
  for review — the prompt may be too narrow or the match scope may
  be wrong.
- **Cite rate** (patterns): `applyCount / applicabilityCount`. Low
  cite rate suggests the deterministic match is too coarse (LLM
  rejects most candidates) — refinement opportunity.
- **Exemplar reach**: `citeCount` over a window. Exemplars never
  cited in 180 days are deprecation candidates.
- **Dimension coverage**: cross-rubric metric showing which named
  craft dimensions are covered by ≥1 actively-firing rubric in
  the project's audit history. Gaps suggest rubric authorship
  opportunities.

### Dashboard surfacing

The catalog stats page (Sprint 3 deliverable per proposal
Integration Points) surfaces:

- Top-N most-triggered rubrics (where attention is going).
- Bottom-N least-triggered rubrics (dead-weight candidates).
- Top-N most-applied patterns (what reviewers actually use).
- Top-N most-cited exemplars (which references are doing the
  work).
- Component-type coverage (which component types have ≥10
  exemplars vs which have <3).
- Signal queue depth: count of pending proposals in
  `.harness/design-craft/proposals/`.

### Privacy

All counters are per-project, stored locally. v1 does NOT exfiltrate
usage data. Cross-project aggregation is opt-in telemetry only and
is a future feature, NOT v1.

---

## Mapping to ADR-0020

This document operationalizes the six required components of the
[H pattern in ADR-0020][adr-0020]:

| ADR-0020 component                              | This document's section                                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1. Curated seed catalog                         | "v1 (week 4) — The H seed"                                                                            |
| 2. Contribution format (schema-validated)       | (See [contribution.md](./contribution.md) §"Contribution format" + §"Schema validation requirements") |
| 3. Review process (documented + enforced)       | (See [contribution.md](./contribution.md) §"Review process")                                          |
| 4. Signal feedback loop (operational → catalog) | "Signal feedback loop mechanics"                                                                      |
| 5. Usage measurement                            | "Measurement schema"                                                                                  |
| 6. Versioning and deprecation lane              | (See [contribution.md](./contribution.md) §"Common header" `status` + `version` fields)               |

The two documents (this one and `contribution.md`) together form
the complete H-pattern instantiation for `harness-design-craft`.
Future catalog-backed skills that adopt the H pattern should
publish analogous companion documents in their spec directories.

---

## Long-horizon questions (out of scope for v1)

These are documented here so they are not lost; they are NOT v1
deliverables.

- **Cross-project signal sharing.** Opt-in aggregation of signature
  recurrence across projects would dramatically accelerate growth
  by surfacing patterns no single project sees enough of. Requires
  telemetry opt-in, pseudonymization, and a hosted aggregator
  service.
- **LLM-assisted rubric/pattern drafting.** Once the catalog has
  sufficient seed data, an LLM could propose draft rubrics from
  recurring CRITIQUE prose. v1 keeps drafting human; v3+ may
  introduce assisted drafting with explicit `provenance: llm-
drafted` markers.
- **Versioned catalog releases.** Currently the catalog is a
  rolling head. Tagged releases (`catalog@2026-12`) would let
  projects pin against a known catalog version for reproducibility.
  Worth doing once the convergence verifier (#4) starts depending
  on catalog stability across runs.
- **Catalog forking.** Orgs with house craft preferences may want to
  fork the catalog and add private rubrics/patterns/exemplars. The
  loader already supports per-skill `catalog.path` override; a
  full fork-and-merge model is a follow-up.

---

## References

- [ADR-0018: LLM-judgment-based skill pattern][adr-0018]
- [ADR-0019: 3-axis craft output model][adr-0019]
- [ADR-0020: Living catalog with growth infrastructure (the H
  pattern)][adr-0020] — this document operationalizes ADR-0020's
  Component 4 (signal feedback loop) and Component 5 (usage
  measurement).
- [ADR-0021: Detect-and-offer progressive upgrade pattern (B'
  pattern)][adr-0021]
- [design-craft-elevator proposal][proposal] — see "Contribution
  and growth infrastructure" and "Success Criteria — Catalog".
- [contribution.md](./contribution.md) — companion document
  specifying contribution format + review process.
- [REFERENCES.md][refs] — prior-art catalog references.

[adr-0018]: ../../../knowledge/decisions/0018-llm-judgment-skill-pattern.md
[adr-0019]: ../../../knowledge/decisions/0019-3-axis-craft-output-model.md
[adr-0020]: ../../../knowledge/decisions/0020-living-catalog-h-pattern.md
[adr-0021]: ../../../knowledge/decisions/0021-detect-and-offer-b-prime-pattern.md
[proposal]: ./proposal.md
[proposal-success]: ./proposal.md#success-criteria
[refs]: ../REFERENCES.md
