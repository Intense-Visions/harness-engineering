# Harness Design Craft

> LLM-judgment-based design ceiling-raiser. Three branchable phases — CRITIQUE finds what's mediocre, POLISH applies high-craft moves, BENCHMARK scores against curated exemplars. The ceiling counterpart to harness-design (declared-intent enforcement, rule-based) and the design-pipeline floor audits.

## When to Use

- Reviewing UI for craft elevation opportunities the rule-based skills can't surface ("hierarchy is muddy here," "loading spinner where a content-matched skeleton would fit")
- After harness-design has captured intent and basic checks pass — go from "consistent" to "stunning"
- Before launching customer-facing surfaces — visual judgment beyond consistency
- During design-engineering work — POLISH phase suggests concrete craft moves with before/after sketches
- For competitive benchmarking — BENCHMARK scores how close you are to Linear / Stripe / Raycast tier
- When `on_new_feature` fires AND the feature touches design surface
- NOT for declared-anti-pattern enforcement (use harness-design)
- NOT for component anatomy completeness (use audit-component-anatomy)
- NOT for token validation (use harness-design-system)
- NOT for accessibility (use harness-accessibility)
- NOT for code generation from scratch (use v0 / bolt.new / Lovable — different tool class)

## Process

### Argument Resolution

- `mode`: `"fast"` (code-only LLM, cheap, default) or `"deep"` (rendered + vision-LLM, ceiling-raising, requires playwright + vision-capable model)
- `phases`: subset of `critique`, `polish`, `benchmark`. Default: all three, sequenced.
- `autoCapture`: B' upgrade behavior. `"prompt"` (default — offer to chain to harness-design if preconditions missing), `"auto"` (chain without prompting), `"skip"` (run with generic-craft rubrics, no offer).
- `files`: optional scoping. Default: all components/pages discovered.

### B' Precondition Check (every invocation)

Before any phase runs, check four preconditions and offer to fulfill missing ones:

| Precondition                 | Source                                          | If missing                                                           |
| ---------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| `designMdExists`             | `design-system/DESIGN.md` present               | Offer to chain to harness-design (INTENT + DIRECTION)                |
| `aestheticIntentDeclared`    | DESIGN.md Aesthetic Direction section populated | Offer to chain to harness-design (INTENT)                            |
| `tokensExist`                | `design-system/tokens.json` present             | Note in summary; do not auto-chain (harness-design-system territory) |
| `componentRegistryPopulated` | DESIGN.md Component Registry section            | Note in summary; falls back to export-name resolution                |

`autoCapture` controls behavior:

- `prompt`: emit `upgradeOffer` interaction; pause for user choice
- `auto`: chain to harness-design transition automatically (for autopilot)
- `skip`: run with generic-craft rubrics (degrades quality but unblocks first-run)

### Phase: CRITIQUE — Find what is craft-mediocre

1. **Identify targets.** Discover components (or pages, when scoped to pages) to critique. Apply `files` scoping if provided.

2. **Load critique rubrics.** Read from catalog (`catalog/rubrics/`). 10 rubrics in v1 covering: hierarchy clarity, typography craft, motion quality, color confidence, density rhythm, restraint, polish details, copy voice, interaction craft, brand coherence. Filter by `catalog.rubrics` config if set.

3. **For each target × each rubric, run an LLM critique pass:**
   - **Fast mode:** pass source code + rubric prompt + AestheticIntent (if present) to text LLM
   - **Deep mode:** render via playwright at three viewports (1440/768/375), pass screenshots + source + rubric prompt + AestheticIntent to vision-capable LLM
   - Parse response into 3-axis finding: `tier` (foundational/polish/aspirational), `impact` (small/medium/large), `confidence` (high/medium/low — essential for honest LLM output)

4. **Apply harness-design overlap deferral.** Per `design.craft.enabled = true`, when a CRITIQUE finding matches a declared anti-pattern in DESIGN.md, defer to harness-design (suppress this finding) and increment `meta.deferralsToHarnessDesign`.

5. **Compute derived `priority` field** for each finding (tier × impact × confidence-weighted score) for single-axis sorting when needed.

### Phase: POLISH — Apply craft pattern library

1. **Load polish patterns.** Read from catalog (`catalog/patterns/`). 15 patterns in v1 across 5 categories: motion (3), skeleton (3), typography (3), interaction (3), layout (3). Filter by `catalog.patterns` config if set.

2. **For each target × each applicable pattern, evaluate fit:**
   - Match pattern's `applicableTo` criteria (jsx-attribute, css-property, component-type, etc.)
   - LLM judgment: would applying this pattern improve craft here?
   - If yes: produce 3-axis finding with `before` and `after` content (codemod-TODO sketch, not actual edit)

3. **No source modification.** POLISH only emits suggestions with before/after sketches. The user applies via codemod tools or by hand.

