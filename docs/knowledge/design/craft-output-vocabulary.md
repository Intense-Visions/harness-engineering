---
type: business_concept
domain: design
tags: [craft, findings, output, tier, impact, confidence, radar, benchmark, vocabulary]
---

# Craft Output Vocabulary

The **craft output vocabulary** is the shared finding and scoring shape used by LLM-judgment skills in the craft domain. It pairs a **3-axis per-finding model** (tier × impact × confidence) with a **5-dimension radar** for holistic scoring. Codified by [ADR 0019](../decisions/0019-3-axis-craft-output-model.md). First instance: `harness-design-craft` (`CRAFT-C*`, `CRAFT-P*`, `CRAFT-B*` findings).

## Why a new vocabulary

The existing `severity: 'error' | 'warn' | 'info'` vocabulary fits rule-based skills because rule outputs are binary. For craft-domain LLM-judgment outputs (see [[llm-judgment-skills]]) the standard severity vocabulary fails three ways:

1. **Craft findings are not binary** — "the body-text leading is slightly tight" is not "an error." Forcing it into `warn` is adversarial; forcing it into `info` buries it.
2. **Importance is two-dimensional** — a hierarchy collapse and a spring-physics polish opportunity sit at different _tiers_ of craft AND have different _impact_. Collapsing both into single severity loses reviewer-actionable signal.
3. **LLM confidence is real** — a 95%-confident "no primary action" deserves different treatment from a 40%-confident "illustration might feel off-brand."

## Per-finding: the 3-axis model

Every CRITIQUE and POLISH finding (`CRAFT-C*`, `CRAFT-P*`) carries three orthogonal axes:

### Axis 1 — `tier: 'foundational' | 'polish' | 'aspirational'`

Where on the craft maturity ladder does the finding sit?

| Tier           | Meaning                                                                                                                                                    | Reviewer treatment                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `foundational` | Design fails a baseline craft expectation (no hierarchy, no primary action, illegible contrast, disorienting motion).                                      | Near-mandatory to address before shipping.                     |
| `polish`       | Design meets baseline but misses a refinement competent execution would include (cubic-bezier vs spring motion, tight body leading, generic illustration). | Bulk of the elevation work.                                    |
| `aspirational` | Design is competent and refined but could reach beyond (signature motion language, brand-distinctive illustration, custom micro-interaction).              | Ceiling-raising — take when budget allows, skip without shame. |

### Axis 2 — `impact: 'small' | 'medium' | 'large'`

The blast radius — how much does fixing it move the needle?

| Impact   | Meaning                                                                        | Reviewer treatment                  |
| -------- | ------------------------------------------------------------------------------ | ----------------------------------- |
| `large`  | Addressing changes how the design _reads_ at a glance.                         | Front of the work queue.            |
| `medium` | Noticeably improves the experience but does not change the design's character. | Most polish-tier findings sit here. |
| `small`  | Refinement detail.                                                             | Batch into "polish passes."         |

### Axis 3 — `confidence: 'high' | 'medium' | 'low'`

The LLM's self-reported certainty in the judgment. Required by [[llm-judgment-skills]] / ADR 0018. See the confidence semantics there.

### Derived priority

A deterministic `priority: number` is computed per finding from the 3-axis triple. Default weighting: tier dominates impact dominates confidence. The weights are documented in `derivePriority` and skills MAY expose a strictness knob (`strict / standard / permissive`) that shifts the gate threshold along the priority axis without changing underlying values.

The derivation is **deterministic** so downstream sorting, gating, and convergence-verifier fixpoint detection are reproducible even when the LLM payload is not.

## Holistic scoring: the 5-dim radar

Where per-finding outputs use 3-axis, BENCHMARK-phase outputs use a five-dimension radar (matching the [alchaincyf/huashu-design](../../changes/design-pipeline/REFERENCES.md) prior art). Each `CRAFT-B*` benchmark identifier scores a component against curated exemplars across:

