# design-craft-elevator — Finding Codes Reference

> Canonical reference for every finding code emitted by the `harness-design-craft` skill (`mcp__harness__design_craft`). Codes are namespaced under three families: `CRAFT-C*` (critique — LLM-judgment findings about craft quality), `CRAFT-P*` (polish — LLM-judgment suggestions with before/after sketches), and `CRAFT-B*` (benchmark identifiers — references to BENCHMARK runs and their citations).
>
> **Scope:** This document is authoritative for v1 (Sprint 1 vertical slice through Sprint 4 polish). Codes marked `RESERVED` will be defined incrementally as the H seed catalog (10 rubrics + 15 patterns + 50 exemplars) lands across Phases 1–3, and as growth-infrastructure proposals are promoted to stable status in subsequent versions.
>
> **Audience:** skill authors filling in catalog entries, downstream consumers (sub-project #4 verifier, sub-project #5 orchestrator) wiring on finding shape, designers reading craft critique output looking up what a code means.

---

## Table of Contents

- [Conventions](#conventions)
  - [Code-family scheme](#code-family-scheme)
  - [Range allocation](#range-allocation)
  - [Output models](#output-models)
    - [3-axis model (CRAFT-C, CRAFT-P)](#3-axis-model-craft-c-craft-p)
    - [5-dimension radar (CRAFT-B)](#5-dimension-radar-craft-b)
  - [Priority derivation](#priority-derivation)
  - [Source citation prefixes](#source-citation-prefixes)
  - [Entry format](#entry-format)
- [CRAFT-C\* — Critique findings](#craft-c--critique-findings)
  - [CRAFT-C001 — Hierarchy Clarity](#craft-c001--hierarchy-clarity)
  - [CRAFT-C002 — Typography Craft](#craft-c002--typography-craft)
  - [CRAFT-C003 — Motion Quality](#craft-c003--motion-quality)
  - [CRAFT-C004 — Color Confidence](#craft-c004--color-confidence)
  - [CRAFT-C005 — Density & Rhythm](#craft-c005--density--rhythm)
  - [CRAFT-C006 — Restraint](#craft-c006--restraint)
  - [CRAFT-C007 — Polish Details](#craft-c007--polish-details)
  - [CRAFT-C008–C010 — RESERVED (Phase 2B seed)](#craft-c008c010--reserved-phase-2b-seed)
  - [CRAFT-C011–C100 — RESERVED (post-seed growth)](#craft-c011c100--reserved-post-seed-growth)
- [CRAFT-P\* — Polish findings](#craft-p--polish-findings)
  - [CRAFT-P001 — Spring Physics Micro-interaction](#craft-p001--spring-physics-micro-interaction)
  - [CRAFT-P002 — Skeleton (Content-Matched)](#craft-p002--skeleton-content-matched)
  - [CRAFT-P003 — Stagger Timing](#craft-p003--stagger-timing)
  - [CRAFT-P004–P015 — RESERVED (Phase 1 / Phase 2 seed)](#craft-p004p015--reserved-phase-1--phase-2-seed)
  - [CRAFT-P016–P100 — RESERVED (post-seed growth)](#craft-p016p100--reserved-post-seed-growth)
- [CRAFT-B\* — Benchmark identifiers](#craft-b--benchmark-identifiers)
  - [Benchmark-identifier semantics](#benchmark-identifier-semantics)
  - [CRAFT-B001–B005 — anchor benchmark identifiers (seed exemplar set)](#craft-b001b005--anchor-benchmark-identifiers-seed-exemplar-set)
  - [CRAFT-B006–B100 — RESERVED (catalog growth)](#craft-b006b100--reserved-catalog-growth)
- [Exemplar references (used by BENCHMARK runs)](#exemplar-references-used-by-benchmark-runs)
- [Reserved-code authoring convention](#reserved-code-authoring-convention)
- [Cross-references](#cross-references)

---

## Conventions

### Code-family scheme

| Family     | Phase     | Meaning                                                                                                                                                          | Output model                        |
| ---------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `CRAFT-C*` | CRITIQUE  | An LLM-judgment finding about a craft quality gap (hierarchy, typography, motion, etc.). Sourced from a `rubric` in `catalog/rubrics/`.                          | 3-axis (tier × impact × confidence) |
| `CRAFT-P*` | POLISH    | An LLM-judgment suggestion with before/after sketches that elevates a specific code region. Sourced from a `pattern` in `catalog/patterns/`.                     | 3-axis (tier × impact × confidence) |
| `CRAFT-B*` | BENCHMARK | An identifier for a single BENCHMARK run targeting one component against one or more exemplars. Each `CRAFT-B*` code corresponds to a stable benchmark identity. | 5-dimension radar                   |

All codes are formatted `CRAFT-{family}{3-digit}`. The format is stable: `CRAFT-C001`, `CRAFT-P017`, `CRAFT-B042`. Three digits provide headroom (up to 100 per family within v1 reservation; the post-100 band exists in the type system but is unallocated).

### Range allocation

The range allocation below is the **authoritative reservation** that Phase 1–4 implementers and post-v1 contributors must respect. Phase 0 spike defined 3 critique rubrics + 3 polish patterns + 3 exemplars; the H seed (per success criterion #7–#9) ships 10 rubrics + 15 patterns + 50 exemplars; long-term trajectory is 20 + 75 + 400 over 12–24 months.

**CRAFT-C (critique rubrics):**

| Range       | Phase landed     | Status (v1)                                                                                                                                  |
| ----------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `C001–C003` | Phase 2 (PR 431) | Shipped (hierarchy, typography, motion — wired into `SEED_RUBRICS`).                                                                         |
| `C004–C005` | Phase 1B         | Shipped (color-confidence, density-rhythm — completes the half-seed of 5 rubrics required by the Phase 1B exit criterion).                   |
| `C006–C007` | Phase 2B (this)  | Shipped (restraint, polish-details — first pair of the Phase 2B widen-to-10 set; bridges foundational and polish tiers in the loop).         |
| `C008–C010` | Phase 2B         | Reserved for seed catalog completion (success criterion #7 lists 10 rubrics — copy-voice, interaction-craft, brand-coherence still to ship). |
| `C011–C020` | Post-v1          | Reserved for the H growth trajectory (target: 20 rubrics in 12–24 months).                                                                   |
| `C021–C100` | Long-term        | Reserved for community contribution + signal-loop proposals.                                                                                 |

**CRAFT-P (polish patterns):**

| Range       | Phase landed     | Status (v1)                                                                                                                                      |
| ----------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `P001`      | Phase 2 (PR 431) | Shipped (spring-physics — wired into `SEED_PATTERNS`).                                                                                           |
| `P002–P003` | Phase 2 (this)   | Shipped (skeleton-content-matched, stagger-timing — wired into `SEED_PATTERNS` from Phase 0 spike artifacts).                                    |
| `P004–P015` | Phase 1–2        | Reserved for seed catalog completion (success criterion #8 lists 15 patterns — 3 motion + 3 skeleton + 3 typography + 3 interaction + 3 layout). |
| `P016–P075` | Post-v1          | Reserved for the H growth trajectory (target: 75 patterns in 12–24 months).                                                                      |
| `P076–P100` | Long-term        | Reserved for community contribution + signal-loop proposals.                                                                                     |

**CRAFT-B (benchmark identifiers):**

| Range       | Phase landed     | Status (v1)                                                                                                         |
| ----------- | ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| `B001`      | Phase 2 (PR 431) | Shipped (linear-empty-list — wired into `SEED_EXEMPLARS`).                                                          |
| `B002–B003` | Phase 2 (this)   | Shipped (stripe-loading-state, raycast-command-palette — wired into `SEED_EXEMPLARS` from Phase 0 spike artifacts). |
| `B004–B005` | Phase 0          | Anchor identifiers reserved for the 2 reserved early v1 exemplars.                                                  |
| `B006–B050` | Phase 1–2        | Reserved for seed exemplar set (success criterion #9 lists 50 exemplars across 5 types).                            |
| `B051–B100` | Post-v1          | Reserved for catalog growth (target: 400 exemplars in 12–24 months).                                                |

Beyond 100 in any family, the type system continues to accept the format, but no allocation rules apply — those codes belong to future versions and require an explicit allocation update.

### Output models

#### 3-axis model (CRAFT-C, CRAFT-P)

Per Decision #5 (proposal lines 50–67) and ADR-005 (proposal line 407), CRITIQUE and POLISH findings use a **3-axis output model** rather than the standard error/warn/info severity vocabulary. The three axes are:

| Axis         | Values                                       | Meaning                                                                                                                                                                                                                                                                          |
| ------------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tier`       | `foundational` \| `polish` \| `aspirational` | **What rung of the craft ladder.** Foundational = baseline craft (hierarchy, type system, basic motion). Polish = elevation moves (spring physics, content-matched skeletons, density rhythm). Aspirational = signature craft moves (novel interaction, brand-defining moments). |
| `impact`     | `small` \| `medium` \| `large`               | **How much the change moves perceived quality** for the target component or page. Independent of tier — a small impact at foundational tier is still worth fixing; a large impact at aspirational tier may be future work.                                                       |
| `confidence` | `high` \| `medium` \| `low`                  | **How sure the LLM is about the judgment.** Essential for honest output — when the LLM is asked to evaluate ambiguous fixtures, low-confidence findings are emitted rather than silently dropped or upgraded. Per success criterion #6.                                          |

The axes are **independent** — no rule constrains `tier ↔ impact` correlation (Phase 0 spike `patterns/stagger-timing.md` deliberately exercises `tier: polish` × `impact: small`; Phase 0 spike `patterns/skeleton-content-matched.md` deliberately exercises `tier: polish` × `impact: large`). The three axes plus the derived `priority` field fully describe a craft finding's salience.

The schema lives in `findings/schema.ts`:

```ts
export type Tier = 'foundational' | 'polish' | 'aspirational';
export type Impact = 'small' | 'medium' | 'large';
export type Confidence = 'high' | 'medium' | 'low';

export interface CraftFinding {
  code: string; // e.g. 'CRAFT-C001', 'CRAFT-P001'
  phase: 'critique' | 'polish';
  tier: Tier;
  impact: Impact;
  confidence: Confidence;
  target: { file: string; line?: number; component?: string };
  message: string;
  cite: { rubricOrPatternId: string; source: string };
  before?: string; // POLISH only
  after?: string; // POLISH only
  derived: { priority: number }; // computed from tier × impact × confidence
}
```

#### 5-dimension radar (CRAFT-B)

Per Decision #5 and ADR-005, the BENCHMARK phase produces **5-dimension radar scores** rather than findings. Each `CRAFT-B*` code identifies a benchmark run (one target component compared against one or more exemplars); the run emits a `BenchmarkScore` object carrying scores across five dimensions.

| Dimension                | What it measures                                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `philosophicalCoherence` | Does the component's design language cohere with its parent product's aesthetic intent? (huashu-design #1)                                                |
| `hierarchy`              | Is there a clear primary / secondary / tertiary visual order? (huashu-design #2, mirrored by `CRAFT-C001`)                                                |
| `craftExecution`         | Quality of typography, color, spacing, motion at the pixel level — the "look closer" axis.                                                                |
| `function`               | Does the component do its job clearly and reachably? Distinct from accessibility (`harness-accessibility` owns WCAG) — this is functional clarity.        |
| `innovation`             | Does the component contribute a signature move beyond the reference set? Often middling for production-quality work; high only for genuinely novel craft. |

Per-dimension scores are integers 0–100. Each dimension also carries a `confidence` value (`high`/`medium`/`low`) and a narrative `notes` field explaining the score. The `overall` score is a **weighted aggregate** (Phase 0 spike review.md observation O6 flags that the weighting rule must be selected and documented in Phase 1 — equal weights / mean is the recommended starting point with a config knob to override). The `overall` confidence aggregation is documented separately in Phase 0 review.md observation O7 — `min` is the recommended conservative starting rule.

The schema lives in `findings/schema.ts`:

```ts
export interface BenchmarkScore {
  target: { file: string; component: string };
  exemplars: string[]; // ids cited
  radar: {
    philosophicalCoherence: { score: number; confidence: Confidence; notes: string };
    hierarchy: { score: number; confidence: Confidence; notes: string };
    craftExecution: { score: number; confidence: Confidence; notes: string };
    function: { score: number; confidence: Confidence; notes: string };
    innovation: { score: number; confidence: Confidence; notes: string };
  };
  overall: { score: number; confidence: Confidence }; // weighted aggregate
  gaps: string[]; // narrative gap analysis
}
```

Per Phase 0 review observation O8, `gaps` is currently `string[]`. Forward-compatible evolution to `Array<{ summary, impact?, recommendedPatternId? }>` is tracked as a Phase 1 / Phase 2A enhancement so BENCHMARK gaps can be routed into POLISH suggestions.

### Priority derivation

Every `CRAFT-C*` and `CRAFT-P*` finding includes a `derived.priority: number` field computed from `tier × impact × confidence` (success criterion #5, #26). The derivation is deterministic so consumers (verifier #4, orchestrator #5) can sort and group findings without rerunning the LLM. The default derivation in `findings/derived.ts`:

| Axis         | Weight contribution                                                    |
| ------------ | ---------------------------------------------------------------------- |
| `tier`       | `foundational` = 3, `polish` = 2, `aspirational` = 1                   |
| `impact`     | `large` = 3, `medium` = 2, `small` = 1                                 |
| `confidence` | `high` = 1.0, `medium` = 0.7, `low` = 0.4 (confidence as a multiplier) |

`priority = (tier_weight + impact_weight) × confidence_multiplier`. The result is in the open range (0.8, 6.0]; consumers should treat it as an opaque ordering scalar, not an absolute severity. The derivation may evolve (recorded in ADR-005) but the deterministic guarantee is part of the public contract.

### Source citation prefixes

Each catalog entry's `source.ref` field cites a published authority. The seed prefixes:

| Prefix                      | Authority                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `huashu-design#`            | huashu-design (REFERENCES.md #4) — the seed source for the 5-dim radar model.      |
| `vercel-geist#`             | Vercel's Geist design system — public, comprehensive, frequently cited.            |
| `emil-design-eng#`          | emilkowalski/skill (REFERENCES.md) — the working reference on motion design craft. |
| `linear-app`                | Linear product surface — exemplar source for restrained empty/loading states.      |
| `stripe-checkout`           | Stripe checkout surface — exemplar source for production-quality skeletons.        |
| `raycast-app`               | Raycast product surface — exemplar source for keyboard-driven density.             |
| `design-component-anatomy/` | Internal harness knowledge skill (shared with sub-project #2's audit).             |

New prefixes added during catalog growth must be recorded in this table AND in the contribution-format schema validator.

Per Phase 0 review observation O1, `source.url` is **optional** (some rubrics synthesize craft principles from multiple sources where a single URL does not exist). `source.ref` is **required**.

### Entry format

Each defined code entry uses this shape:

- **Code** — the `CRAFT-X###` identifier.
- **Catalog entry id** — the `id` field of the source rubric / pattern / exemplar (e.g., `rubric-hierarchy-clarity`).
- **Tier / impact / confidence ceiling** — for C and P entries, the `findingTemplate` values plus any `confidenceCap` (e.g., motion quality caps at `medium` for code-only mode per spike notes).
- **Applies to** _(C only)_ — `[component, page]` or `[component]`, per the rubric's `appliesTo`.
- **Applicable to** _(P only)_ — pattern-match discriminators from the rubric's `applicableTo` array.
- **Source citation** — `source.ref` plus optional `url`.
- **Prompt or trigger** — for C, the rubric prompt to the LLM. For P, the `when` condition that triggers the pattern match.
- **Suggestion / message** — for C, the message template the finding produces. For P, the `suggest` text and the before/after sketches.
- **Positive example** — code or scenario that **would** emit the finding.
- **Negative example** — code or scenario that **would not** emit the finding.
- **Schema notes** — any Phase 0 caveats (especially the eight non-blocking observations in Phase 0 review.md) consumers should know.

---

## CRAFT-C\* — Critique findings

### CRAFT-C001 — Hierarchy Clarity

**Catalog entry id:** `rubric-hierarchy-clarity`

**Tier / impact:** `tier: foundational`, `impact: large`. Confidence is per-call (LLM-judgment); no ceiling.

**Applies to:** `[component, page]`

**Source citation:** `huashu-design#hierarchy` — <https://github.com/alchaincyf/huashu-design>

**Prompt** (verbatim from Phase 0 spike `rubrics/hierarchy-clarity.md`):

> Evaluate the visual hierarchy of {target}.
>
> - Is there a clear primary, secondary, tertiary level?
> - Does typographic scale support the hierarchy or muddy it?
> - Are spacing, color, and weight all aligned with hierarchy intent?
> - Identify any "competing for primary" elements (e.g., two buttons with equal weight, two headings with equal size, color/weight pulling against scale).
> - Where does the eye land first? Is that the intended entry point?
>   Use the 3-axis output model (tier × impact × confidence). Be honest about confidence — if the target is ambiguous, say so.

**Message** (LLM-generated; example shape):

> `Visual hierarchy in {target.component} is unclear: {finding-specific narrative — e.g., "three CTAs in a row share identical weight, color, and size; no primary signal"}. Restore hierarchy by differentiating primary action via weight + saturation + spacing.`

**Positive example (finding emitted):**

Three CTAs in a row, all with identical weight, color, and size — no primary signal. User must read every label to decide. Same failure mode in card layouts where every card claims equal visual loudness.

**Negative example (no finding):**

Linear command palette — primary action reads with weight + saturation + spacing; secondary items reduced weight; tertiary metadata gets a dedicated visual register (monospace, dim). Eye lands on the search field, then drops cleanly down the result list.

**Schema notes:**

- This is the foundational craft rubric — first to ship, highest-impact target. Many BENCHMARK gaps will route here for follow-up critique.
- Multi-value `appliesTo` confirmed valid by Phase 0 schema-fit review.

### CRAFT-C002 — Typography Craft

**Catalog entry id:** `rubric-typography-craft`

**Tier / impact:** `tier: foundational`, `impact: medium`. Confidence drops when the target lacks a declared type scale to compare against (noted in rubric prompt; LLM enforces).

**Applies to:** `[component, page]`

**Source citation:** `vercel-geist#typography` — <https://vercel.com/geist/introduction>

**Prompt** (verbatim from Phase 0 spike `rubrics/typography-craft.md`):

> Evaluate the typographic craft of {target}.
>
> - Is the type scale consistent (modular, or at least intentionally chosen ratios) or arbitrary?
> - Are line-heights tuned to font size and reading width? (Body copy typically 1.4–1.6; headings 1.05–1.25.)
> - Is measure (line length) within the 45–75 char reading band for body copy?
> - Is letter-spacing tuned at display sizes? (Large headings usually benefit from slight negative tracking.)
> - Is font-weight contrast meaningful (e.g., 400 vs 600) or muddy (e.g., 400 vs 500)?
> - Are numerals tabular where alignment matters (tables, prices)?
>   Use the 3-axis output model. Confidence should drop when the target lacks a declared type scale to compare against.

**Message** (LLM-generated; example shape):

> `Typographic craft in {target} has a {finding-specific narrative — e.g., "no visible modular scale; default 1.5 line-height applied uniformly across sizes"}. {recommendation — e.g., "Adopt a modular scale (1.2 or 1.25 ratio) and tune line-heights per role"}.`

**Positive example (finding emitted):**

Headings, body, and captions all set in same weight at 14/16/18 with default 1.5 line-height. No visible scale, no role differentiation, letter-spacing untouched at all sizes. Numerals proportional inside a pricing table — columns misalign.

**Negative example (no finding):**

Geist Sans + Geist Mono pair: explicit modular scale, tuned line-heights per role (display, heading, body, caption), tabular numerals on pricing rows, negative tracking on display sizes. Every text element has an obvious role in the scale.

**Schema notes:**

- This rubric's `source` cites a public design system but synthesizes general typography craft principles — the schema allows either specific or thematic source references (Phase 0 spike note).
- Prompt enumerates six bullet criteria; schema does not cap prompt length but the contribution review process advises concision.

### CRAFT-C003 — Motion Quality

**Catalog entry id:** `rubric-motion-quality`

**Tier / impact:** `tier: polish`, `impact: medium`. **Confidence cap:** `medium` in `mode: fast` (code-only) per the prompt's explicit ceiling — motion quality is hard to judge without rendering. `mode: deep` (vision + render) lifts the cap.

**Applies to:** `[component]` only — motion is component-scoped, not page-scoped (Phase 0 spike confirmed schema accepts single-value `appliesTo`).

**Source citation:** `emil-design-eng#animation-decision-framework` — <https://github.com/emilkowalski/skill/blob/main/skills/emil-design-eng/SKILL.md>

**Prompt** (verbatim from Phase 0 spike `rubrics/motion-quality.md`):

> Evaluate the motion quality of {target}.
>
> - Does the motion communicate something (state change, causality, spatial relationship) or is it decorative?
> - Is the easing physically plausible? (Spring physics or custom-tuned curves beat default ease/ease-in-out.)
> - Are durations proportionate? (Microinteractions <150ms; transitions 150–400ms; large layout shifts up to 600ms but rare.)
> - Do entrances/exits use the same envelope, or do they feel jarring?
> - Does the motion respect `prefers-reduced-motion`?
> - Are interruptions handled gracefully (e.g., reversing mid-flight instead of snap-resetting)?
>   Use the 3-axis output model. Confidence should drop on code-only analysis — motion quality is hard to judge without rendering.

**Message** (LLM-generated; example shape):

> `Motion in {target} {finding-specific narrative — e.g., "uses 300ms linear easing on hover (feels mechanical) and 800ms slide-in on the side panel (blocks user interaction during the slide)"}. {recommendation — e.g., "Adopt spring physics on the hover micro-interaction and shorten the side-panel entrance to 250ms with custom-tuned easing"}.`

**Positive example (finding emitted):**

Modal opens with 500ms ease-out, closes with instant snap. Hover micro-interaction uses 300ms linear (feels mechanical). No prefers-reduced-motion handling. A side panel slides in over 800ms, blocking the user from interacting with it during the slide.

**Negative example (no finding):**

Stripe checkout amount input: spring-physics character ticker on value change, 180ms entrance with subtle scale + opacity, reversible mid-flight if value changes again. Respects reduced-motion (cross-fade fallback). Causality is clear — the number that animated is the number that changed.

**Schema notes:**

- `tier: polish` rather than `foundational` reflects that motion is a craft elevator, not a baseline structural requirement.
- The Phase 0 spike notes this rubric does NOT need a `confidenceCap` field today (the prompt enforces the cap through LLM instruction). A first-class `confidenceCap` schema field is flagged as a possible future addition.
- Pairs naturally with `CRAFT-P001` (spring-physics) — many CRITIQUE findings on motion will recommend the spring-physics pattern as the POLISH suggestion.

### CRAFT-C004 — Color Confidence

**Catalog entry id:** `rubric-color-confidence`

**Tier / impact:** `tier: foundational`, `impact: large`. **Confidence cap:** `medium` in `mode: fast` (code-only) per the prompt's explicit note — declared tokens are visible but rendered hue is not. `mode: deep` (vision + render) lifts the cap.

**Applies to:** `[component, page]` — color confidence applies at both scopes (component-level role usage and page-level chroma distribution).

**Source citation:** `refactoring-ui#color + vercel-geist#palette` — <https://www.refactoringui.com/>

**Prompt** (verbatim from `catalog/rubrics/color-confidence.ts`):

> Evaluate the color confidence of {target}.
>
> - Does the surface commit to a small set of named roles (text, surface, accent, success, danger, muted) or scatter raw hex / rgb values?
> - Is the accent earning its presence (one primary CTA, one focal highlight) or smeared across multiple competing elements?
> - Are neutrals doing structural work (cards, dividers, hover) without drifting into tinted grays that read as accidental color?
> - Is contrast between text and surface sufficient for the role (body ≥ 4.5:1; large display ≥ 3:1) or does the surface lean on chroma to compensate for low luminance contrast?
> - Are semantic colors used consistently (danger only for destructive outcomes, success only for confirmation) or decoratively?
> - Is dark mode a real rethink (recomputed roles, recovered contrast) or a token swap that flattens hierarchy?
>   Use the 3-axis output model (tier x impact x confidence). Be honest about confidence — code-only analysis sees declared tokens but not rendered hue, so confidence should drop when only raw values are visible without role context.

**Message** (LLM-generated; example shape):

> `Color usage in {target} {finding-specific narrative — e.g., "scatters seven raw hex values across cards, badges, and dividers without role tokens, and uses the accent indigo on three competing CTAs"}. {recommendation — e.g., "Commit to a single accent on the primary CTA, demote secondary actions to neutral, and replace raw values with named role tokens"}.`

**Positive example (finding emitted):**

Marketing dashboard with seven accent hues sprinkled across cards, badges, hover states, and section dividers. Raw `#3B82F6` and `rgb(34,197,94)` interleaved with token names. Every status pill gets a custom color, so semantic meaning is lost — green just means "chart entry," not "success."

**Negative example (no finding):**

Linear settings panel — a single accent (indigo) reserved for the active nav item and the primary save CTA, neutrals carry every structural border, success/danger appear only on confirmation toasts. Dark mode flips role tokens with recomputed contrast, not a luminance invert. The eye reads one accent and one structure layer.

**Schema notes:**

- `tier: foundational` reflects that color confidence is a baseline craft dimension; a project that scatters seven accents without role tokens is unfinished at the foundation layer, not at the polish layer.
- Pairs naturally with `audit-brand-compliance` (sub-project #3 — declared brand-color usage rules). When that skill is configured, color-confidence findings the audit already flagged are deferred via the i18n-style overlap resolution (mirrors `CRAFT-C003` × `harness-design` deferral).

### CRAFT-C005 — Density & Rhythm

**Catalog entry id:** `rubric-density-rhythm`

**Tier / impact:** `tier: foundational`, `impact: medium`. **Confidence cap:** `medium` in `mode: fast` (code-only) — declared spacing scales are visible but rendered rhythm is not. `mode: deep` lifts the cap.

**Applies to:** `[component, page]` — rhythm operates at both scopes (component-internal pair-vs-group gaps, page-level section rhythm).

**Source citation:** `refactoring-ui#spacing + linear-app#density` — <https://www.refactoringui.com/>

**Prompt** (verbatim from `catalog/rubrics/density-rhythm.ts`):

> Evaluate the density and spacing rhythm of {target}.
>
> - Does the surface honor a single spacing scale (e.g. 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64) or scatter arbitrary pixel margins?
> - Is the gap between paired elements (label + control, icon + text) tighter than the gap to the next group, so the eye reads clusters?
> - Is the surface honest about its density — generous when content rewards generosity (marketing, hero, empty states), compact when content rewards compactness (dashboards, command palettes, tables)?
> - Does vertical rhythm survive at varying viewport widths, or do the gaps collapse / explode at common breakpoints?
> - Are dividers earning their presence (only where whitespace alone fails to group) or used as decorative seams?
> - Are sibling cards / rows / sections rhythmically spaced, or does one out-of-scale gap break the pattern?
>   Use the 3-axis output model (tier x impact x confidence). Confidence should drop when the target lacks a declared spacing scale to compare against, or when only inline styles are visible without surrounding layout context.

**Message** (LLM-generated; example shape):

> `Spacing in {target} {finding-specific narrative — e.g., "uses 14 / 17 / 21 / 11 pixel values inline without an underlying scale, and label-to-control gaps are equal to group-to-group gaps so pairing collapses"}. {recommendation — e.g., "Adopt a 4/8/16/24/32 scale, tighten label-control gaps to 8, and widen group separation to 24 so clusters read"}.`

**Positive example (finding emitted):**

Settings form with `margin: 14px`, `padding: 17px 21px`, and `gap: 11px` interleaved — no scale, no rhythm. Label sits 12px from its control AND 12px from the next group, so pairing collapses. Horizontal rules between every row of equal weight, plus generous whitespace on a dense list view that should be compact. Mobile gaps snap to 6px while desktop is at 32px — no continuity.

**Negative example (no finding):**

Linear issue detail page — 4/8/16/24/32 scale used throughout, label-to-control gap is 8 while group-to-group is 24, so the eye reads pairs without effort. Dashboard rows compact at 36px, marketing hero generous at 96px — same product, honest about role. Dividers appear only between unrelated regions; everywhere else whitespace handles grouping.

**Schema notes:**

- `tier: foundational` × `impact: medium` deliberately exercises a different tier × impact pair than `CRAFT-C001` (foundational × large) and `CRAFT-C004` (foundational × large), reinforcing the axes' independence within the foundational tier.
- Pairs naturally with `CRAFT-P003` (stagger-timing) where rhythm becomes temporal as well as spatial.

### CRAFT-C006 — Restraint

**Catalog entry id:** `rubric-restraint`

**Tier / impact:** `tier: foundational`, `impact: large`. Confidence is per-call — restraint reads well from code (counts of nested containers, redundant prop combinations, competing CTAs) so the rubric prompt does not impose a code-only ceiling.

**Applies to:** `[component, page]` — restraint operates at both scopes (component-internal ornament accumulation and page-level competing focal points).

**Source citation:** `refactoring-ui#less-is-more + dieter-rams#10-principles` — <https://www.refactoringui.com/>

**Prompt** (verbatim from `catalog/rubrics/restraint.ts`):

> Evaluate the restraint of {target}.
>
> - Does every visible element earn its place, or has the surface accumulated ornament (gradients, borders, shadows, icons, badges) past the point where it adds meaning?
> - Is there a single focal action, or do multiple CTAs compete for the same attention budget?
> - Are decorative flourishes (illustrations, mascots, animated backgrounds) earning their cost in cognitive load and load time, or are they filler standing in for an unclear message?
> - Are containers nested where flat layout would carry the same hierarchy (cards-in-cards, panels-in-panels)?
> - Are properties repeated where one would do (multiple separators, redundant labels, label + icon + tooltip all naming the same thing)?
> - Does the surface trust the reader to follow a clear path, or does it hand-hold with explainer text, callouts, and arrows pointing at things that need no pointing?
>   Use the 3-axis output model (tier x impact x confidence). Restraint reads well from code (counting visible elements, nesting depth, redundant prop combinations is structural), so confidence here can be reasonably high even in fast/code-only mode.

**Message** (LLM-generated; example shape):

> `Restraint in {target} {finding-specific narrative — e.g., "three nested rounded containers wrap each plan card and two equally-weighted CTAs sit at the bottom of every card"}. {recommendation — e.g., "Flatten to one container per card, demote one CTA to a ghost link, and let whitespace carry the hierarchy"}.`

**Positive example (finding emitted):**

Marketing pricing page with three plan cards, each wrapped in a rounded container, each container wrapped in a gradient border, each gradient border wrapped in a drop-shadow panel. Every feature row gets a checkmark icon, an "info" tooltip trigger, AND an italic sub-line repeating the row label. Two competing CTAs ("Start free" and "Talk to sales") sit at equal weight at the bottom of every card.

**Negative example (no finding):**

Linear command palette — one input, one result list, one keyboard shortcut footer. No nested cards, no badges decorating each row, no illustrated empty state competing with the input. The single accent sits on the selected row and nowhere else. Every pixel is doing work.

**Schema notes:**

- `tier: foundational` × `impact: large` joins `CRAFT-C001` and `CRAFT-C004` in the foundational-large band. Three foundational-large rubrics asking different questions (hierarchy, color, restraint) gives the CRITIQUE loop meaningful coverage of the structural craft floor.
- Unlike motion (C003), color (C004), and density (C005), restraint does **not** declare a code-only confidence cap — the structural signals it asks about (element counts, nesting depth, prop redundancy) are visible from source.
- Pairs naturally with `audit-component-anatomy` (sub-project #2): anatomy enforces required parts; restraint asks whether OPTIONAL parts have crept in past necessity.

### CRAFT-C007 — Polish Details

**Catalog entry id:** `rubric-polish-details`

**Tier / impact:** `tier: polish`, `impact: medium`. **Confidence cap:** none declared as a rubric-level cap — the prompt itself instructs the LLM to lower confidence for sub-questions that need rendering (optical alignment, transition tuning) while keeping it high for sub-questions visible from code (focus states, state coverage, copy tone, keyboard handlers).

**Applies to:** `[component, page]` — polish-details audits cut across both scopes (component-internal focus rings and state coverage; page-level keyboard-tab-order and copy-edge consistency).

**Source citation:** `emil-design-eng#polish-checklist + stripe-press#detail-work` — <https://github.com/emilkowalski/skill/blob/main/skills/emil-design-eng/SKILL.md>

**Prompt** (verbatim from `catalog/rubrics/polish-details.ts`):

> Evaluate the polish details of {target}.
>
> - Are focus states visible, distinct from hover, and consistent across interactive elements — or is `outline: none` shipping with no replacement?
> - Are empty, loading, and error states modelled, or does the component only render the happy path?
> - Are interactive elements optically aligned (icon-to-baseline, glyph-to-button-center) rather than mathematically aligned by bounding box?
> - Are corner radii consistent within their nesting context (outer radius > inner radius by the gap, not arbitrary), or do nested rounded shapes fight each other?
> - Are transitions tuned (not the default `transition: all 0.3s`), including the disabled-vs-enabled flip, the hover settle, and the active press?
> - Is the keyboard story complete — tab order sensible, Escape closes overlays, Enter activates default action, Arrow keys navigate where appropriate?
> - Are the copy edges polished — error messages specific and actionable, empty states inviting rather than dead, button labels in active voice ("Save changes" not "Submit")?
>   Use the 3-axis output model (tier x impact x confidence). Many polish details (focus rings, state coverage, copy tone) are visible from code; some (optical alignment, motion-tuning quality) need rendering. Confidence should drop on the latter in fast/code-only mode.

**Message** (LLM-generated; example shape):

> `Polish details in {target} {finding-specific narrative — e.g., "ship outline: none with no replacement focus ring, transition: all 0.3s on the save button, and a 500-only error banner with no specific guidance"}. {recommendation — e.g., "Add a visible 2px focus ring, scope the transition to color/border only, and rewrite the error to name the failed field and the action to retry"}.`

**Positive example (finding emitted):**

Settings dialog ships with `outline: none` on every interactive element and no replacement focus ring. The "Save" button has a `transition: all 0.3s` so even the cursor-color change wobbles. No empty state — when the list is empty, the dialog shows a flat grey rectangle with the word "Empty." Error case is a red banner reading "Error: failed to save (500)". Outer card radius 16, inner button radius 16, the inner shape protrudes the outer at every corner. No Escape handler.

**Negative example (no finding):**

Stripe payment form — focus ring is a 2px offset indigo outline, distinct from the 1px hover border. Empty state ("No saved cards") invites action with a single ghost CTA; loading state renders a content-matched skeleton, not a spinner; the field-level error sits inline with a specific message ("This card is expired — try another"). Outer card radius is 12, inner button radius is 8, the gap is right. Tab order follows visual order; Escape closes the modal.

**Schema notes:**

- `tier: polish` × `impact: medium` adds the first polish-tier critique rubric to the seed (C001/C002/C004/C005/C006 are all foundational; C003 was polish but flagged as a code-only confidence-capped exception). The CRITIQUE loop now produces findings across both tiers in a single run.
- Pairs naturally with the entire CRAFT-P* polish-pattern family (spring-physics, skeleton-content-matched, stagger-timing) — many polish-details findings will recommend a specific CRAFT-P* pattern as the follow-up POLISH suggestion.
- Pairs naturally with `harness-accessibility`: focus-ring presence is a polish concern AND an a11y concern. When `harness-accessibility` is configured, `A11Y-FOCUS-001`-style findings are deferred from this rubric via the standard overlap resolution (mirrors `CRAFT-C003` × `harness-design` deferral).

### CRAFT-C008–C010 — RESERVED (Phase 2B seed)

Success criterion #7 ships **10 critique rubrics** in the H seed. Phase 0 defined 3 (hierarchy, typography, motion), Phase 1B added 2 more (color-confidence, density-rhythm), Phase 2B (this) added 2 more (restraint, polish-details). The remaining 3 rubrics in the seed are authored during the final Phase 2B widen-to-10 slice. Per the proposal's success criterion #7 enumeration, the remaining seed list is:

| Likely code  | Probable rubric (per success criterion #7 enumeration) |
| ------------ | ------------------------------------------------------ |
| `CRAFT-C008` | Copy voice                                             |
| `CRAFT-C009` | Interaction craft                                      |
| `CRAFT-C010` | Brand coherence                                        |

> **All codes in C008–C010 are RESERVED — to be defined during the final Phase 2B widen-to-10 slice.** See [Reserved-code authoring convention](#reserved-code-authoring-convention).

### CRAFT-C011–C100 — RESERVED (post-seed growth)

Codes C011–C020 are reserved for the H growth trajectory (target: 20 rubrics in 12–24 months) — earned via the contribution format (`contribution/schema.ts`), the signal feedback loop (CRITIQUE-recurrence → pattern proposal), and peer-review promotion of `status: draft` rubrics to `status: stable`.

Codes C021–C100 are long-term reservation. No catalog growth plan commits to filling them; they exist so post-v2 contributors do not need a namespace-extension proposal to land novel rubrics.

> **All codes in C011–C100 are RESERVED — to be defined during post-v1 catalog growth.** See [Reserved-code authoring convention](#reserved-code-authoring-convention).

---

## CRAFT-P\* — Polish findings

### CRAFT-P001 — Spring Physics Micro-interaction

**Catalog entry id:** `pattern-spring-physics`

**Tier / impact:** `tier: polish`, `impact: medium`. Confidence is per-call.

**Applicable to** (pattern-match discriminators from `applicableTo`):

- `{ kind: 'jsx-attribute', match: 'transition' }`
- `{ kind: 'css-property', match: 'transition-timing-function' }`
- `{ kind: 'jsx-attribute', match: 'animate' }`

**Source citation:** `emil-design-eng#spring-physics` — <https://github.com/emilkowalski/skill/blob/main/skills/emil-design-eng/SKILL.md>

**Trigger condition `when`** (from Phase 0 spike):

> Element transitions currently use cubic-bezier easing or any of the CSS keyword timings (ease, ease-in, ease-out, ease-in-out, linear). This produces motion that feels mechanical and ignores the inertia cues real materials give the eye.

**Suggestion `suggest`** (verbatim from Phase 0 spike):

> Replace with spring physics. Recommended starting tuning:
>
> - Primary interactions: stiffness:200 damping:25
> - Secondary interactions: stiffness:300 damping:30
> - Entrances: stiffness:170 damping:26
>
> Use motion library (framer-motion, react-spring, or @react-spring/web) or a CSS spring polyfill. Always pair with `prefers-reduced-motion` fallback to a cross-fade or instantaneous state change.

**Before (positive — finding emitted):**

```css
transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
```

**After (suggestion content):**

```tsx
// Using framer-motion
<motion.div
  animate={{ scale: hovered ? 1.05 : 1 }}
  transition={{ type: 'spring', stiffness: 200, damping: 25 }}
/>
```

**Schema notes:**

- `applicableTo.kind` values exercised here: `jsx-attribute` and `css-property`. Per Phase 0 review observation O2, the schema does **not** enumerate `kind` — it's an open-ended string validated downstream by the pattern matcher.
- Pairs with `CRAFT-C003` (Motion Quality) — many CRITIQUE motion findings recommend this POLISH pattern.

### CRAFT-P002 — Skeleton (Content-Matched)

**Catalog entry id:** `pattern-skeleton-content-matched`

**Tier / impact:** `tier: polish`, `impact: large`. Per Phase 0 spike: `impact: large` is appropriate even though `tier: polish` — the schema allows any tier × impact combination.

**Applicable to** (pattern-match discriminators from `applicableTo`):

- `{ kind: 'component-name', match: 'Spinner' }`
- `{ kind: 'component-name', match: 'Loading' }`
- `{ kind: 'jsx-text', match: 'Loading...' }`

**Source citation:** `linear-app#loading-state` — <https://linear.app>

**Trigger condition `when`** (from Phase 0 spike):

> Loading state is represented by a generic spinner or "Loading..." text that gives no preview of what's about to appear. Eye lands on the spinner, then has to re-orient when content arrives. This punishes the user for waiting.

**Suggestion `suggest`** (verbatim from Phase 0 spike):

> Replace with a content-matched skeleton that mirrors the layout of the about-to-appear content (same row counts, same column widths, same aspect ratios). Use a subtle shimmer (gradient sweep, 1.5s cycle) or a static muted-fill. Skeleton blocks should match the expected text width within ~20% so the layout doesn't reflow on arrival.
>
> Pair with `prefers-reduced-motion` to disable the shimmer animation (fall back to static fill).

**Before (positive — finding emitted):**

```tsx
{
  isLoading && <Spinner />;
}
{
  data && <UserList users={data} />;
}
```

**After (suggestion content):**

```tsx
{
  isLoading && <UserListSkeleton rows={data?.length ?? 5} />;
}
{
  data && <UserList users={data} />;
}

// UserListSkeleton mirrors UserList: same avatar circle, same
// 60%-width name bar, same 40%-width metadata bar per row.
```

**Schema notes:**

- Introduces two novel `kind` values (`component-name`, `jsx-text`) relative to spring-physics. Phase 0 review observation O2 confirms schema remains open on `kind`.
- Cross-references the corresponding exemplar `exemplar-stripe-loading-state` (`CRAFT-B003` benchmark identifier) — BENCHMARK runs against LoadingState components frequently cite this pattern in their `gaps`.

### CRAFT-P003 — Stagger Timing

**Catalog entry id:** `pattern-stagger-timing`

**Tier / impact:** `tier: polish`, `impact: small`. Per Phase 0 spike: `impact: small` deliberately under-rates stagger because in many contexts it is genuinely optional — the schema does not enforce a tier ↔ impact correlation.

**Applicable to** (pattern-match discriminators from `applicableTo`):

- `{ kind: 'jsx-pattern', match: 'list.map(item => <motion.div' }`
- `{ kind: 'css-selector', match: ':nth-child' }`
- `{ kind: 'animation-property', match: 'animation-delay' }`

**Source citation:** `emil-design-eng#stagger` — <https://github.com/emilkowalski/skill/blob/main/skills/emil-design-eng/SKILL.md>

**Trigger condition `when`** (from Phase 0 spike):

> A list of items all animate in simultaneously. The result reads as "everything appeared at once" — the eye gets a single flash with no spatial or temporal information about ordering. This wastes an opportunity to convey hierarchy or directionality.

**Suggestion `suggest`** (verbatim from Phase 0 spike):

> Stagger entrance animations by 30–60ms per item (faster for short lists, slower for ordered/hierarchical lists). For lists of >10 items, cap stagger so total entrance duration stays under 600ms (otherwise the tail of the list feels late). For grid layouts, consider a 2D stagger (diagonal sweep from top-left).
>
> Reverse the stagger direction on exit so the most recently focused items leave last.
>
> Always respect `prefers-reduced-motion` (cross-fade all items simultaneously, no stagger).

**Before (positive — finding emitted):**

```tsx
{
  items.map((item) => (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    />
  ));
}
```

**After (suggestion content):**

```tsx
{
  items.map((item, i) => (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: Math.min(i * 0.04, 0.6),
        type: 'spring',
        stiffness: 200,
        damping: 25,
      }}
    />
  ));
}
```

**Schema notes:**

- Introduces a third novel `kind` value (`jsx-pattern`) — schema remains open-ended on `kind`.
- The `after` block cross-references `pattern-spring-physics` (`CRAFT-P001`). The schema does not currently model pattern-to-pattern dependencies; Phase 0 spike flagged this for future consideration.

### CRAFT-P004–P015 — RESERVED (Phase 1 / Phase 2 seed)

Success criterion #8 ships **15 polish patterns** in the H seed (3 motion + 3 skeleton + 3 typography + 3 interaction + 3 layout). Phase 0 defined 3 (one motion: spring-physics; one skeleton: content-matched skeleton; one motion: stagger-timing). The remaining 12 patterns in the seed must be authored during Phase 1 Stream B (~2 more) and Phase 2 Stream B (~10 final patterns to complete the seed).

Probable bucket assignments within the band:

| Sub-band    | Category    | Patterns to define                                                                                       |
| ----------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| `P004–P005` | Motion      | 2 more motion patterns to complete the 3-motion bucket (P001, P003 already motion; P004/P005 = ?)        |
| `P006–P007` | Skeleton    | 2 more skeleton patterns to complete the 3-skeleton bucket (P002 already content-matched; P006/P007 = ?) |
| `P008–P010` | Typography  | 3 typography polish patterns (modular scale, tabular numerals, display tracking, etc.)                   |
| `P011–P013` | Interaction | 3 interaction polish patterns (hover-state-overlay, focus-ring craft, drag-affordance, etc.)             |
| `P014–P015` | Layout      | 2 of 3 layout polish patterns (density rhythm, vertical rhythm, gestalt grouping, etc.)                  |

The bucket boundaries are guidance only — Phase 2 Stream B authors may rebalance if a category requires more entries than its band reserves.

> **All codes in P004–P015 are RESERVED — to be defined during Phase 1 / Phase 2 catalog work.** See [Reserved-code authoring convention](#reserved-code-authoring-convention).

### CRAFT-P016–P100 — RESERVED (post-seed growth)

Codes P016–P075 are reserved for the H growth trajectory (target: 75 patterns in 12–24 months) — earned via the contribution format, the signal feedback loop (CRITIQUE recurrence ≥5 → pattern proposal at `.harness/design-craft/proposals/`), and peer-review promotion.

Codes P076–P100 are long-term reservation.

> **All codes in P016–P100 are RESERVED — to be defined during post-v1 catalog growth.** See [Reserved-code authoring convention](#reserved-code-authoring-convention).

---

## CRAFT-B\* — Benchmark identifiers

### Benchmark-identifier semantics

The `CRAFT-B*` family differs from `CRAFT-C*` and `CRAFT-P*`:

- A `CRAFT-B*` code does **not** appear inside a CraftFinding. It identifies an entire **BenchmarkScore record** — one BENCHMARK run of one target component against one or more exemplars.
- The code is stable per (target component identity, exemplar set) pair, so re-running BENCHMARK on the same component against the same exemplars produces output keyed by the same `CRAFT-B*` code. This enables fixpoint detection by sub-project #4 (success criterion #34).
- Each `CRAFT-B*` code's record stores: the radar (5 dimensions × score / confidence / notes), the overall (weighted aggregate score + aggregated confidence), the gaps narrative, and the exemplar id(s) cited.
- The Phase 0 spike `benchmark-specimens/empty-state-vs-linear.md` worked one specimen end-to-end and confirmed the schema accepts it without ambiguity, modulo the four observations (O5–O8) flagged as Phase 1 follow-ups.

The radar dimensions are documented in [5-dimension radar (CRAFT-B)](#5-dimension-radar-craft-b) above.

### CRAFT-B001–B005 — anchor benchmark identifiers (seed exemplar set)

The Phase 0 spike produced 3 exemplars and 1 worked benchmark specimen. The anchor `CRAFT-B*` reservations align with the Phase 0 exemplar set so any subsequent BENCHMARK run on these target/exemplar pairs reuses the same code:

| Code         | Anchor exemplar (citation target)                                               | componentType  | Source citation                                                       |
| ------------ | ------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------- |
| `CRAFT-B001` | `exemplar-linear-empty-list`                                                    | EmptyState     | `linear-app` — <https://linear.app/method>                            |
| `CRAFT-B002` | `exemplar-stripe-loading-state`                                                 | LoadingState   | `stripe-checkout` — <https://docs.stripe.com/elements/appearance-api> |
| `CRAFT-B003` | `exemplar-raycast-command-palette`                                              | CommandPalette | `raycast-app` — <https://www.raycast.com>                             |
| `CRAFT-B004` | Reserved — early v1 ErrorState exemplar (Phase 1 Stream B authors will land it) | ErrorState     | RESERVED                                                              |
| `CRAFT-B005` | Reserved — early v1 Modal exemplar (Phase 1 Stream B authors will land it)      | Modal          | RESERVED                                                              |

Phase 0 spike `benchmark-specimens/empty-state-vs-linear.md` is the canonical worked example for `CRAFT-B001`: a hypothetical `MyEmptyState` component scored against `exemplar-linear-empty-list`. The specimen output (overall 64, per-dimension scores 65/70/55/80/50, five gaps narratives) demonstrates the full BenchmarkScore shape and confirms the 3-axis × 5-dim schemas hold together.

Per Phase 0 review observation O4, `componentType` (e.g., `CommandPalette`) is a free string — the v1 seed need not ship every exemplar's component-type, but the schema accepts arbitrary types. Raycast's CommandPalette is retained informally as a v2 candidate; the `CRAFT-B003` anchor code remains reserved for its eventual BENCHMARK target so subsequent benchmark runs reuse this identifier.

### CRAFT-B006–B100 — RESERVED (catalog growth)

Codes B006–B050 are reserved for the seed exemplar set (success criterion #9 — 50 exemplars across 5 component types). Each seed exemplar that becomes a BENCHMARK reference target claims the next free `CRAFT-B*` code in landing order during Phase 1 Stream B and Phase 2 Stream B.

Codes B051–B100 are reserved for the H growth trajectory (target: 400 exemplars in 12–24 months). Most exemplars will never be BENCHMARK targets themselves — they accumulate `citationCount` via being cited in other benchmark runs' `exemplars` field. A `CRAFT-B*` code is allocated only when the exemplar becomes a comparison target in its own right.

> **All codes in B006–B100 are RESERVED — to be defined as benchmark-target exemplars are landed.** See [Reserved-code authoring convention](#reserved-code-authoring-convention).

---

## Exemplar references (used by BENCHMARK runs)

For convenient lookup, the Phase 0 exemplars cited by `CRAFT-B*` anchor identifiers are summarized below. Each exemplar carries `radarReference` integer scores (per-dimension 0–100, no nested confidence/notes — per Phase 0 review observation O5, the schema distinguishes `radarReference: Record<DimensionName, number>` on exemplars from `radar: Record<DimensionName, { score, confidence, notes }>` on BenchmarkScores).

### `exemplar-linear-empty-list` (referenced by `CRAFT-B001`)

- **Component type:** EmptyState
- **URL:** <https://linear.app/method>
- **Source citation:** `linear-app`
- **Radar reference:** philosophicalCoherence 90, hierarchy 95, craftExecution 92, function 95, innovation 70
- **Why exemplar:** Demonstrates the 4-part anatomy (heading + body + visual + action) with restraint. Single CTA respects the user's decision budget. Teaches that "empty" should feel calm and resolved, not anxious or busy.

### `exemplar-stripe-loading-state` (referenced by `CRAFT-B002`)

- **Component type:** LoadingState
- **URL:** <https://stripe.com/payments>
- **Source citation:** `stripe-checkout` — <https://docs.stripe.com/elements/appearance-api>
- **Radar reference:** philosophicalCoherence 88, hierarchy 85, craftExecution 94, function 92, innovation 75
- **Why exemplar:** Demonstrates content-matched skeleton (vs generic spinner) at production quality. Layout preservation between skeleton and loaded state is the high-craft move most competitors miss. Pairs naturally with `CRAFT-P002` (Skeleton Content-Matched).

### `exemplar-raycast-command-palette` (referenced by `CRAFT-B003`)

- **Component type:** CommandPalette
- **URL:** <https://www.raycast.com>
- **Source citation:** `raycast-app`
- **Radar reference:** philosophicalCoherence 95, hierarchy 92, craftExecution 95, function 98, innovation 88
- **Why exemplar:** Canonical reference for keyboard-driven density done right. Proves that "stunning" is not synonymous with "minimal whitespace" but with "every choice intentional."

---

## Reserved-code authoring convention

When filling in a code marked `RESERVED`, follow this checklist:

1. **Claim the next free code in the appropriate family band.**
   - `CRAFT-C*` — next free in C004–C010 for seed completion; C011+ for post-seed growth.
   - `CRAFT-P*` — next free in P004–P015 for seed completion; P016+ for post-seed growth.
   - `CRAFT-B*` — next free in B004–B005 for early v1 exemplars; B006+ as additional seed exemplars become benchmark targets.
2. **Author the catalog entry** in `packages/cli/src/skills/harness-design-craft/src/catalog/rubrics/{slug}.yaml`, `catalog/patterns/{slug}.yaml`, or `catalog/exemplars/{slug}.yaml`.
3. **Pick `tier`, `impact`, `appliesTo` / `applicableTo`** per the schema. For C entries, `tier` defaults to `foundational` only for craft moves that elevate baseline quality across most projects (hierarchy, typography, restraint). Motion / skeleton / advanced rubrics default to `tier: polish`. For P entries, the `findingTemplate.tier` reflects whether the pattern is structural (`foundational`) or elevating (`polish` / `aspirational`).
4. **Cite the source** with one of the published prefixes (see [Source citation prefixes](#source-citation-prefixes)). Adding a new prefix requires updating this table AND the contribution schema validator.
5. **For C entries** author the prompt as a focused 4–7 bullet list. The prompt MUST instruct the LLM to use the 3-axis output model and to be honest about confidence.
6. **For P entries** author the `applicableTo` discriminators (open-ended `kind` strings + a `match` token) AND the `when` / `suggest` / `before` / `after` blocks. The before/after sketches must show the actual code transformation.
7. **For B entries** the catalog entry is an `exemplar` (in `catalog/exemplars/`), not a finding. The `CRAFT-B*` code is allocated only when the exemplar becomes a BENCHMARK target in its own right (not just a citation source in other benchmark runs). Most exemplars accumulate `citationCount` without ever needing their own `CRAFT-B*` code.
8. **Author fixtures** under `tests/fixtures/{rubrics|patterns|exemplars}/{slug}/`. Per success criterion #1–#3, every defined rubric / pattern needs a positive fixture that emits the finding and a negative fixture that does not.
9. **Validate against contribution schema** — the new entry must pass `contribution/schema.ts` validation (success criterion #11). Include peer-review notes per `contribution.md`.
10. **Write the entry in this file** following the [entry format](#entry-format). Replace the `RESERVED` placeholder paragraph with the full entry. Keep entries in numerical order.
11. **Update the table of contents** at the top of this file to add the entry's anchor.
12. **Watch for cross-references** — many CRITIQUE rubrics (e.g., `CRAFT-C003` Motion Quality) recommend specific POLISH patterns (`CRAFT-P001` Spring Physics) as fixes. Cross-link in the entry's Schema Notes.
13. **Confirm honest confidence** — for rubrics that depend on visual rendering, document the `mode: fast` confidence ceiling explicitly in the prompt (the `CRAFT-C003` Motion Quality rubric is the prototype here).

---

## Cross-references

- **Proposal:** [`docs/changes/design-pipeline/design-craft-elevator/proposal.md`](./proposal.md) — Decisions #1–#7, Success Criteria, Implementation Order, ADR rationale
- **Phase 0 schema spike artifacts:** [`docs/changes/design-pipeline/design-craft-elevator/phase-0-schema-spike/`](./phase-0-schema-spike/) — the 10 paper artifacts that source the defined entries above (3 rubrics, 3 patterns, 3 exemplars, 1 benchmark specimen)
- **Phase 0 schema-fit review:** [`docs/changes/design-pipeline/design-craft-elevator/phase-0-schema-spike/review.md`](./phase-0-schema-spike/review.md) — documents the 8 non-blocking observations (O1–O8) referenced throughout this file
- **Implementation plan:** [`docs/changes/design-pipeline/design-craft-elevator/plans/2026-05-23-design-craft-elevator-plan.md`](./plans/2026-05-23-design-craft-elevator-plan.md)
- **ADRs (to be filed in Phase 4):**
  - **ADR-004** — LLM-judgment-based skill pattern (first LLM-judgment skill in harness)
  - **ADR-005** — 3-axis craft output model (tier × impact × confidence) — codifies the output vocabulary documented in [Output models](#output-models)
  - **ADR-006** — Living catalog with growth infrastructure (the H pattern)
  - **ADR-007** — Detect-and-offer progressive upgrade pattern (the B' pattern)
- **Related skills:**
  - `harness-design` (declared-anti-pattern enforcement) — owns deferred CRITIQUE findings via i18n-style overlap deferral; success criterion #19
  - `audit-component-anatomy` (sub-project #2) — owns structural anatomy findings (`ANAT-D*` / `ANAT-P*`); see its [`finding-codes.md`](../audit-component-anatomy/finding-codes.md)
- **Contribution and growth:**
  - `docs/changes/design-pipeline/design-craft-elevator/contribution.md` (to be authored Phase 4) — contribution format for new rubrics / patterns / exemplars
  - `docs/changes/design-pipeline/design-craft-elevator/growth-trajectory.md` (to be authored Phase 4) — long-term catalog growth model: seed → 20+75+400 over 12–24 months; signal-loop mechanics
