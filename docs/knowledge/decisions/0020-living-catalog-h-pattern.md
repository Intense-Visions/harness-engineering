---
number: 0020
title: Living catalog with growth infrastructure (the H pattern) for catalog-backed skills
date: 2026-05-23
status: accepted
tier: large
source: docs/changes/design-pipeline/design-craft-elevator/proposal.md
---

## Context

Multiple harness skills in the design-pipeline initiative (and
beyond) depend on a **catalog** — a corpus of structured content
that drives finding generation:

- `harness-design-craft` (sub-project #6) needs **rubrics** (critique
  prompts), **patterns** (polish suggestions with before/after), and
  **exemplars** (curated reference designs to benchmark against).
- `audit-brand-compliance` (sub-project #3) will need **forbidden-
  phrase lists**, **tone matrices**, and **asset-class rules**.
- `audit-component-anatomy` (sub-project #2) needs **anatomy
  contracts** per component type.
- Future skills (copy-craft, accessibility-narrative, motion-
  language) will need analogous catalogs.

A catalog-backed skill faces a structural problem that rule-based and
schema-only skills do not: **the catalog rots**. Specifically:

1. **Curator bottleneck.** If a single person or small team owns
   catalog additions, growth halts when that person's attention
   shifts. Many published design libraries have shipped 30-50 entries
   then stalled because nobody else could contribute.
2. **Signal disconnect.** Catalogs authored top-down ("we think
   these 30 patterns matter") miss patterns that operational signal
   reveals matter ("this same finding recurs in 12 audits"). Top-down-
   only catalogs systematically underweight the patterns reviewers
   actually need.
3. **No measurement, no pruning.** Catalog entries that never trigger
   findings, never get cited, and never inform a fix are dead weight.
   Without per-entry usage counters, dead weight accumulates
   indefinitely.
4. **No versioning, no deprecation path.** When a pattern is
   superseded (e.g. spring physics replacing cubic-bezier as the
   default motion recommendation), without status fields and a
   deprecation lane, old entries either get hard-deleted (breaking
   citations in historical reports) or silently linger (creating
   contradictions).
5. **No contribution gate.** Without a contribution schema + review
   process, drive-by additions degrade catalog quality — incomplete
   entries, missing sources, conflicting recommendations.

Prior art reinforces the diagnosis:

- **ARIA Authoring Practices Guide (APG)** (REFERENCES #8) — succeeds
  because of WG-managed contribution process + versioning + signal
  via WAI bug tracker. Catalog quality stays high because every entry
  is gated.
- **MDN** — succeeds because of community contribution + editorial
  review + per-page usage metrics. Stalls would be visible.
- **awesome-\*** lists — succeed (when they do) because of explicit
  contribution guidelines + maintainer review + curated removal of
  dead entries.
- **getdesign.md** (REFERENCES #37) — 50+ analyses curated by a
  single person; growth visibly stalled at ~50.
- **pbakaus/impeccable** (REFERENCES #2) — ships 29 deterministic
  rules; growth visibly stalled, no contribution process.
- **VoltAgent/awesome-design-md** (REFERENCES #1) — 68 systems,
  community-PR driven, growing because contribution is one PR.

The shared property of catalogs that grow without curator-burnout is
**seed + growth infrastructure**: ship a curated seed corpus AND ship
the contribution format, review process, signal feedback loop,
measurement scaffolding, and versioning lanes from day 1.

Six approaches were considered (the design-craft-elevator brainstorm
labeled them A-H):

- **A. Ship rubrics only (no patterns, no exemplars).** Reject —
  fails the elevation-not-just-detection requirement.
- **B. Ship patterns only.** Reject — no critique vocabulary, no
  benchmarking.
- **C. Fixed 30-pattern catalog, no growth.** Reject — pre-mature
  death cataloged in prior art (getdesign.md, impeccable).
- **D. 100+ patterns shipped at v1.** Reject — curator-author
  bottleneck moved earlier; quality drops trying to hit volume.
- **E. Seed of 10+15+50, no growth infra.** Reject — same fate as C
  on a 12-month horizon.
- **F. Growth infra only, no seed.** Reject — nothing user-facing at
  v1; no signal to drive growth without initial usage.
- **G. Seed AND growth, growth optional.** Reject — "optional" means
  "skipped"; growth must be built in.
- **H. Seed + growth infrastructure as a single deliverable.** Ship
  curated seed (10 rubrics + 15 patterns + 50 exemplars) AND the
  contribution format, review process, signal feedback loop, usage
  measurement, and versioning/deprecation lanes as parts of v1.
  Selected.

## Decision

We adopt **Option H**: catalog-backed skills MUST ship as
**seed + growth infrastructure** in a single coordinated v1.
The pattern has six required components, all of which are
infrastructure-level (not content-level) and therefore reusable
across catalog-backed skills.

`harness-design-craft` is the first instance. Future catalog-backed
skills (`audit-brand-compliance` #3 is the next confirmed candidate)
MUST follow this pattern unless they file a superseding ADR for
their domain.

### Component 1 — Curated seed catalog

A first-version corpus, hand-authored and peer-reviewed, sized to
make the skill immediately useful without overspending curator
attention.

For `harness-design-craft`: 10 critique rubrics + 15 polish patterns

- 50 exemplars (the "H seed"). Sized so:

* Each rubric covers one named craft dimension (hierarchy clarity,
  typography craft, motion quality, color confidence, density
  rhythm, restraint, polish details, copy voice, interaction craft,
  brand coherence).
* Each pattern is wired end-to-end (when-detected → suggested
  before/after).
* Each exemplar carries radar reference scores and a citation
  rationale (`whyExemplar`).

Future catalog-backed skills MUST document their seed shape in their
spec and justify the seed size relative to their domain (too small
= not useful; too large = curator-author bottleneck).

### Component 2 — Contribution format (schema-validated)

Every catalog entry conforms to a schema enforced at PR time.
Required fields for ALL entries:

```yaml
id: <kebab-case unique id>
version: 1                  # incremented on substantive change
status: stable | draft | deprecated
authoredAt: YYYY-MM-DD
contributors: [@handle, ...]
source: { ref: <citation key>, url: <canonical url> }
```

Type-specific fields:

- **Rubrics:** `name`, `appliesTo`, `prompt`, `positiveExample`,
  `negativeExample`, `findingTemplate { code, tier, impact }`.
- **Patterns:** `name`, `applicableTo[]`, `when`, `suggest`,
  `before`, `after`, `findingTemplate { code, tier, impact }`.
- **Exemplars:** `name`, `componentType`, `url`, `addedAt`,
  `addedBy`, `critique`, `whyExemplar`, `radarReference` (5-dim
  scores), `citationCount` (starts at 0, incremented on use).

The schema MUST be exposed as a validator (`contribution/schema.ts`)
that PR CI calls automatically. Entries failing validation MUST be
rejected at PR time with actionable error messages, not merged-and-
fixed-later.

### Component 3 — Review process (documented + enforced)

Catalog additions are reviewed against a documented checklist before
merge. The review checklist MUST cover:

- Schema conformance (automatic — see Component 2).
- Source provenance — is the `source` citation real and authoritative?
- Duplicate detection — does this entry overlap an existing one? If
  yes, refine the existing entry instead.
- Quality threshold — does the entry meet the standard set by the
  seed corpus? (Subjective; reviewer discretion.)
- Status appropriateness — should this enter as `draft` (rookie /
  unproven) or `stable` (vetted)?

For `harness-design-craft`, this checklist lives at
`docs/changes/design-pipeline/design-craft-elevator/contribution.md`.
Future catalog-backed skills MUST publish an analogous review
checklist in their spec directory.

### Component 4 — Signal feedback loop (operational → catalog)

The skill MUST aggregate findings across audits and surface
**recurring finding-shapes** as candidate catalog additions.

For `harness-design-craft`:
`contribution/signal.ts` watches CRITIQUE findings. When the same
finding-shape (rubric × target-pattern × tier) recurs N≥5 times
across distinct projects/components, it exports a candidate pattern
proposal to `.harness/design-craft/proposals/` for human review. The
proposal carries:

- Finding-shape signature
- Recurrence count + sample projects
- Suggested catalog entry skeleton (rubric or pattern)
- Provenance: which audits/runIds contributed to the recurrence
  signal

The proposal flows into the same review process (Component 3) as
hand-authored additions, but with operational-signal provenance
attached. This is the mechanism that breaks the curator bottleneck:
the catalog grows from what reviewers actually keep flagging, not
from a single person's hypothesis about what matters.

Threshold (N=5) is configurable per skill via
`harness.config.json.<skill>.signal.proposalThreshold`.

### Component 5 — Usage measurement

Every catalog entry carries a per-use counter:

- **Rubrics:** per-rubric trigger count (how many audits invoked it).
- **Patterns:** per-pattern apply count (how many findings cited it).
- **Exemplars:** per-exemplar cite count (how many BENCHMARK scores
  cited it).

Counters are exposed via a stable export (for `harness-design-craft`:
`getCatalogStats(): { rubrics, patterns, exemplars }` with per-entry
breakdowns) and surfaced to the dashboard. Dead entries (zero usage
over a documented window — for design-craft, 6 months) are flagged
for deprecation review.

### Component 6 — Versioning and deprecation lane

Every entry's `version: number` is incremented on substantive
change. Every entry's `status` field carries one of `stable | draft
| deprecated`:

- **`stable`** — vetted, in active use, included in default catalog
  loads.
- **`draft`** — proposed, under review, included only when explicit
  config opts in (`catalog.includeDraft: true`).
- **`deprecated`** — superseded or proven harmful, retained for
  historical citation resolution but excluded from default catalog
  loads. Deprecation carries a `deprecatedAt: YYYY-MM-DD` and a
  `replacedBy: <id>` pointing forward when applicable.

Citations in historical reports MUST resolve even when the cited
entry is deprecated (the report shows the entry as-of report
authoring, with a "deprecated since" annotation). This is required
for the convergence verifier (sub-project #4) to compare findings
across runs without false fixpoints.

### What the pattern does NOT mandate

- The seed size — that is domain-specific. The pattern requires
  _justifying_ the seed size in the spec.
- The catalog file layout — YAML, JSON, or hybrid is the skill's
  choice. The contribution validator enforces the schema regardless.
- The signal threshold N — defaults to 5 for design-craft but is
  configurable per skill.
- The dashboard rendering of catalog stats — skills may surface
  per-entry breakdowns, aggregate counters, or both.

## Consequences

**Positive:**

- Catalog-backed skills inherit a vetted growth model from day 1
  rather than re-debating contribution + signal + measurement +
  versioning each time.
- The seed-plus-infrastructure shape means the catalog is useful
  immediately (seed) AND grows without curator bottleneck (infra).
  This is the property prior-art catalogs that stalled (getdesign.md,
  impeccable) lacked.
- Signal feedback loop closes the operational/catalog gap — the
  catalog reflects what reviewers actually flag, not just what the
  initial curator hypothesized.
- Usage measurement enables data-driven pruning. The 12-month-out
  catalog is not just bigger but better, because dead entries get
  flagged for review.
- Versioning + deprecation lane preserves historical citations
  (required for verifier fixpoint) while keeping the active catalog
  clean.
- Operators can answer "how is our catalog growing?" via a single
  dashboard view rather than per-skill bespoke instrumentation.

**Negative:**

- The pattern raises the v1 bar for catalog-backed skills.
  Contribution validator + review checklist + signal aggregator +
  measurement counters + versioning lane is real infrastructure to
  build and maintain. Skills with very small catalogs (<10 total
  entries) MAY be over-served by the full pattern; those skills SHOULD
  file a superseding ADR proposing a lighter shape rather than
  silently omitting components.
- Review-process discipline is a maintainer obligation that must be
  honored or the contribution gate becomes ceremonial. The pattern
  cannot enforce reviewer rigor; it can only structure it.
- Signal-driven proposals add a content lane that maintainers must
  triage. If proposal volume swamps reviewer attention, the threshold
  N or the export cadence must be tuned.
- The deprecation lane creates a long-tail of entries that must
  resolve in citations forever (or until a hard schema break with
  documented migration). This is the price of historical-citation
  fidelity.

**Reversibility:**

- Superseding this ADR requires a replacement that addresses how
  existing catalog entries (`harness-design-craft` rubrics/patterns/
  exemplars, future skills' catalogs) migrate to the new shape.
- Individual components MAY be revised independently (e.g. signal
  threshold tuning, deprecation-window length) without superseding
  the ADR. Substantive shape changes (dropping a component, adding
  a new required component) require a new ADR.

## Long-term trajectory (informative)

For `harness-design-craft` specifically, the seed-plus-growth model
targets:

- **v1 (week 4):** 10 rubrics + 15 patterns + 50 exemplars (the H
  seed).
- **6 months:** ~15 rubrics + 35 patterns + 150 exemplars (signal-
  driven pattern additions dominate; exemplars grow via
  community PRs).
- **12-24 months:** 20 rubrics + 75 patterns + 400 exemplars
  (rubrics plateau as the craft dimensions stabilize; patterns and
  exemplars continue to grow with usage signal + community
  contribution).

These numbers are projections, not commitments. They are documented
in detail in `docs/changes/design-pipeline/design-craft-elevator/
growth-trajectory.md`.

## Alternatives Considered

- **C. Fixed 30-pattern catalog, no growth:** rejected — prior-art
  stall pattern (getdesign.md ~50, impeccable ~29).
- **D. 100+ patterns shipped at v1:** rejected — curator-author
  bottleneck moved earlier; v1 quality drops trying to hit volume.
- **E. Seed only, no growth infra:** rejected — same fate as C on
  12-month horizon.
- **F. Growth infra only, no seed:** rejected — nothing user-facing
  at v1; no signal to drive growth without initial usage.
- **G. Seed plus growth, growth optional:** rejected — "optional"
  means "skipped"; growth must be built in.

## References

- First instance: `docs/changes/design-pipeline/design-craft-elevator/
proposal.md` §"Catalog entry formats", §"Contribution and growth
  infrastructure", §"Success Criteria — Catalog".
- Companion documents:
  - `docs/changes/design-pipeline/design-craft-elevator/
contribution.md` — contribution format + review process spec.
  - `docs/changes/design-pipeline/design-craft-elevator/
growth-trajectory.md` — long-term catalog growth model + signal
    feedback loop mechanics.
- Parent pattern: `0018-llm-judgment-skill-pattern.md` (catalog
  citations populate `cite` block on 3-axis findings).
- Companion ADRs: `0019-3-axis-craft-output-model.md` (catalog
  entries carry `findingTemplate` shaped to 3-axis),
  `0021-detect-and-offer-b-prime-pattern.md` (catalog quality is most
  impactful when AestheticIntent is declared — soft-dependency).
- Prior art:
  - REFERENCES.md #8 (ARIA APG) — gated contribution model.
  - REFERENCES.md #1 (awesome-design-md) — community-PR-driven
    growth.
  - REFERENCES.md #2 (pbakaus/impeccable) — fixed catalog stall
    pattern (negative example).
  - REFERENCES.md #37 (getdesign.md) — single-curator stall pattern
    (negative example).
- Related: `0016-skill-proposal-workflow.md` (parallel signal-to-
  promotion lane for skill catalog, demonstrating the pattern at the
  skill-corpus level).
