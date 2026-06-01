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
  - [CRAFT-C008 — Copy Voice](#craft-c008--copy-voice)
  - [CRAFT-C009 — Interaction Craft](#craft-c009--interaction-craft)
  - [CRAFT-C010 — Brand Coherence](#craft-c010--brand-coherence)
  - [CRAFT-C011–C100 — RESERVED (post-seed growth)](#craft-c011c100--reserved-post-seed-growth)
- [CRAFT-P\* — Polish findings](#craft-p--polish-findings)
  - [CRAFT-P001 — Spring Physics Micro-interaction](#craft-p001--spring-physics-micro-interaction)
  - [CRAFT-P002 — Skeleton (Content-Matched)](#craft-p002--skeleton-content-matched)
  - [CRAFT-P003 — Stagger Timing](#craft-p003--stagger-timing)
  - [CRAFT-P004 — Page Transition Crossfade](#craft-p004--page-transition-crossfade)
  - [CRAFT-P005 — Fluid Type Scale](#craft-p005--fluid-type-scale)
  - [CRAFT-P006 — Progressive Corner Rounding](#craft-p006--progressive-corner-rounding)
  - [CRAFT-P007 — Focus Ring Craft](#craft-p007--focus-ring-craft)
  - [CRAFT-P008–P015 — RESERVED (Phase 2 seed completion)](#craft-p008p015--reserved-phase-2-seed-completion)
  - [CRAFT-P016–P100 — RESERVED (post-seed growth)](#craft-p016p100--reserved-post-seed-growth)
- [CRAFT-B\* — Benchmark identifiers](#craft-b--benchmark-identifiers)
  - [Benchmark-identifier semantics](#benchmark-identifier-semantics)
  - [CRAFT-B001–B006 — anchor benchmark identifiers (seed exemplar set)](#craft-b001b006--anchor-benchmark-identifiers-seed-exemplar-set)
  - [CRAFT-B007–B050 — RESERVED (seed exemplar set growth)](#craft-b007b050--reserved-seed-exemplar-set-growth)
  - [CRAFT-B051–B100 — RESERVED (post-seed growth)](#craft-b051b100--reserved-post-seed-growth)
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

| Range       | Phase landed     | Status (v1)                                                                                                                          |
| ----------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `C001–C003` | Phase 2 (PR 431) | Shipped (hierarchy, typography, motion — wired into `SEED_RUBRICS`).                                                                 |
| `C004–C005` | Phase 1B         | Shipped (color-confidence, density-rhythm — completes the half-seed of 5 rubrics required by the Phase 1B exit criterion).           |
| `C006–C007` | Phase 2B         | Shipped (restraint, polish-details — first pair of the Phase 2B widen-to-10 set; bridges foundational and polish tiers in the loop). |
| `C008–C010` | Phase 2C (this)  | Shipped (copy-voice, interaction-craft, brand-coherence — closes the v1 seed at success criterion #7's target of 10 rubrics).        |
| `C011–C020` | Post-v1          | Reserved for the H growth trajectory (target: 20 rubrics in 12–24 months).                                                           |
| `C021–C100` | Long-term        | Reserved for community contribution + signal-loop proposals.                                                                         |

**CRAFT-P (polish patterns):**

| Range       | Phase landed     | Status (v1)                                                                                                                                                                                                             |
| ----------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P001`      | Phase 2 (PR 431) | Shipped (spring-physics — wired into `SEED_PATTERNS`).                                                                                                                                                                  |
| `P002–P003` | Phase 2          | Shipped (skeleton-content-matched, stagger-timing — wired into `SEED_PATTERNS` from Phase 0 spike artifacts).                                                                                                           |
| `P004–P005` | Phase 2          | Shipped (page-transition-crossfade closes the motion sub-category to 3; fluid-type-scale opens the typography sub-category — adds the first foundational-tier polish pattern to the seed).                              |
| `P006–P007` | Phase 2 (this)   | Shipped (progressive-corner-rounding opens the layout sub-category; focus-ring-craft opens the interaction sub-category — adds the second foundational-tier polish pattern to the seed alongside `CRAFT-P004`).         |
| `P008–P015` | Phase 2          | Reserved for seed catalog completion (success criterion #8 lists 15 patterns — 3 motion + 3 skeleton + 3 typography + 3 interaction + 3 layout; 2 skeleton + 2 typography + 2 more interaction + 2 more layout remain). |
| `P016–P075` | Post-v1          | Reserved for the H growth trajectory (target: 75 patterns in 12–24 months).                                                                                                                                             |
| `P076–P100` | Long-term        | Reserved for community contribution + signal-loop proposals.                                                                                                                                                            |

**CRAFT-B (benchmark identifiers):**

| Range       | Phase landed     | Status (v1)                                                                                                                                                                                                                                                     |
| ----------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `B001`      | Phase 2 (PR 431) | Shipped (linear-empty-list — wired into `SEED_EXEMPLARS`).                                                                                                                                                                                                      |
| `B002–B003` | Phase 2          | Shipped (stripe-loading-state, raycast-command-palette — wired into `SEED_EXEMPLARS` from Phase 0 spike artifacts).                                                                                                                                             |
| `B004–B005` | Phase 2          | Shipped (vercel-error-state, linear-issue-modal — extends the early v1 anchor set to cover ErrorState and Modal componentTypes).                                                                                                                                |
| `B006`      | Phase 2 (this)   | Shipped (stripe-pay-button — claims the Button componentType anchor and completes the five canonical componentTypes the spec calls out for the 50-exemplar plan: EmptyState / LoadingState / ErrorState / Modal / Button + the informal CommandPalette anchor). |
| `B007–B050` | Phase 1–2        | Reserved for seed exemplar set growth (success criterion #9 lists 50 exemplars across 5 types — horizontal growth from the six anchors above).                                                                                                                  |
| `B051–B100` | Post-v1          | Reserved for catalog growth (target: 400 exemplars in 12–24 months).                                                                                                                                                                                            |

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

| Prefix                      | Authority                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `huashu-design#`            | huashu-design (REFERENCES.md #4) — the seed source for the 5-dim radar model.                                    |
| `vercel-geist#`             | Vercel's Geist design system — public, comprehensive, frequently cited.                                          |
| `emil-design-eng#`          | emilkowalski/skill (REFERENCES.md) — the working reference on motion design craft.                               |
| `linear-app`                | Linear product surface — exemplar source for restrained empty/loading states + issue-detail Modal anchor.        |
| `stripe-checkout`           | Stripe checkout surface — exemplar source for production-quality skeletons.                                      |
| `raycast-app`               | Raycast product surface — exemplar source for keyboard-driven density.                                           |
| `vercel-geist#error-state`  | Vercel deploy/build error surface — exemplar source for the ErrorState anchor (calm-and-forensic over alarming). |
| `design-component-anatomy/` | Internal harness knowledge skill (shared with sub-project #2's audit).                                           |

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

### CRAFT-C008 — Copy Voice

**Catalog entry id:** `rubric-copy-voice`

**Tier / impact:** `tier: polish`, `impact: medium`. **Confidence cap:** none declared as a rubric-level cap — copy reads fully from code (string literals, JSX text nodes, i18n keys), so the prompt instructs the LLM to keep confidence high in fast/code-only mode for surfaces whose copy is colocated and lower it only when strings live in an external locale bundle the model cannot see.

**Applies to:** `[component, page]` — voice quality is evaluated at the component scope for buttons / labels / inline errors and at the page scope for cross-surface tone consistency.

**Source citation:** `refactoring-ui#voice + nicely-said#tone` — <https://www.refactoringui.com/>

**Prompt** (verbatim from `catalog/rubrics/copy-voice.ts`):

> Evaluate the copy voice of {target}.
>
> - Are button labels written in active voice with a verb that names the outcome ("Save changes", "Send invite") rather than generic acknowledgements ("OK", "Submit", "Continue") that hide the action?
> - Are error messages specific and recovery-oriented ("This email is already in use — sign in instead?") rather than blame-shaped ("Error: invalid input", "Something went wrong") that leave the user nowhere to go?
> - Are empty states inviting and forward-looking ("Start your first project") rather than dead-end declarations ("No items.")?
> - Is helper / placeholder text doing work the label should do, or vice-versa (a label that says "Email" with placeholder "Enter your email" is two labels for one field)?
> - Does the voice stay consistent across happy / loading / empty / error states, or does it shift register (warm onboarding → terse errors → corporate compliance footer)?
> - Are there marketing-deck phrases ("unlock", "supercharge", "seamless", "next-gen") leaking into the product surface where the user just wants to do their task?
>   Use the 3-axis output model (tier x impact x confidence).

**Message** (LLM-generated; example shape):

> `Copy voice in {target} {finding-specific narrative — e.g., "ships generic 'Submit' / 'OK' button labels, an 'Error: failed (500)' toast that names neither the failure nor the recovery, and a 'No items.' empty state that closes off the next step"}. {recommendation — e.g., "Rewrite buttons as verb + outcome, errors as specific cause + actionable recovery, and the empty state as an invitation to the first action"}.`

**Positive example (finding emitted):**

SaaS settings page — every primary CTA reads "Submit"; the empty projects view says "No projects."; the error toast on a 500 says "Error: failed to save (500)". A "Pro Tip!" callout near the top reads "Unlock the full power of next-gen workflows with our supercharged AI." None of the strings tell the user what to do next; none of them sound like the same product wrote them.

**Negative example (no finding):**

Stripe Connect onboarding — buttons read "Continue to verification" and "Save and exit" (verb + outcome, never "Submit"). The empty payouts table greets you with "You haven't received any payouts yet — your first will appear here once a charge clears." Error on a rejected card: "This card was declined by the issuer. Try a different card or contact your bank." Voice stays warm-direct across every state.

**Schema notes:**

- `tier: polish` × `impact: medium` joins `CRAFT-C007` (polish-details) in the polish-medium band — both are seam-sanding rubrics where the foundation is right but the finish carries the experience.
- Pairs naturally with `harness-design` brand-voice declarations: when DESIGN.md ships a `voice.forbidden_phrases` list, audit-brand-compliance flags those phrases via `BRAND-V001`; this rubric catches the upstream craft question (does the voice feel like the same product?) that the declared rule list cannot ask. Findings are not deferred — they critique different planes.

### CRAFT-C009 — Interaction Craft

**Catalog entry id:** `rubric-interaction-craft`

**Tier / impact:** `tier: polish`, `impact: large`. **Confidence cap:** none declared as a rubric-level cap — the prompt itself instructs the LLM to lower confidence for sub-questions that need rendering (hover-to-press timing, optimistic UI feel, gesture mapping) while keeping it high for sub-questions visible from code (keyDown handlers, autoFocus, aria-\*, optimistic-mutation patterns).

**Applies to:** `[component, page]` — interaction craft cuts across both scopes (component-level keyboard / hover / press behavior; page-level cross-component navigation rhythm).

**Source citation:** `emil-design-eng#interaction + raycast#keyboard-quality` — <https://github.com/emilkowalski/skill/blob/main/skills/emil-design-eng/SKILL.md>

**Prompt** (verbatim from `catalog/rubrics/interaction-craft.ts`):

> Evaluate the interaction craft of {target}.
>
> - Is the keyboard story first-class — is every interactive surface reachable, does Enter activate the default action, does Escape cancel where it should, do Arrow keys traverse what they should traverse — or is the keyboard an afterthought handled only by the browser default?
> - Are mutations optimistic where the outcome is near-certain (favorite toggle, mark-read, rename) so the surface feels responsive, with graceful rollback on failure — or does every interaction round-trip through a spinner?
> - Does the surface anticipate the next input — autofocus on the field the user will type next, pre-select the most likely option, surface the keyboard shortcut next to the action — or does the user navigate every step manually?
> - Are hover / active / pressed states distinct from focus and from each other, with motion that maps to the gesture (settle on release, lift on hover) rather than a single instant color swap?
> - Are destructive actions guarded with the right friction — confirm for irreversible, undo banner for reversible, immediate for trivial — or is every destructive action gated by a modal regardless of blast radius?
> - Does the surface handle the in-between states gracefully — pending, partial-success, retry-in-progress — or does it show only success and failure?
>   Use the 3-axis output model (tier x impact x confidence). Some interaction craft reads from code (keyDown handlers, autoFocus, aria-\*) but much of it (hover-to-press timing, optimistic UI feel, gesture mapping) needs rendering.

**Message** (LLM-generated; example shape):

> `Interaction craft in {target} {finding-specific narrative — e.g., "has no Escape handler on the dialog, every save round-trips through a 500ms spinner even for local-only edits, and the delete action is gated by a modal regardless of whether the item is recoverable"}. {recommendation — e.g., "Wire Escape to close, mark local edits as optimistic with inline rollback, and tier the destructive friction: confirm-modal for irreversible, undo-banner for reversible"}.`

**Positive example (finding emitted):**

Settings dialog where the "Delete account" button opens a modal with another "Delete account" button that opens another confirm with a checkbox; Tab traversal skips the cancel button; Escape does nothing; Enter on the username field submits the form even though the user is mid-edit. Every save action shows a 500ms spinner even when the change is local-only. No keyboard shortcuts anywhere.

**Negative example (no finding):**

Raycast command palette — every action ships with its shortcut rendered to the right of the row; Enter activates, Escape closes, Arrow keys traverse, Tab cycles sections. Favorite toggle is optimistic with an inline rollback on failure. The text field autofocuses on open; the most recent command pre-selects. Hover lifts the row a hair; press settles it; release runs the action.

**Schema notes:**

- `tier: polish` × `impact: large` is the first polish-large rubric in the seed alongside `CRAFT-C002` (typography-craft) and `CRAFT-C005` (density-rhythm). Three polish-large rubrics asking different questions (typography, density, interaction) gives the loop meaningful coverage of the polish-tier ceiling.
- Pairs naturally with `harness-accessibility`: the keyboard sub-questions overlap directly with WCAG 2.1 keyboard-operable criteria. When `harness-accessibility` is configured, `A11Y-KBD-*`-style findings are deferred from this rubric via the standard overlap resolution (mirrors `CRAFT-C003` × `harness-design` deferral).

### CRAFT-C010 — Brand Coherence

**Catalog entry id:** `rubric-brand-coherence`

**Tier / impact:** `tier: foundational`, `impact: large`. **Confidence cap:** none declared as a rubric-level cap — the prompt itself instructs the LLM to anchor fast-mode judgments on token usage and component composition (visible from code) and reserve full visual-rhythm and motion-character judgments for deep-mode runs.

**Applies to:** `[component, page]` — brand coherence is most legible at the page scope (cross-region visual rhythm) but component-level token usage / icon-library imports are early signals.

**Source citation:** `stripe-press#consistency + linear-brand#presence` — <https://stripe.press/>

**Prompt** (verbatim from `catalog/rubrics/brand-coherence.ts`):

> Evaluate the brand coherence of {target}.
>
> - Does the surface read like the same product family as the company's other surfaces (marketing, docs, dashboard, mobile) — same typographic register, same color personality, same density rhythm — or does it feel like a different team shipped it?
> - Is the visual identity load-bearing (color used to mean something, typography setting a tone, motion expressing a character) or is it generic-template tier where any logo would fit in the corner?
> - Does interactive moment-by-moment feel match the brand — playful surfaces use playful motion, serious surfaces use restrained motion — or is the motion library a default with no point of view?
> - Are the visual flourishes that DO appear (illustrations, icons, accent shapes) drawn from a coherent system, or do they feel like stock pieces assembled from different libraries?
> - If someone screenshotted this surface with the logo removed, would another team in the company recognize it as theirs?
> - Is the surface confident about its identity (committing to a point of view) or does it hedge with generic-modern-SaaS choices to avoid alienating anyone?
>   Use the 3-axis output model (tier x impact x confidence).

**Message** (LLM-generated; example shape):

> `Brand coherence in {target} {finding-specific narrative — e.g., "imports a different icon library than the rest of the product, defaults to the system font where every other surface uses the custom display face, and reaches for stock illustration above the section header"}. {recommendation — e.g., "Replace the icon library with the in-product set, route typography through the existing font stack tokens, and commission a custom illustration in the product's drawing register"}.`

**Positive example (finding emitted):**

A startup's in-product billing page that imports a different icon library than the rest of the app, uses a system font where every other surface uses the custom display face, lays out cards in a three-column grid where the rest of the product uses generous single-column flows, and reaches for a stock illustration of two people high-fiving above the "Plans" header. The screenshot, logo removed, could belong to any of a hundred companies.

**Negative example (no finding):**

Linear settings page — same typographic scale as the issue view, same restrained motion library (no easter-egg flourishes), same monochromatic palette with the single brand accent reserved for the active row. Icons are drawn from the same custom set as the rest of the product. With the logo removed, a Linear user would still know it was Linear from the first glance.

**Schema notes:**

- `tier: foundational` × `impact: large` joins `CRAFT-C001` (hierarchy), `CRAFT-C004` (color-confidence), and `CRAFT-C006` (restraint) in the foundational-large band. Four foundational-large rubrics asking different questions (hierarchy, color, restraint, brand) gives the CRITIQUE loop saturated coverage of the structural craft floor — a surface that passes all four has the identity question settled.
- Pairs naturally with `audit-brand-compliance` (sub-project #3 — declared brand-token / forbidden-phrase enforcement). When that skill is configured and emits `BRAND-T001` or `BRAND-V001` findings, those findings are deferred from this rubric via the i18n-style overlap resolution. This rubric still emits findings on the upstream craft question (does the surface feel like the same product?) that the declared rule list cannot ask.

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

### CRAFT-P004 — Page Transition Crossfade

**Catalog entry id:** `pattern-page-transition-crossfade`

**Tier / impact:** `tier: foundational`, `impact: medium`. The first foundational-tier pattern in the polish seed — the absence of a route transition is felt as a craft defect (the SPA feels "snappy" but cheap), so the tier reads as foundational even though the move itself is a finishing touch.

**Applicable to** (pattern-match discriminators from `applicableTo`):

- `{ kind: 'jsx-pattern', match: 'AnimatePresence' }`
- `{ kind: 'identifier', match: 'usePathname' }`
- `{ kind: 'identifier', match: 'useRouter' }`
- `{ kind: 'css-property', match: 'view-transition-name' }`

**Source citation:** `vercel-geist#page-transition` — <https://vercel.com/geist/motion>

**Trigger condition `when`:**

> Route changes swap the current page for the next with no visual continuity. The eye reads the change as a hard reload — even on a SPA — because the only signal is "old DOM gone, new DOM here." This breaks the illusion that the user is navigating one continuous surface and makes the product feel like a stack of disconnected pages.

**Suggestion `suggest`:**

> Wrap the route outlet in a brief opacity crossfade. Recommended timing:
>
> - Outgoing page: ~80ms fade-out, ease-out
> - Incoming page: ~120ms fade-in, ease-out, starting after the outgoing fade resolves (total transition budget ~200ms)
>
> Pair with the native CSS view-transitions API where browser support allows; fall back to AnimatePresence (framer-motion) or a CSS class-swap with a transition. Always pair with `prefers-reduced-motion`: skip the fade and swap instantly when the user has motion-sensitivity preferences set. Avoid combining the crossfade with simultaneous content motion (stagger, spring entrances) on the incoming page — the crossfade is the route signal; content-level motion comes after.

**Before (positive — finding emitted):**

```tsx
// Next.js app router — Layout.tsx (no transition between routes)
export default function Layout({ children }: { children: ReactNode }) {
  return <main>{children}</main>;
}
```

**After (suggestion content):**

```tsx
// Using framer-motion AnimatePresence + the route pathname as key
import { AnimatePresence, motion } from 'framer-motion';
import { usePathname } from 'next/navigation';

export default function Layout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.main
        key={pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12, ease: 'easeOut' }}
      >
        {children}
      </motion.main>
    </AnimatePresence>
  );
}
```

**Schema notes:**

- `tier: foundational` × `impact: medium` is a new tier × impact cell for the polish seed — joins `CRAFT-P001` (polish × medium), `CRAFT-P002` (polish × large), `CRAFT-P003` (polish × small), and `CRAFT-P005` (polish × large) in proving the catalogue's tier × impact independence (Phase 0 review observation O3).
- Closes the v1 motion sub-category at 3 patterns (P001 spring-physics, P003 stagger-timing, P004 page-transition-crossfade) per success criterion #8.
- Pairs naturally with `CRAFT-C003` (Motion Quality) — many CRITIQUE motion findings on missing route transitions will recommend this POLISH pattern.

### CRAFT-P005 — Fluid Type Scale

**Catalog entry id:** `pattern-fluid-type-scale`

**Tier / impact:** `tier: polish`, `impact: large`. Fluid type elevates every page with typographic hierarchy, so impact reads as large even though the tier stays `polish` (a project with a fixed type scale is not broken, just unrefined).

**Applicable to** (pattern-match discriminators from `applicableTo`):

- `{ kind: 'css-property', match: 'font-size' }`
- `{ kind: 'tailwind-class', match: 'text-' }`
- `{ kind: 'identifier', match: 'fontSize' }`
- `{ kind: 'css-at-rule', match: 'media' }`

**Source citation:** `vercel-geist#typography` — <https://vercel.com/geist/typography>

**Trigger condition `when`:**

> Typographic scale is defined as a fixed sequence of font-size values (e.g., 14 / 16 / 18 / 24 / 32) and breakpoint-stepped via media queries or Tailwind responsive variants (text-sm md:text-base lg:text-lg). Between breakpoints the type "jumps" — a 1280px viewport gets the desktop size, a 1279px viewport gets the tablet size, with no interpolation. Headlines feel undersized on wide screens and oversized on narrow ones.

**Suggestion `suggest`:**

> Replace stepped sizes with a fluid clamp() scale that interpolates between min and max across a calibrated viewport range. Formula:
>
> ```
> font-size: clamp(<min>, <preferred>, <max>);
> ```
>
> where `<preferred>` is a linear combination of `vi` (viewport inline) and `rem` calibrated to hit `<min>` at your narrow audience viewport (e.g., 360px) and `<max>` at your wide audience viewport (e.g., 1280px).
>
> Use a utility (e.g., utopia.fyi, the Geist `fluid()` helper, or a CSS variable per scale step) so the formula is calculated, not guessed. Pair with `text-wrap: balance` on headings and `text-wrap: pretty` on body for the matching wrap-quality move.

**Before (positive — finding emitted):**

```css
/* CSS — fixed scale, breakpoint-stepped */
.title {
  font-size: 1.5rem;
}
@media (min-width: 768px) {
  .title {
    font-size: 2rem;
  }
}
@media (min-width: 1280px) {
  .title {
    font-size: 2.5rem;
  }
}
```

**After (suggestion content):**

```css
/* CSS — fluid scale calibrated for 360px–1280px audience */
.title {
  /* clamp(min, preferred, max) — preferred interpolates linearly */
  font-size: clamp(1.5rem, 0.93rem + 1.79vi, 2.5rem);
  text-wrap: balance;
}

/* Tailwind v4 equivalent using arbitrary value */
/* <h1 className="text-[clamp(1.5rem,0.93rem+1.79vi,2.5rem)] text-balance"> */
```

**Schema notes:**

- Introduces two novel `kind` values (`tailwind-class`, `css-at-rule`) relative to the prior four patterns. Phase 0 review observation O2 confirms schema remains open on `kind`.
- Opens the typography sub-category of the polish seed — P008 + P010 will land in subsequent slices to complete the 3-typography target per success criterion #8.
- Pairs naturally with `CRAFT-C002` (Typography Craft) — CRITIQUE findings on typographic scale frequently recommend this POLISH pattern as the elevation move.

### CRAFT-P006 — Progressive Corner Rounding

**Catalog entry id:** `pattern-progressive-corner-rounding`

**Tier / impact:** `tier: polish`, `impact: small`. Progressive rounding is a craft elevator that compounds across every nested surface in the product — easy to ship and easy to dismiss in isolation, which is exactly the profile of a small-impact polish move. The LLM may upgrade impact when a target nests many rounded surfaces (a settings panel, a card-in-card layout) where the violation reads across the whole region rather than at one corner.

**Applicable to** (pattern-match discriminators from `applicableTo`):

- `{ kind: 'css-property', match: 'border-radius' }`
- `{ kind: 'jsx-attribute', match: 'borderRadius' }`
- `{ kind: 'css-variable', match: '--radius' }`

**Source citation:** `emil-design-eng#progressive-rounding` — <https://github.com/emilkowalski/skill/blob/main/skills/emil-design-eng/SKILL.md>

**Trigger condition `when`:**

> A rounded child sits inside a rounded parent with the same (or larger) corner radius as the parent. The eye reads a visible halo between the two corner arcs because they fail to share a common centre. Common failure mode: a `rounded-xl` card containing a `rounded-xl` inner panel; the inner corner protrudes past the outer one.

**Suggestion `suggest`:**

> Compute the child radius as `parentRadius - gap`, where `gap` is the padding between the parent edge and the child edge. The resulting corners are concentric — the inner curve tracks the outer curve and the eye reads one nested shape, not two unrelated rounded rectangles.
>
> When the gap exceeds the parent radius the child should be square (`borderRadius: 0`); a positive radius below the gap is worse than no rounding because it telegraphs the mismatch.
>
> Pair with a single radius scale (`--radius-sm`, `--radius-md`, `--radius-lg`) so the chain stays consistent as the design system grows.

**Before (positive — finding emitted):**

```tsx
<div className="p-3 rounded-xl bg-surface-1">
  <div className="p-3 rounded-xl bg-surface-2">
    {/* inner corner protrudes past the outer corner */}
  </div>
</div>
```

**After (suggestion content):**

```tsx
// Outer radius 12px, padding 12px → inner radius 0
// (gap equals parent radius — square the child).
<div className="p-3 rounded-xl bg-surface-1">
  <div className="p-3 rounded-none bg-surface-2">
    {/* corners are concentric (or square when gap >= radius) */}
  </div>
</div>;

// Or, when padding is smaller than the parent radius:
// outer 12px, padding 4px → inner 8px.
<div style={{ padding: 4, borderRadius: 12 }}>
  <div style={{ borderRadius: 8 }} />
</div>;
```

**Schema notes:**

- Opens the layout sub-category of the v1 seed at `tier: polish` × `impact: small` — matches `CRAFT-P003` (stagger-timing) on the polish × small cell and confirms the cell is reachable across multiple sub-categories.
- Introduces a fourth `applicableTo.kind` value (`css-variable`) alongside `css-property`, `jsx-attribute`, `component-name`, `jsx-text`, `jsx-pattern`, `css-selector`, and `animation-property` from earlier patterns. Schema remains intentionally open on `kind` (Phase 0 review O7).
- Pairs naturally with `CRAFT-C005` (Density & Rhythm) — many rhythm critiques on nested cards will recommend this pattern as the concrete elevation move.

### CRAFT-P007 — Focus Ring Craft

**Catalog entry id:** `pattern-focus-ring-craft`

**Tier / impact:** `tier: foundational`, `impact: large`. Keyboard focus visibility is non-negotiable (WCAG 2.4.7 Level AA) so a missing or invisible ring is a foundational defect, not a polish nicety. The pattern still lives in the CRAFT-P namespace because the elevation move — accent token + offset + halo — is judgment-bound, not enforceable by `:focus-visible { outline: 0 }` greps alone.

**Applicable to** (pattern-match discriminators from `applicableTo`):

- `{ kind: 'css-property', match: 'outline' }`
- `{ kind: 'css-property', match: 'box-shadow' }`
- `{ kind: 'css-pseudo-class', match: ':focus' }`
- `{ kind: 'css-pseudo-class', match: ':focus-visible' }`
- `{ kind: 'jsx-attribute', match: 'focusVisibleRing' }`

**Source citation:** `emil-design-eng#focus-ring` — <https://github.com/emilkowalski/skill/blob/main/skills/emil-design-eng/SKILL.md>

**Trigger condition `when`:**

> Focus styling is missing (`outline: none` without a replacement), relies on the browser default (1–2px solid ring that ignores brand tokens), or uses the same accent as the resting state (no visible transition on focus). Keyboard users either see nothing or see a ring that reads as a leftover from the OS, not part of the product.

**Suggestion `suggest`:**

> Build the ring from three layers:
>
> 1. A 2–3px solid stroke in the brand accent token (`--color-accent-focus`), NOT the default browser blue.
> 2. An offset of 2–3px (`outline-offset` or a second box-shadow layer) so the ring floats off the element instead of cropping its corners.
> 3. A soft halo (8–12px box-shadow at 20–30% opacity of the accent) so the ring reads on busy or low-contrast backgrounds.
>
> Always pair with `:focus-visible` (not bare `:focus`) so pointer users do not see the ring on click. Respect `prefers-reduced-motion` by skipping the spring/scale on focus-in and crossfading the ring opacity instead.
>
> Never ship `outline: 0` (or `outline: none`) without a replacement — the bare reset is the single most common craft + a11y regression.

**Before (positive — finding emitted):**

```css
button:focus {
  outline: none;
}

/* or, worse: */
button:focus {
  outline: 1px solid Highlight;
}
```

**After (suggestion content):**

```css
button:focus-visible {
  outline: 2px solid var(--color-accent-focus);
  outline-offset: 2px;
  box-shadow: 0 0 0 6px rgb(from var(--color-accent-focus) r g b / 0.24);
  transition: box-shadow 120ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  button:focus-visible {
    transition: none;
  }
}
```

**Schema notes:**

- Opens the interaction sub-category of the v1 seed at `tier: foundational` × `impact: large`. Together with `CRAFT-P004` page-transition-crossfade (foundational × medium), the seed now reaches the foundational tier from two distinct sub-categories — proving the catalog's tier × sub-category independence.
- Introduces a fifth `applicableTo.kind` value (`css-pseudo-class`). Schema remains intentionally open on `kind` (Phase 0 review O7).
- Pairs naturally with `CRAFT-C009` (Interaction Craft) — many interaction critiques will flag the OS-default-looking focus state symptomatically; this pattern is the concrete elevation.
- Composes with `harness-accessibility` (WCAG 2.4.7) rather than overlapping it: the a11y verifier asserts a focus indicator exists at all; this pattern asserts the indicator reads as part of the product.

### CRAFT-P008–P015 — RESERVED (Phase 2 seed completion)

Success criterion #8 ships **15 polish patterns** in the H seed (3 motion + 3 skeleton + 3 typography + 3 interaction + 3 layout). Phase 0 + Phase 2 increments have so far shipped 7: motion is complete at 3 (P001 spring-physics, P003 stagger-timing, P004 page-transition-crossfade), and the remaining four sub-categories are each opened by a single pattern (P002 skeleton-content-matched, P005 fluid-type-scale, P006 progressive-corner-rounding, P007 focus-ring-craft). The remaining 8 patterns in the seed are authored during the remaining Phase 2 Stream B increments.

Probable bucket assignments within the band (revised after the layout / interaction opens in this increment):

| Sub-band    | Category    | Patterns to define                                                                                 |
| ----------- | ----------- | -------------------------------------------------------------------------------------------------- |
| `P008–P009` | Skeleton    | 2 more skeleton patterns to complete the 3-skeleton bucket (P002 already content-matched).         |
| `P010–P011` | Typography  | 2 more typography patterns to complete the 3-typography bucket (P005 already fluid-type-scale).    |
| `P012–P013` | Interaction | 2 more interaction patterns to complete the 3-interaction bucket (P007 already focus-ring-craft).  |
| `P014–P015` | Layout      | 2 more layout patterns to complete the 3-layout bucket (P006 already progressive-corner-rounding). |

The bucket boundaries are guidance only — subsequent slices may rebalance if a category requires more entries than its band reserves.

> **All codes in P008–P015 are RESERVED — to be defined during subsequent Phase 2 catalog work.** See [Reserved-code authoring convention](#reserved-code-authoring-convention).

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

### CRAFT-B001–B006 — anchor benchmark identifiers (seed exemplar set)

The Phase 0 spike produced 3 exemplars and 1 worked benchmark specimen; later Phase 2 increments closed the early v1 anchor set at six exemplars covering every canonical componentType the spec calls out for the 50-exemplar plan. The anchor `CRAFT-B*` reservations align with the seed exemplar set so any subsequent BENCHMARK run on these target/exemplar pairs reuses the same code:

| Code         | Anchor exemplar (citation target)  | componentType  | Source citation                                                                  |
| ------------ | ---------------------------------- | -------------- | -------------------------------------------------------------------------------- |
| `CRAFT-B001` | `exemplar-linear-empty-list`       | EmptyState     | `linear-app` — <https://linear.app/method>                                       |
| `CRAFT-B002` | `exemplar-stripe-loading-state`    | LoadingState   | `stripe-checkout` — <https://docs.stripe.com/elements/appearance-api>            |
| `CRAFT-B003` | `exemplar-raycast-command-palette` | CommandPalette | `raycast-app` — <https://www.raycast.com>                                        |
| `CRAFT-B004` | `exemplar-vercel-error-state`      | ErrorState     | `vercel-geist#error-state` — <https://vercel.com/geist/introduction>             |
| `CRAFT-B005` | `exemplar-linear-issue-modal`      | Modal          | `linear-app#issue-modal` — <https://linear.app/method>                           |
| `CRAFT-B006` | `exemplar-stripe-pay-button`       | Button         | `stripe-checkout#pay-button` — <https://docs.stripe.com/elements/appearance-api> |

Phase 0 spike `benchmark-specimens/empty-state-vs-linear.md` is the canonical worked example for `CRAFT-B001`: a hypothetical `MyEmptyState` component scored against `exemplar-linear-empty-list`. The specimen output (overall 64, per-dimension scores 65/70/55/80/50, five gaps narratives) demonstrates the full BenchmarkScore shape and confirms the 3-axis × 5-dim schemas hold together.

Per Phase 0 review observation O4, `componentType` (e.g., `CommandPalette`) is a free string — the v1 seed need not ship every exemplar's component-type, but the schema accepts arbitrary types. Raycast's CommandPalette is retained informally as a v2 candidate; the `CRAFT-B003` anchor code remains reserved for its eventual BENCHMARK target so subsequent benchmark runs reuse this identifier.

`CRAFT-B004` (`exemplar-vercel-error-state`) and `CRAFT-B005` (`exemplar-linear-issue-modal`) extend the early v1 anchor set with the ErrorState and Modal componentTypes. `CRAFT-B006` (`exemplar-stripe-pay-button`) closes it by claiming the Button anchor — together with B001–B005 it covers every canonical componentType the spec calls out for the 50-exemplar seed (EmptyState / LoadingState / ErrorState / Modal / Button + the informal CommandPalette anchor). All five canonical componentTypes are now seeded; subsequent exemplar-widen increments grow horizontally (additional exemplars per componentType) rather than introducing new componentTypes.

### CRAFT-B007–B050 — RESERVED (seed exemplar set growth)

Codes B007–B050 are reserved for the seed exemplar set's horizontal growth (success criterion #9 — 50 exemplars across 5 component types). Each seed exemplar that becomes a BENCHMARK reference target claims the next free `CRAFT-B*` code in landing order during Phase 1 Stream B and Phase 2 Stream B.

The next slot (`CRAFT-B007`) is unallocated and intended for the second exemplar within whichever canonical componentType lands next — every canonical type is already anchored, so growth is per-type horizontal from here. Subsequent slots fill in per-type as additional exemplars promote to BENCHMARK-target status.

> **All codes in B007–B050 are RESERVED — to be defined as benchmark-target exemplars are landed during seed growth.** See [Reserved-code authoring convention](#reserved-code-authoring-convention).

### CRAFT-B051–B100 — RESERVED (post-seed growth)

Codes B051–B100 are reserved for the H growth trajectory (target: 400 exemplars in 12–24 months). Most exemplars will never be BENCHMARK targets themselves — they accumulate `citationCount` via being cited in other benchmark runs' `exemplars` field. A `CRAFT-B*` code is allocated only when the exemplar becomes a comparison target in its own right.

> **All codes in B051–B100 are RESERVED — to be defined as post-seed benchmark targets land.** See [Reserved-code authoring convention](#reserved-code-authoring-convention).

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

### `exemplar-vercel-error-state` (referenced by `CRAFT-B004`)

- **Component type:** ErrorState
- **URL:** <https://vercel.com/docs/deployments/troubleshoot-a-build>
- **Source citation:** `vercel-geist#error-state` — <https://vercel.com/geist/introduction>
- **Radar reference:** philosophicalCoherence 92, hierarchy 93, craftExecution 91, function 96, innovation 78
- **Why exemplar:** Demonstrates the four-part anatomy of a high-craft error surface — name the failure specifically, lead with the recovery action, keep diagnostics available but recessed, communicate severity with typography/color tokens rather than full-bleed red panels. Composes naturally with `CRAFT-C001` (hierarchy), `CRAFT-C006` (restraint), and `CRAFT-C008` (copy voice).

### `exemplar-linear-issue-modal` (referenced by `CRAFT-B005`)

- **Component type:** Modal
- **URL:** <https://linear.app/method>
- **Source citation:** `linear-app#issue-modal`
- **Radar reference:** philosophicalCoherence 94, hierarchy 93, craftExecution 93, function 95, innovation 82
- **Why exemplar:** Proof point that a Modal can carry significant content density without losing focus — one focal region (not three competing ones), flat surface (no nested cards-in-cards), restrained dimmer (not theatrical blackout), tuned spring motion paired with instant keyboard response, optimistic inline mutations (no blocking spinners). Composes naturally with `CRAFT-C001` (hierarchy), `CRAFT-C006` (restraint), and `CRAFT-C009` (interaction craft).

### `exemplar-stripe-pay-button` (referenced by `CRAFT-B006`)

- **Component type:** Button
- **URL:** <https://stripe.com/payments/checkout>
- **Source citation:** `stripe-checkout#pay-button` — <https://docs.stripe.com/elements/appearance-api>
- **Radar reference:** philosophicalCoherence 93, hierarchy 95, craftExecution 94, function 96, innovation 75
- **Why exemplar:** Demonstrates the high-craft primary CTA pattern: the label carries the commit value so the action is specific (not generic); the visual treatment is one token + one border (no gradient/shadow/shine stack); the hover / press / loading / disabled / focus states ride one rhythm; the focus ring uses the three-layer pattern paired with `:focus-visible`; the loading state is layout-locked so the surface does not jitter mid-transaction. Composes naturally with `CRAFT-C001` (hierarchy), `CRAFT-C006` (restraint), `CRAFT-C007` (polish-details), `CRAFT-C009` (interaction craft), `CRAFT-P001` (spring-physics), and `CRAFT-P007` (focus-ring-craft).

---

## Reserved-code authoring convention

When filling in a code marked `RESERVED`, follow this checklist:

1. **Claim the next free code in the appropriate family band.**
   - `CRAFT-C*` — next free in C004–C010 for seed completion; C011+ for post-seed growth.
   - `CRAFT-P*` — next free in P004–P015 for seed completion; P016+ for post-seed growth.
   - `CRAFT-B*` — every canonical componentType anchor (B001–B006) is allocated; B007+ is next free as additional seed exemplars become benchmark targets within an already-anchored componentType.
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
