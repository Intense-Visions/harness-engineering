---
number: 0019
title: 3-axis (tier × impact × confidence) output model + 5-dim radar for LLM-judgment craft findings
date: 2026-05-23
status: accepted
tier: medium
source: docs/changes/design-pipeline/design-craft-elevator/proposal.md
---

## Context

ADR-0018 codifies the LLM-judgment-based skill pattern. One of the
properties the pattern leaves open is the **output vocabulary** —
what shape each finding takes and how findings aggregate into a
scoring view.

The harness skill ecosystem's existing finding vocabulary is
`severity: 'error' | 'warn' | 'info'` (sometimes extended with
`hint`). This works for rule-based skills because rule outputs are
binary: a rule either fires (warn/error) or it doesn't, and the
severity is an authoring-time policy decision baked into the rule.

For LLM-judgment skills — and specifically for the craft domain
where the first instance, `harness-design-craft`, operates — the
error/warn/info vocabulary fails in three distinct ways:

1. **Craft findings are not binary.** A typography critique like
   "the body-text leading is slightly tight" is not "an error" in
   any meaningful sense. Forcing it into `warn` makes the report
   feel adversarial; forcing it into `info` makes it disappear into
   noise. Neither captures the truth that this is a polish opportunity
   the reviewer should consider, not a violation they must fix.
2. **The ladder of importance is two-dimensional, not one.** "Three
   buttons all the same weight" (hierarchy collapse) and "the loading
   spinner could use spring physics" are both legitimate findings, but
   they sit at different _tiers_ of craft (foundational vs polish vs
   aspirational) AND have different _impact_ (large vs small).
   Collapsing both axes into a single severity loses information that
   the reviewer needs to prioritize.
3. **LLM confidence is real and must be visible.** A 95%-confident
   "no primary action — three CTAs compete" deserves different
   treatment from a 40%-confident "the empty-state illustration might
   feel slightly off-brand." The reviewer can act decisively on the
   first and investigate the second. Burying both in `warn` destroys
   that signal — and ADR-0018 requires confidence as a first-class
   output for all LLM-judgment skills.

Five output models were considered:

- **A. Reuse `error/warn/info`.** Familiar, integrates with existing
  reporters. Rejected per the three failures above.
- **B. Single 0-100 numeric "craft score" per finding.** Looks
  precise. Rejected — false precision, no actionable separation
  between "score 67" and "score 73"; hides the tier vs impact vs
  confidence distinctions reviewers need.
- **C. Free-form prose findings only.** Reviewers triage. Rejected
  — destroys aggregation, breaks the convergence verifier's fixpoint
  comparison, makes the graph adapter impossible.
- **D. 2-axis (tier × impact) only — drop confidence.** Closer.
  Rejected because ADR-0018 makes confidence a first-class output
  for all LLM-judgment skills; dropping it here would force every
  consumer to re-derive it from prose.
- **E. 3-axis (tier × impact × confidence) for per-finding +
  5-dim radar for holistic scoring.** Captures the craft ladder, the
  consequence weight, and the judgment certainty independently; adds
  a separate holistic-scoring vocabulary for the BENCHMARK phase.
  Selected.

Prior art reinforced the choice:

