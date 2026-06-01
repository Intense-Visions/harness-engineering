---
type: business_concept
domain: design
tags: [catalog, growth, contribution, signal-loop, versioning, deprecation, seed, h-pattern]
---

# Living Catalogs (the H Pattern)

A **living catalog** is a corpus of structured content (rubrics, patterns, exemplars, anatomy contracts, forbidden-phrase lists, tone matrices) that drives a skill's finding generation AND grows over time through a deliberate combination of curation and operational signal. The pattern is codified by [ADR 0020](../decisions/0020-living-catalog-h-pattern.md) and labeled "H" after the brainstorm's option labeling: **seed + growth infrastructure as a single coordinated deliverable**. First instance: `harness-design-craft` (10 rubrics + 15 patterns + 50 exemplars + growth infra at v1).

## Why catalogs rot without infrastructure

Catalog-backed skills face a structural problem rule-based skills do not: **the catalog rots.** Prior-art catalogs that shipped without growth infrastructure stalled at 30–50 entries — `pbakaus/impeccable` (29 rules), `getdesign.md` (~50 analyses) — because:

1. **Curator bottleneck** — single-owner growth halts when the owner's attention shifts.
2. **Signal disconnect** — top-down catalogs miss patterns that operational signal reveals matter ("this same finding recurs in 12 audits").
3. **No measurement, no pruning** — dead entries accumulate indefinitely without per-entry usage counters.
4. **No versioning, no deprecation path** — superseded entries either get hard-deleted (breaking historical citations) or silently linger (creating contradictions).
5. **No contribution gate** — drive-by additions degrade quality.

The shared property of catalogs that grow without curator-burnout is **seed + growth infrastructure**: ship a curated seed corpus AND the contribution format, review process, signal loop, measurement scaffolding, and versioning lanes from day 1.

## The six required components

A living catalog has six components, all infrastructure-level (reusable across catalog-backed skills):

### 1. Curated seed catalog

A hand-authored, peer-reviewed first-version corpus sized to make the skill immediately useful without overspending curator attention. For `harness-design-craft`: 10 rubrics + 15 patterns + 50 exemplars — each rubric covers one named craft dimension, each pattern is wired end-to-end (when-detected → before/after), each exemplar carries radar reference scores and a citation rationale.

Future catalog-backed skills MUST document their seed shape in their spec and justify the seed size — too small = not useful, too large = curator-author bottleneck.

### 2. Contribution format (schema-validated)

Every catalog entry conforms to a schema enforced at PR time. Required fields for ALL entries:

```yaml
id: <kebab-case unique id>
version: 1 # incremented on substantive change
status: stable | draft | deprecated
authoredAt: YYYY-MM-DD
contributors: [@handle, ...]
source: { ref: <citation key>, url: <canonical url> }
```

Type-specific fields layer on top (e.g. rubrics carry `prompt` + `findingTemplate`; patterns carry `applicableTo` + `before` + `after`; exemplars carry `componentType` + `radarReference` + `citationCount`).

The schema MUST be exposed as a validator that PR CI calls automatically. Entries failing validation MUST be rejected at PR time with actionable errors, not merged-and-fixed-later.

### 3. Review process (documented + enforced)

Catalog additions are reviewed against a documented checklist before merge:

- Schema conformance (automatic — Component 2).
- Source provenance — is the citation real and authoritative?
- Duplicate detection — does this overlap an existing entry?
- Quality threshold — does the entry meet the seed-corpus standard?
- Status appropriateness — `draft` (rookie) or `stable` (vetted)?

For `harness-design-craft` the checklist lives at [`contribution.md`](../../changes/design-pipeline/design-craft-elevator/contribution.md). Future catalog-backed skills MUST publish an analogous checklist in their spec directory.

### 4. Signal feedback loop (operational → catalog)

The skill aggregates findings across audits and surfaces **recurring finding-shapes** as candidate catalog additions. For `harness-design-craft`: `contribution/signal.ts` watches CRITIQUE findings; when the same shape (rubric × target-pattern × tier) recurs N≥5 times across distinct projects/components, it exports a proposal to `.harness/design-craft/proposals/` carrying:

- Finding-shape signature
- Recurrence count + sample projects
- Suggested catalog entry skeleton
- Provenance: which audits/runIds contributed

The proposal flows into the same review process (Component 3) but with operational-signal provenance attached. **This is the mechanism that breaks the curator bottleneck**: the catalog grows from what reviewers actually keep flagging, not from a single person's hypothesis.

Threshold N is configurable per skill via `harness.config.json.<skill>.signal.proposalThreshold`.

### 5. Usage measurement

