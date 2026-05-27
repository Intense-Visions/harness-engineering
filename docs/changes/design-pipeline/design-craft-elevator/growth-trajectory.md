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
proposal][proposal] Implementation Order. The minimum viable form
of both mechanisms now ships:
[measurement/usage.ts](../../../../packages/cli/src/design-craft/measurement/usage.ts)
and
[measurement/signal.ts](../../../../packages/cli/src/design-craft/measurement/signal.ts)
are wired into `runPipeline` in
[mcp/tools/design-craft.ts](../../../../packages/cli/src/mcp/tools/design-craft.ts).

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
[`packages/cli/src/design-craft/measurement/signal.ts`](../../../../packages/cli/src/design-craft/measurement/signal.ts)
(shipped). The CLI-co-located path (not the `skills/`-nested path
sketched earlier) reflects the co-location decision recorded in the
proposal § "Technical Design → File layout".

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

Each CRITIQUE finding is reduced to a **fingerprint** for recurrence
detection. The fingerprint is a SHA-1 hash (truncated to 16 hex chars)
of the tuple:

```
(code, tier, cite.rubricOrPatternId)
```

where:

- `code` — the stable `CRAFT-(C|P)\d{3}` namespace code that the
  rubric or pattern emits.
- `tier` — the finding's tier (foundational | polish | aspirational
  per [ADR-0019][adr-0019]). Tier participates because the same
  `code` can fire at different tiers across components, and merging
  them would mask a real pattern that is consistently foundational.
- `cite.rubricOrPatternId` — the rubric or pattern id that produced
  the finding (e.g. `rubric-hierarchy-clarity`).

This tuple intentionally omits the target file/component identity:
two findings of the same shape from different files collide on the
same fingerprint, which is exactly what we want for recurrence
detection. v1 does NOT collapse on AST-normalized target shape —
that's a future refinement.

Two findings with the same fingerprint are counted as the same
recurrence even if they came from different audits, projects, or
runIds.

### Event log

v1 ships an append-only JSONL event log rather than an aggregated
counter store. Each CRITIQUE / POLISH finding emits one event:

```ts
interface SignalEvent {
  fingerprint: string; // 16-char hash of (code, tier, cite id)
  projectRoot: string;
  recordedAt: string; // ISO timestamp
  finding: {
    code: string;
    tier: 'foundational' | 'polish' | 'aspirational';
    impact: 'small' | 'medium' | 'large';
    rubricOrPatternId: string;
    messageSample: string; // first 240 chars
  };
}
```

Events are appended to `.harness/design-craft/signal-events.jsonl`
(per-project, gitignored by default). The JSONL append model means
every CRITIQUE run pays O(1) write cost per finding regardless of
prior log depth, and the aggregation pass below stays out of the
hot critique path.

Opt-in pseudonymized telemetry aggregates across projects is a
future feature, NOT v1.

### Threshold + export

`proposeFromRecurringFindings(threshold, storeRoot?)` is the entry
point that scans the event log and materialises proposals. When a
fingerprint:

- has been recorded ≥ threshold times (default N=5, configurable via
  `harness.config.json.design.craft.signal.proposalThreshold`), AND
- was recorded from ≥ 2 distinct projects (the multi-project guard
  rail — single-project pathologies must not generate proposals)

the function writes a candidate proposal YAML to
`.harness/design-craft/proposals/<fingerprint>.yaml`. The proposal
carries:

- `fingerprint` (the 16-char hash from the signature above).
- `occurrenceCount` and `distinctProjectCount`.
- `distinctProjects` (sorted list of project roots).
- `representative` — the most recent finding snapshot (code, tier,
  impact, cite id, message sample) for narrative context.
- `kind: proposal` + `status: proposed` (consumed by maintainer
  review per [contribution.md](./contribution.md)).
- `proposedAt` ISO timestamp.

Re-running the function rewrites the proposal in place with refreshed
counts, so the proposal file is always a live snapshot of the
current event log.

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
gaps need filling. Implementation lives in
[`packages/cli/src/design-craft/measurement/usage.ts`](../../../../packages/cli/src/design-craft/measurement/usage.ts)
(shipped). The barrel
[`packages/cli/src/design-craft/measurement/index.ts`](../../../../packages/cli/src/design-craft/measurement/index.ts)
is the stable public surface — dashboards and the design-pipeline
orchestrator import from there.

### Counters

v1 ships a single counter per (type, id) tuple. Refined counters
(invocation-vs-trigger, applicability-vs-apply, comparison-vs-cite)
are a follow-up — the per-run wiring sites already exist, so
extending the schema additively does not break readers.

| Type     | Counter           | Increment trigger                                                                                    |
| -------- | ----------------- | ---------------------------------------------------------------------------------------------------- |
| Rubric   | `rubrics[<id>]`   | Incremented once per CRITIQUE invocation of the rubric (`recordTrigger`).                            |
| Pattern  | `patterns[<id>]`  | Incremented once per POLISH finding that the LLM marked `applies: true` (`recordApply`).             |
| Exemplar | `exemplars[<id>]` | Incremented once per exemplar id referenced in a BENCHMARK score's `exemplars` array (`recordCite`). |

Counters are per-entry, persisted in `.harness/design-craft/usage.json`
per project. A `getCatalogStats()` export aggregates them and is the
stable API for dashboards.

### Derived metrics (future, NOT v1)

Once the dual-counter schema lands (invocation-vs-trigger,
applicability-vs-apply, comparison-vs-cite), the dashboard can
surface several derived metrics:

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

v1 ships the single counter per (type, id); derived metrics land
when the second counter family is wired in (proposal-and-PR work,
not blocking this slice).

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