- `alchaincyf/huashu-design` (REFERENCES #4) ships exactly the 5-dim
  radar (philosophical coherence, hierarchy, craft, function,
  innovation) for holistic critique — proving the radar shape works
  in production.
- ESLint-style severity (error/warn/info), the closest precedent, is
  the precise vocabulary the team chose to reject for craft because
  of its rule-based mental model mismatch.
- Atlassian's eslint-plugin-design-system (REFERENCES #7) carries
  severity tiers + autofix metadata — a richer per-rule shape than
  bare severity, validating the "more than one axis" intuition for
  design-domain findings.

## Decision

We adopt **Option E**: a 3-axis per-finding model for per-issue
outputs and a 5-dimension radar for holistic-scoring outputs.
LLM-judgment skills in the craft domain — and any future LLM-judgment
skill whose findings sit on a craft-like ladder — MUST use this
vocabulary.

### Per-finding 3-axis model

Every CRITIQUE and POLISH finding carries three orthogonal axes:

#### Axis 1 — `tier: 'foundational' | 'polish' | 'aspirational'`

The craft ladder. Where on the maturity gradient does this finding
sit?

- **`foundational`** — the design fails a baseline craft expectation.
  Examples: no visual hierarchy, no primary action, illegible
  contrast, animations that disorient. Reviewers should treat
  foundational findings as near-mandatory to address before shipping.
- **`polish`** — the design meets baseline but misses a refinement
  that competent execution would include. Examples: cubic-bezier
  rather than spring motion, slightly tight body leading, generic
  illustration where a custom one would land. Reviewers should treat
  polish findings as the bulk of the elevation work.
- **`aspirational`** — the design is competent and refined but could
  reach beyond. Examples: custom micro-interaction where standard would
  do, signature motion language opportunity, brand-distinctive
  illustration where generic is acceptable. Reviewers should treat
  aspirational findings as ceiling-raising opportunities — take when
  budget allows, skip without shame.

#### Axis 2 — `impact: 'small' | 'medium' | 'large'`

The blast radius of the finding. How much does fixing it move the
needle?

- **`large`** — addressing this finding changes how the design _reads_
  at a glance. The hierarchy problem that makes a page feel chaotic;
  the motion problem that makes interactions feel cheap; the typography
  problem that makes copy hard to scan. Reviewers should batch large-
  impact findings to the front of the work queue.
- **`medium`** — addressing this finding noticeably improves the
  experience but doesn't change the design's character. Most polish-
  tier findings sit here.
- **`small`** — addressing this finding is a refinement detail.
  Reviewers should batch small-impact findings into "polish passes."

#### Axis 3 — `confidence: 'high' | 'medium' | 'low'`

The LLM's self-reported certainty in the judgment. Required by
ADR-0018.

- **`high`** — the model is confident; the finding is well-supported
  by the rubric and the visible evidence. Treat as if asserted by a
  thoughtful peer reviewer.
- **`medium`** — the model sees the issue but acknowledges
  alternative readings. Treat as a discussion item.
- **`low`** — the model is unsure; the finding may not survive human
  inspection. Treat as a candidate for investigation, NOT enforcement.
  Surface visually distinguished in markdown output (italic, prefixed
  `(low confidence:)`). Excluded from enforcement gates by default.

### Derived field: `priority`

A deterministic `priority: number` is computed per finding from the
3-axis triple using a documented weight table. The deterministic
derivation is required (ADR-0018 §2) so downstream sorting, gating,
and fixpoint detection are reproducible even when the LLM payload is
not.

The default weighting (subject to revision via skill-local
configuration) sorts:

```
foundational × large × high      → highest priority
foundational × large × medium
foundational × medium × high
... (38 cells, 27 unique × 3 axes, monotonic) ...
aspirational × small × low       → lowest priority
```

Tier dominates impact dominates confidence in the weighting. Skills
MAY expose a strictness knob (`strict / standard / permissive`) that
shifts the gate threshold along the priority axis without changing
the underlying values.

### Holistic scoring: 5-dimension radar (BENCHMARK phase)

Where per-finding outputs use 3-axis, holistic-scoring outputs (the
BENCHMARK phase of harness-design-craft, and any analogous phase in
future LLM-judgment skills) use a 5-dimension radar. This matches the
huashu-design proven format and provides a glanceable holistic view
that 3-axis per-finding outputs cannot.

The five dimensions are:

| Dimension                | Captures                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `philosophicalCoherence` | Does the design hang together as a unified statement? Is there a discernible point of view? Does every element reinforce the same aesthetic intent?    |
| `hierarchy`              | Visual hierarchy clarity. Primary vs secondary vs tertiary distinctions. No element competes for attention with another at the same level.             |
| `craftExecution`         | Polish, refinement, attention to detail. Typography, spacing, motion, color — all executed at competent-to-stunning standard.                          |
| `function`               | Does it work for the user? Is the design serving the task or fighting it? Is the IA legible, the affordances discoverable, the interactions efficient? |
| `innovation`             | Does the design contribute something distinctive? Is there a signature move, a memorable detail, an unexpected delight? Or is it competently generic?  |

Each dimension carries:

```ts
{
  score: number /* 0-100 */;
  confidence: Confidence;
  notes: string;
}
```

The skill emits an `overall: { score, confidence }` aggregated from
the five dimensions via a documented weighting (default: equal
weight, but skills MAY expose dimension weighting to reflect domain
priorities), AND a `gaps: string[]` narrative for cross-dimension
analysis the radar cannot capture.

The 5-dim radar is the BENCHMARK-phase vocabulary; per-finding
outputs from CRITIQUE/POLISH continue to use 3-axis. Both vocabularies
co-exist in a single `DesignCraftOutput` because they answer
different questions (per-issue vs holistic).

### What the model does NOT specify

- The exact priority-derivation weights — those are skill-local and
  may evolve with usage data.
- The number of radar dimensions for non-craft domains. Skills in
  other domains (e.g. copy-craft, accessibility-narrative) MAY adopt
  the 5-dim shape OR file a domain-appropriate alternative; the
  3-axis per-finding shape is the part that should NOT change
  without superseding this ADR.
- The exact rendering of confidence in markdown output — italic vs
  prefix vs callout — beyond the requirement that low-confidence
  findings be visually distinguished.

### Severity translation (escape hatch)

For consumers that genuinely need `error/warn/info` (legacy reporters,
external CI integrations, GitHub annotations), the skill MUST expose
a derivation:

```
foundational + (large|medium) + (high|medium)  → error
foundational + small | polish + large + high   → warn
everything else                                  → info
```

This derivation is informational and does NOT replace the 3-axis
output. Skills using the derived severity in enforcement gates MUST
also expose the underlying 3-axis triple for human review.

## Consequences

**Positive:**

- Reviewers can prioritize: foundational/large findings to the front,
  aspirational/small to the back, low-confidence to investigation
  rather than enforcement.
- The vocabulary is shared across CRITIQUE and POLISH phases, so
  reviewers learn it once.
- Confidence is honest and visible — ADR-0018's confidence-as-
  first-class requirement is met by a concrete schema element rather
  than a prose convention.
- Holistic scoring (5-dim radar) gives stakeholders a glanceable
  health view that per-finding lists cannot, and matches the proven
  huashu-design shape so reviewers familiar with that tool transfer
  instantly.
- The escape-hatch severity derivation keeps existing consumers
  working without forcing every reporter to learn 3-axis on day 1.

**Negative:**

- More fields per finding = more cognitive load for first-time
  readers. Mitigated by the priority field (one-dimensional sort) and
  the markdown formatter (grouped, visually distinguished).
- 3-axis × per-finding plus 5-dim radar means two vocabularies in one
  output. Mitigated by phase separation: per-finding from CRITIQUE/
  POLISH, radar from BENCHMARK.
- The weighting tables are policy decisions that will drift as
  catalog usage data accrues. Mitigated by exposing weights as
  configuration with documented defaults.
- Skills outside the craft domain that adopt the 3-axis vocabulary
  inherit the `tier: foundational | polish | aspirational` naming
  even when domain-natural terms (e.g. `required | recommended |
optional` for accessibility) might fit better. Skills MAY rename
  the tier values via a documented alias as long as the underlying
  three-level shape is preserved.

**Reversibility:**

- Superseding the 3-axis model requires a replacement ADR with a
  migration plan for `harness-design-craft` finding-codes
  (`CRAFT-C*`, `CRAFT-P*`) and any other LLM-judgment skill that
  adopted the vocabulary.
- The 5-dim radar is independently revisable; replacing it does not
  invalidate the 3-axis per-finding model.

## Alternatives Considered

- **error/warn/info severity (Option A):** rejected — wrong mental
  model for craft; collapses the tier/impact/confidence distinctions
  reviewers need.
- **Single 0-100 craft score (Option B):** rejected — false
  precision, no actionable separation, hides axes.
- **Free-form prose (Option C):** rejected — destroys aggregation,
  breaks verifier fixpoint, breaks graph adapter.
- **2-axis (tier × impact) only (Option D):** rejected — violates
  ADR-0018's confidence-as-first-class requirement.

## References

- First instance: `docs/changes/design-pipeline/design-craft-elevator/
proposal.md` §"Data structures" — CraftFinding + BenchmarkScore
  schemas.
- Parent pattern: `0018-llm-judgment-skill-pattern.md` (confidence-as-
  first-class is required by §1).
- Companion ADRs: `0020-living-catalog-h-pattern.md` (catalog
  citations populate the `cite` block on every 3-axis finding),
  `0021-detect-and-offer-b-prime-pattern.md` (precondition state
  influences the rubric/exemplar selection that ultimately shapes
  output quality).
- Prior art:
  - `docs/changes/design-pipeline/REFERENCES.md` #4
    (alchaincyf/huashu-design) — proven 5-dim radar shape.
  - `docs/changes/design-pipeline/REFERENCES.md` #3
    (emilkowalski/skill) — judgment-heavy review-checklist vocabulary
    we are improving over.
  - `docs/changes/design-pipeline/REFERENCES.md` #7 (Atlassian
    eslint-plugin-design-system) — multi-field rule schema that
    validated "more than one axis" intuition.
- Phase-0 schema spike: `docs/changes/design-pipeline/design-craft-
elevator/phase-0-schema-spike/` — fixture rubrics, patterns,
  exemplars authored against this schema.