### Phase: BENCHMARK — Score against curated exemplars

1. **Load exemplar corpus.** Read from catalog (`catalog/exemplars/`). 50 exemplars in v1 across 5 component types (EmptyState, LoadingState, ErrorState, Modal, Button — 10 each). Filter by `catalog.exemplars` config if set.

2. **For each target component, identify matching exemplars** by component-type tag (e.g., target is an EmptyState → load all 10 EmptyState exemplars).

3. **For each target × matching exemplars, run an LLM benchmark pass:**
   - **Fast mode:** structural comparison (code/markup/declared anatomy vs exemplar's reference markup) — limited but useful as a first signal
   - **Deep mode:** visual comparison via vision-LLM (target screenshot vs exemplar screenshot/URL)
   - Parse response into 5-dim radar: `philosophicalCoherence`, `hierarchy`, `craftExecution`, `function`, `innovation` — each with score (0-100), confidence, notes
   - Compute weighted `overall` score
   - Emit narrative `gaps` (where the target falls short of the best exemplars and why)

4. **Cite exemplars used.** Each `BenchmarkScore` lists `exemplars` (ids) consulted. Increment per-exemplar `citationCount` for measurement.

### Phase: REPORT — Format and persist outputs

1. **Write to graph:** CRITIQUE/POLISH findings → `VIOLATES_CRAFT` edges via extended `DesignConstraintAdapter`. BENCHMARK scores → `CRAFT_SCORE` nodes attached to component nodes. All carry `runId` for sub-project #4 fixpoint detection. Idempotent.

2. **Format markdown report.** Grouped by component, with `CRAFT-*` codes linked to `finding-codes.md` and rubric/pattern/exemplar names linked to their catalog entries. Low-confidence findings visually distinguished (italic or `(low confidence:)` prefix).

3. **Emit summary.** Total findings, breakdown by phase, mode (`fast`/`deep`), LLM cost (`llmCalls.{count, costUsd}`), catalog applied, deferrals to harness-design, precondition state.

4. **Signal feedback.** Append to running aggregate: when the same finding-shape recurs N≥5 times across audits (config: `design.craft.signal.proposalThreshold`), emit a candidate pattern proposal to `.harness/design-craft/proposals/`.

## Harness Integration

- **`harness validate`** — Fast-mode CRITIQUE hook (subset of rubrics; opt-in). Findings respect `design.strictness`.
- **`mcp__harness__design_craft`** — Programmatic API. Consumed by harness check-design verifier (#4) and design-pipeline orchestrator (#5). Phase selector exposed.
- **`harness-design`** — Soft dependency. B' progressive upgrade chains to it when AestheticIntent missing. Defers declared-anti-pattern findings to it.
- **`harness-design-system`** — Soft dependency. Token-related polish patterns enriched when tokens exist.
- **`DesignConstraintAdapter`** — Extended for `CRAFT-*` codes (CRAFT-C* critique, CRAFT-P* polish, CRAFT-B\* benchmark identifiers) + `CRAFT_SCORE` node type.
- **`packages/intelligence/`** — Wrapped by `llm/provider.ts` for vision-capable LLM calls. May need extension if no vision support today.

## Success Criteria

See `docs/changes/design-pipeline/design-craft-elevator/proposal.md` for the full 38 success criteria. Highlights:

- Three phases independently invocable via `phases` arg
- 3-axis output for CRITIQUE/POLISH; 5-dim radar for BENCHMARK
- Confidence is honest (low-confidence findings emitted, not silently dropped)
- B' detect-and-offer works (preconditions detected, offer payload emitted, chain to harness-design honored)
- Seed catalog complete (10 rubrics + 15 patterns + 50 exemplars)
- Growth infrastructure operational (contribution validation, signal loop, usage measurement)
- Fast-mode ≤ 30s / 50 files; deep-mode ≤ 3min / 10 components
- LLM cost tracked per audit

## Examples

### Example: CRITIQUE finds hierarchy muddiness

**Input:** A Dashboard.tsx page rendering three CTA buttons, all using the same `variant="primary"`.

**Output (3-axis finding):**

```
CRAFT-C001 [foundational | medium | high] Hierarchy muddy: three buttons compete for primary
  File:        src/pages/Dashboard.tsx:88
  Rubric:      hierarchy-clarity (rubric-hierarchy-clarity)
  Tier:        foundational  (this is "fix to be not-broken," not polish)
  Impact:      medium        (users can still complete tasks, but decision fatigue is real)
  Confidence:  high          (rule is unambiguous; LLM saw the three buttons + their identical styling)
  Priority:    derived → 0.78
  Message:     Three primary-variant buttons in the same view: "Save", "Export", "Share".
               No visual signal indicates which is the recommended action. Reduce to one
               primary; demote the others to secondary or ghost variant.
  Cite:        rubric "hierarchy-clarity" / source: huashu-design#hierarchy
```

### Example: POLISH suggests spring physics

**Input:** A Modal.tsx using `transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)`.

**Output (3-axis finding with before/after):**

```
CRAFT-P001 [polish | medium | high] Spring physics would feel more confident here
  File:        src/components/Modal.tsx:42
  Pattern:     spring-physics-microinteraction
  Tier:        polish        (Modal already works; this elevates the feel)
  Impact:      medium        (users notice modal motion every time)
  Before:      transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  After:       transition: transform { duration: spring.medium };
               // stiffness:200 damping:25 for modal entries per emil-design-eng#spring-physics
  Fix kind:    codemod-todo (POLISH does not modify source; suggestion only)
```

### Example: BENCHMARK against Linear

**Input:** A custom EmptyState component for the project's task list.

**Output (5-dim radar):**

```
CRAFT-B001 EmptyState component scored against Linear empty list exemplar

  philosophicalCoherence: 80 [high]   "Restraint aligns with declared minimal aesthetic."
  hierarchy:              65 [medium] "Heading and body OK; action button competes
                                       with secondary 'Learn more' link."
  craftExecution:         55 [medium] "Generic illustration; Linear uses subtle line art
                                       matching their monochromatic palette. Missing the
                                       'breathing room' Linear gets via 64px vertical padding."
  function:               85 [high]   "Action is clear and verb-led."
  innovation:             50 [low]    "Standard 4-part anatomy; not differentiated."

  Overall: 67  [medium confidence]
  Gaps:
    - "Reduce the empty-state to one CTA — the secondary link adds noise"
    - "Replace stock illustration with a custom line art aligned to brand"
    - "Increase top padding from 32px to 56px+ to match the breathing-room pattern"
  Exemplars cited: exemplar-linear-empty-list
```

## Gates

- **No assertion of "stunning" without LLM judgment.** This skill is LLM-judgment-based; if no LLM provider is configured, halt with explanatory error — do not degrade to rule-based output.
- **Deep mode requires playwright + vision-capable LLM.** If either is missing, surface to user with the documented fallback path (code-only mode); do not silently degrade.
- **No autofix.** POLISH emits suggestions only; source files are never modified.
- **Confidence is honest.** Low-confidence outputs MUST be emitted (with the low-confidence flag) — never silently upgraded.
- **B' deferral honored.** When `design.craft.enabled = true` and DESIGN.md declares an anti-pattern matching a CRITIQUE finding, defer to harness-design; never double-count.

## Escalation

- **When deep mode renders fail (component not reachable via URL).** Emit a "render-unreachable" finding for the affected component, fall back to fast mode for that component, continue the audit. Do not abort.
- **When the vision-LLM rejects the screenshot (size, content, format).** Log the rejection; downgrade that component's run to fast mode; do not abort.
- **When LLM cost exceeds the configured per-audit budget.** Halt the audit, emit findings collected so far, report the cost overrun. Do not retry. Config: `design.craft.llm.maxCostUsd` (default unset = no cap).
- **When the catalog is empty or unloadable.** Halt with explanatory error pointing to `agents/skills/shared/design-knowledge/craft-{rubrics,patterns,exemplars}/`. Do not synthesize findings without the catalog.
- **When B' detect-and-offer produces an offer the user declines.** Run in generic-craft mode (no AestheticIntent context); note the degraded quality in summary. User can re-invoke with `autoCapture: skip` to suppress future offers.
- **When the same finding-shape recurs across many audits (signal feedback loop).** Auto-export a candidate pattern proposal to `.harness/design-craft/proposals/` after N≥`design.craft.signal.proposalThreshold` recurrences; require human review before promotion to the catalog.
- **When a graph operation fails.** Skip graph integration for that run; emit findings to the report only. Log a warning that `VIOLATES_CRAFT` edges + `CRAFT_SCORE` nodes were not persisted.

## Status

**v1 — in implementation.** See:

- Spec: `docs/changes/design-pipeline/design-craft-elevator/proposal.md`
- Plan: `docs/changes/design-pipeline/design-craft-elevator/plans/2026-05-23-design-craft-elevator-plan.md`
- Finding codes: `docs/changes/design-pipeline/design-craft-elevator/finding-codes.md`
- Contribution guide: `docs/changes/design-pipeline/design-craft-elevator/contribution.md`
- Growth trajectory: `docs/changes/design-pipeline/design-craft-elevator/growth-trajectory.md`
- Roadmap entry: `design-pipeline sub-project #6` in `docs/roadmap.md`
- Prior-art references: `docs/changes/design-pipeline/REFERENCES.md` tier-1 entries #2, #3, #4 (impeccable, emil-design-eng, huashu-design)