Every catalog entry carries a per-use counter:

- **Rubrics:** per-rubric trigger count (audits invoked it).
- **Patterns:** per-pattern apply count (findings cited it).
- **Exemplars:** per-exemplar cite count (BENCHMARK scores cited it).

Counters are exposed via a stable export (for design-craft: `getCatalogStats()`) and surfaced to the dashboard. Dead entries (zero usage over a documented window — design-craft uses 6 months) are flagged for deprecation review.

### 6. Versioning and deprecation lane

Every entry's `version: number` increments on substantive change. Every entry's `status` field is one of:

| Status       | Meaning                                                                                                                            | Default catalog load                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `stable`     | Vetted, in active use.                                                                                                             | Yes.                                                                           |
| `draft`      | Proposed, under review.                                                                                                            | Only when `catalog.includeDraft: true`.                                        |
| `deprecated` | Superseded or proven harmful. Retained for historical citation resolution. Carries `deprecatedAt` and optional `replacedBy: <id>`. | No — but citations in historical reports MUST still resolve (with annotation). |

The historical-citation requirement is mandatory for the convergence verifier (sub-project #4) to compare findings across runs without false fixpoints.

## Growth trajectory

For `harness-design-craft`, the seed-plus-growth model targets (per [`growth-trajectory.md`](../../changes/design-pipeline/design-craft-elevator/growth-trajectory.md)):

| Horizon      | Rubrics | Patterns | Exemplars |
| ------------ | ------- | -------- | --------- |
| v1 (week 4)  | 10      | 15       | 50        |
| 6 months     | ~15     | 35       | 150       |
| 12-24 months | 20      | 75       | 400       |

Rubrics plateau as craft dimensions stabilize; patterns and exemplars continue growing via signal + community contribution. These are projections, not commitments.

## What the pattern does NOT mandate

- The seed size — that is domain-specific. The pattern requires _justifying_ the seed size in the spec.
- The catalog file layout — YAML, JSON, or hybrid is the skill's choice. The contribution validator enforces the schema regardless.
- The signal threshold N — defaults to 5 for design-craft but is configurable per skill.
- The dashboard rendering of catalog stats — skills may surface per-entry breakdowns, aggregate counters, or both.

## Anti-patterns to avoid

- **Seed-only catalogs** — Option E in the brainstorm. Same fate as the prior-art stalls (impeccable, getdesign.md) on a 12-month horizon.
- **Growth-only catalogs (no seed)** — Option F. Nothing user-facing at v1; no signal to drive growth without initial usage.
- **"Growth optional" framing** — Option G. "Optional" means "skipped." Growth infrastructure must be built in, not bolted on.
- **Hard-deleting deprecated entries** — breaks citations in historical reports and confuses the convergence verifier's fixpoint detection. Always retain deprecated entries with `deprecatedAt` + `replacedBy`.
- **Mixing draft and stable in default loads** — drafts are unproven; loading them by default contaminates production output with low-confidence content.
- **Bypassing the contribution validator** — every entry must round-trip through schema validation at PR time. "Just this once" entries are how catalogs rot.

## Related

- ADR: [0020 — Living catalog with growth infrastructure (the H pattern)](../decisions/0020-living-catalog-h-pattern.md)
- Companion patterns: [[llm-judgment-skills]] (catalog citations populate `cite` blocks on 3-axis findings), [[craft-output-vocabulary]] (catalog `findingTemplate` carries 3-axis defaults), [[detect-and-offer]] (catalog quality is most useful when AestheticIntent is declared upstream).
- First instance: [`harness-design-craft`](../../changes/design-pipeline/design-craft-elevator/proposal.md). Contribution checklist: [`contribution.md`](../../changes/design-pipeline/design-craft-elevator/contribution.md). Growth model: [`growth-trajectory.md`](../../changes/design-pipeline/design-craft-elevator/growth-trajectory.md). Finding codes: [`finding-codes.md`](../../changes/design-pipeline/design-craft-elevator/finding-codes.md).
- Prior art:
  - REFERENCES #8 (ARIA APG) — gated contribution model that keeps quality high.
  - REFERENCES #1 (awesome-design-md) — community-PR-driven growth that works.
  - REFERENCES #2 (pbakaus/impeccable) — fixed-catalog stall pattern (negative example, ~29 rules).
  - REFERENCES #37 (getdesign.md) — single-curator stall pattern (negative example, ~50 entries).
- Related: [ADR 0016 — Skill proposal workflow](../decisions/0016-skill-proposal-workflow.md) demonstrates the signal-to-promotion lane at the skill-corpus level (parallel pattern at a different layer).