| Dimension                | Captures                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `philosophicalCoherence` | Does the design hang together as a unified statement? Is there a discernible point of view? Does every element reinforce the same aesthetic intent?    |
| `hierarchy`              | Visual hierarchy clarity. Primary vs secondary vs tertiary distinctions. No element competes for attention with another at the same level.             |
| `craftExecution`         | Polish, refinement, attention to detail. Typography, spacing, motion, color — all executed at competent-to-stunning standard.                          |
| `function`               | Does it work for the user? Is the design serving the task or fighting it? Is the IA legible, the affordances discoverable, the interactions efficient? |
| `innovation`             | Does the design contribute something distinctive? Is there a signature move, a memorable detail, an unexpected delight? Or is it competently generic?  |

Each dimension carries `{ score: 0-100, confidence, notes }`. The skill emits an `overall: { score, confidence }` aggregated via documented weighting (default: equal weight) AND a `gaps: string[]` narrative for cross-dimension analysis the radar cannot capture.

## Phase / output mapping

| Phase     | Finding code family | Output model          | Cardinality                                              |
| --------- | ------------------- | --------------------- | -------------------------------------------------------- |
| CRITIQUE  | `CRAFT-C*`          | 3-axis                | Many findings per audit.                                 |
| POLISH    | `CRAFT-P*`          | 3-axis + before/after | Many findings per audit.                                 |
| BENCHMARK | `CRAFT-B*`          | 5-dim radar           | One score per benchmarked component, multiple per audit. |

Both vocabularies co-exist in a single `DesignCraftOutput` because they answer different questions (per-issue vs holistic).

## Severity translation (escape hatch)

For consumers that genuinely need `error/warn/info` (legacy reporters, external CI, GitHub annotations), the skill exposes a deterministic derivation:

```
foundational + (large|medium) + (high|medium)  → error
foundational + small | polish + large + high   → warn
everything else                                → info
```

This derivation is **informational and does NOT replace the 3-axis output.** Skills using derived severity in enforcement gates MUST also expose the underlying 3-axis triple so reviewers can audit the mapping.

## What the vocabulary does NOT specify

- The exact priority-derivation weights — those are skill-local and may evolve with usage data (versioned via the catalog's [[living-catalogs]] / ADR 0020 mechanics).
- The number of radar dimensions for non-craft domains — skills in adjacent domains (copy-craft, accessibility-narrative, motion-language) MAY adopt the 5-dim shape OR file a domain-appropriate alternative. The 3-axis per-finding shape is the part that should NOT change without superseding ADR 0019.
- The exact rendering of confidence in markdown — italic, prefix, callout — beyond the requirement that low-confidence findings be visually distinguished.

## Anti-patterns to avoid

- **Collapsing tier into severity** — `foundational` is not "error"; mapping it directly destroys the craft-ladder distinction.
- **Hiding low-confidence findings** — see [[llm-judgment-skills]] §confidence. Low-confidence is the signal a human reviewer needs.
- **Synthetic precision** — emitting `priority: 73.4` and treating the second decimal as meaningful. Priority is a deterministic sort key, not a craft score.
- **Mixing per-finding and holistic outputs in the same list** — CRITIQUE/POLISH findings and BENCHMARK scores answer different questions; format them as separate sections, not interleaved entries.

## Related

- ADR: [0019 — 3-axis craft output model](../decisions/0019-3-axis-craft-output-model.md)
- Parent pattern: [[llm-judgment-skills]] / [ADR 0018](../decisions/0018-llm-judgment-skill-pattern.md) — confidence-as-first-class is required by ADR 0018 §1.
- Companion patterns: [[living-catalogs]] (catalog `findingTemplate` carries the 3-axis defaults per entry), [[detect-and-offer]] (precondition state shapes rubric/exemplar selection that drives output).
- First instance: [`harness-design-craft`](../../changes/design-pipeline/design-craft-elevator/proposal.md) — `CRAFT-C*`, `CRAFT-P*`, `CRAFT-B*` codes. Finding code reference: [`finding-codes.md`](../../changes/design-pipeline/design-craft-elevator/finding-codes.md).
- Prior art: REFERENCES #4 (alchaincyf/huashu-design — proven 5-dim radar shape), #3 (emilkowalski/skill — judgment-heavy review-checklist vocabulary), #7 (Atlassian eslint-plugin-design-system — multi-field rule schema validating "more than one axis").
