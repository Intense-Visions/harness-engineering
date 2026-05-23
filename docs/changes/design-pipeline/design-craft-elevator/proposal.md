# design-craft-elevator

> An LLM-judgment-based skill that elevates design from consistent to stunning. The CEILING-RAISING counterpart to the rule-based audit skills in the design-pipeline initiative. Three phases: CRITIQUE (find what's mediocre), POLISH (apply high-craft moves), BENCHMARK (score against curated exemplars).

## Overview

**Project:** design-craft-elevator
**Initiative:** design-pipeline (sub-project #6 of 6)
**Date:** 2026-05-23
**Estimated effort:** ~4 weeks (Sprint 1 vertical slice + curation stream, Sprint 2 visual pipeline + catalog completion, Sprint 3 convergence + growth infrastructure, Sprint 4 polish)

### Goals

1. **Produce stunning output, not just consistent output.** Where the rule-based skills in the design-pipeline (#1-#4 + harness-design) enforce declared intent and detect missing structural parts, this skill applies LLM judgment to elevate craft — the dimension that rule-based audits cannot reach. Closes the gap identified in the floor+ceiling reframe of the design-pipeline initiative.

2. **Ship three phases as a single unified skill with branchable invocation.** `harness-design-craft` exposes phases CRITIQUE, POLISH, BENCHMARK. Each independently invocable (`mcp__harness__design_craft({ mode: 'critique' })`); full pipeline by default. Mirrors `harness-design`'s 4-phase pattern.

3. **Ship a seed catalog AND the infrastructure for it to grow.** v1 delivers 10 critique rubrics + 15 polish patterns + 50 exemplars (the H seed). v1 ALSO delivers the contribution format, review process, signal feedback loop (CRITIQUE recurrence → pattern proposal candidate), and usage measurement scaffolding so the catalog evolves from operational signal + community contribution rather than depending on one-person curation. Long-term trajectory: 20 rubrics + 75 patterns + 400 exemplars over 12-24 months without curation bottleneck.

4. **Compose with harness-design via soft dependency + progressive upgrade path.** Works standalone day 1 with generic-craft rubrics. When DESIGN.md AestheticIntent exists, critique becomes intent-anchored (10x more relevant). When preconditions are missing, the skill offers to fulfill them inline by chaining to harness-design's INTENT/DIRECTION phases via the existing skill-transition machinery. Defers declared-anti-pattern findings to harness-design (i18n-style deferral, same pattern as #2's a11y overlap resolution).

5. **Support both fast code-only critique and deep visual critique.** Default mode runs LLM critique on source code (cheap text-model calls). Deep mode (`--visual` flag or config) renders components via playwright, captures screenshots, and uses vision-capable LLM for actual visual judgment. CI gets fast; designers get deep. Architecture evolves cleanly toward visual-default as LLM costs drop.

6. **Use the right output vocabulary per phase.** CRITIQUE and POLISH produce findings/suggestions with a 3-axis model (tier: foundational/polish/aspirational, impact: small/medium/large, confidence: high/medium/low — essential for honest LLM output). BENCHMARK produces 5-dimension radar scores (matching the huashu-design proven format from REFERENCES.md #4). Severity matrices are derived where needed; the primary vocabulary is craft-native, not error/warn/info.

### Non-Goals

- **Replacing harness-design.** harness-design owns declared-anti-pattern enforcement (grep-based, rule-based). This skill is the LLM-judgment-based counterpart, not a replacement.
- **Token management.** harness-design-system owns this.
- **Accessibility auditing.** harness-accessibility owns WCAG checks.
- **Component anatomy completeness.** audit-component-anatomy (#2) owns this.
- **Detection of token bypass / variant proliferation.** detect-design-drift (#1) owns this.
- **Brand-voice / semantic-token / asset misuse detection.** audit-brand-compliance (#3) owns this.
- **Generative design from scratch.** v0, bolt.new, Lovable are the generation tools — this skill operates on existing design output.
- **Visual regression testing.** Chromatic, Percy, Reg-suit own this. This skill judges quality, not pixel-equivalence.
- **Automated rewrites of components.** POLISH phase produces suggestions with before/after sketches and codemod-TODO markers, but does NOT modify source files. Application is a human decision in v1.
- **Real-time design feedback (IDE plugin).** This skill is invocation-triggered (skill run, MCP call, CI, autopilot). Always-on watching is out of scope.

### Keywords

`design-craft`, `llm-critique`, `polish-patterns`, `exemplar-corpus`, `vision-model`, `aesthetic-elevation`, `growth-infrastructure`, `3-axis-findings`, `5-dim-radar`, `b-prime-upgrade-path`, `soft-dependency`, `ceiling-raising`, `harness-design-craft`, `detect-and-offer`, `signal-feedback-loop`

---

## Decisions

Compiled from the brainstorming Q&A.

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Skill shape | **A'** — single unified skill `harness-design-craft` with branchable phases CRITIQUE/POLISH/BENCHMARK | One discovery point + shared context across phases; same composability as three-skill option via phase selector; mirrors harness-design's 4-phase pattern. |
| 2 | Catalog scope | **H** — seed (10 rubrics + 15 patterns + 50 exemplars) + growth infrastructure (contribution format, review process, signal feedback loop, usage measurement, versioning) | Long-term right: living catalogs are evergreen + signal-driven + distributed-curation. Fixed v1 catalog rots; H gives organic growth trajectory toward 20+75+400 over 12-24 months. |
| 3 | LLM call architecture | **D** — hybrid: code-only default (fast) + visual opt-in (deep) using render + screenshot + vision-capable LLM | Fast default for routine use; deep mode for ceiling-raising; mirrors #2's fast/full validate-time pattern; evolves toward visual-default as LLM costs drop. |
| 4 | Relationship to harness-design | **B'** — soft dependency with progressive upgrade path (detect-and-offer chain to harness-design via skill-transition machinery) | Works standalone day 1 with generic critique; works richer with declared intent; offers inline upgrade instead of degrading silently; uses existing transition handoff machinery. |
| 5 | Output model | **E** — 3-axis (tier/impact/confidence) for CRITIQUE/POLISH; 5-dim radar for BENCHMARK | error/warn/info doesn't fit craft; tier captures the ladder; confidence essential for honest LLM judgment; radar matches huashu-design proven format for holistic scoring. |
| 6 | Spec location | `docs/changes/design-pipeline/design-craft-elevator/proposal.md` (sibling to audit-component-anatomy) | Keeps design-pipeline initiative bundle coherent. |
| 7 | Build sequencing | **Approach 3** — hybrid: vertical slice (engineering stream) + parallel catalog stream from day 1, converging at Sprint 3, polish at Sprint 4 | Maximizes wall-time efficiency: catalog curation parallelized with engineering; vertical slice gives architecture validation week 1; visual pipeline spike in Sprint 1 de-risks biggest novelty. |

### Rationalizations rejected during brainstorming

| Rationalization | Why rejected |
|-----------------|--------------|
| "Just extend harness-design with more phases" | Mixes rule-based and LLM-based in one skill (different mental models); harness-design balloons in scope; new skill identity gets lost. |
| "Visual-only from v1, skip code mode" | v1 needs cheap default for CI/routine use; hybrid allows projects to opt deep per their cost/value tradeoff. |
| "Build infrastructure first, content later" | Nothing user-facing until week 3; layered builds risk over-engineering lower layers without usage signal. |
| "One-time fixed catalog of 30 patterns is fine" | Living design corpora (APG, MDN, awesome-*) all share evergreen + signal-driven + distributed-curation properties; fixed catalogs rot within 18 months. |
| "Use standard error/warn/info severity" | Craft isn't binary; collapses all findings to warn-noise; loses the foundational-vs-polish-vs-aspirational gradient. |

---

## Technical Design

### File layout

```
packages/cli/src/skills/harness-design-craft/
  SKILL.md
  skill.yaml
  src/
    index.ts                              # MCP tool entry + phase orchestrator
    phases/
      critique.ts                          # CRITIQUE phase impl
      polish.ts                            # POLISH phase impl
      benchmark.ts                         # BENCHMARK phase impl
    llm/
      provider.ts                          # Wraps existing intelligence provider
      vision.ts                            # Vision-capable LLM call wrapper
      text.ts                              # Text LLM call wrapper
    render/
      playwright.ts                        # Component render + screenshot pipeline
      target-discovery.ts                  # Find components/pages to render
    findings/
      schema.ts                            # 3-axis + 5-dim radar types
      formatter.ts                         # Markdown/JSON output formatters
      derived.ts                           # priority field derivation
    catalog/
      rubrics/                             # 10 critique rubrics
      patterns/                            # 15 polish patterns
      exemplars/                           # 50 exemplars
      index.ts                             # Catalog loader / version / measurement
    resolvers/
      preconditions.ts                     # B' precondition detection
      offer.ts                             # B' detect-and-offer + chain transition
    contribution/
      schema.ts                            # Contribution format for new items
      review.ts                            # Review-process hooks
      signal.ts                            # CRITIQUE-recurrence → pattern-proposal
    measurement/
      usage.ts                             # Apply/cite/trigger counters
      dashboard.ts                         # Stats surfaced to dashboard
    integrations/
      design-constraint-adapter.ts         # Graph edges for craft findings
      harness-design.ts                    # Chained-invocation helpers (B')
  tests/
    fixtures/
      rubrics/
      patterns/
      exemplars/
    phases/
    llm/                                   # LLM mocks for deterministic tests
    render/
    findings/
    resolvers/
```

### Data structures

```ts
// findings/schema.ts

export type Tier = 'foundational' | 'polish' | 'aspirational';
export type Impact = 'small' | 'medium' | 'large';
export type Confidence = 'high' | 'medium' | 'low';

export interface CraftFinding {
  code: string;                              // e.g. 'CRAFT-C001' (critique), 'CRAFT-P001' (polish)
  phase: 'critique' | 'polish';
  tier: Tier;
  impact: Impact;
  confidence: Confidence;
  target: { file: string; line?: number; component?: string };
  message: string;
  cite: { rubricOrPatternId: string; source: string };
  before?: string;                           // POLISH only
  after?: string;                            // POLISH only
  derived: { priority: number };             // computed from tier × impact × confidence
}

export interface BenchmarkScore {
  target: { file: string; component: string };
  exemplars: string[];                       // ids cited
  radar: {
    philosophicalCoherence: { score: number; confidence: Confidence; notes: string };
    hierarchy: { score: number; confidence: Confidence; notes: string };
    craftExecution: { score: number; confidence: Confidence; notes: string };
    function: { score: number; confidence: Confidence; notes: string };
    innovation: { score: number; confidence: Confidence; notes: string };
  };
  overall: { score: number; confidence: Confidence }; // weighted aggregate
  gaps: string[];                             // narrative gap analysis
}

export interface DesignCraftOutput {
  findings: CraftFinding[];
  scores: BenchmarkScore[];
  summary: {
    phaseRun: ('critique' | 'polish' | 'benchmark')[];
    mode: 'fast' | 'deep';
    durationMs: number;
    llmCalls: { provider: string; model: string; count: number; costUsd: number };
    catalog: { rubricsApplied: string[]; patternsApplied: string[]; exemplarsCited: string[] };
    preconditions: { aestheticIntentDeclared: boolean; designMdExists: boolean; tokensExist: boolean };
    deferralsToHarnessDesign: number;
    runId: string;
  };
  upgradeOffer?: {                            // B' detect-and-offer
    message: string;
    options: Array<{ id: string; label: string; chainedSkill?: string; chainedPhases?: string[] }>;
  };
}
```

### MCP tool API

```ts
// mcp__harness__design_craft

interface DesignCraftInput {
  path: string;                              // project root
  mode?: 'fast' | 'deep';                    // default 'fast'
  phases?: Array<'critique' | 'polish' | 'benchmark'>;  // default all three
  files?: string[];                          // optional scoping
  autoCapture?: 'prompt' | 'auto' | 'skip';  // B' upgrade behavior; default 'prompt'
  designStrictness?: 'strict' | 'standard' | 'permissive';
  catalog?: { rubrics?: string[]; patterns?: string[]; exemplars?: string[] };  // optional subsetting
}

// Returns DesignCraftOutput (above)
```

### Catalog entry formats

**Rubric** (`catalog/rubrics/hierarchy-clarity.yaml`):

```yaml
id: rubric-hierarchy-clarity
name: Hierarchy Clarity
version: 1
status: stable                        # stable | draft | deprecated
authoredAt: 2026-05-23
contributors: [@chadjw]
appliesTo: [component, page]
source: { ref: 'huashu-design#hierarchy', url: 'https://github.com/alchaincyf/huashu-design' }
prompt: |
  Evaluate the visual hierarchy of {target}.
  - Is there a clear primary, secondary, tertiary level?
  - Does typographic scale support the hierarchy or muddy it?
  - Are spacing, color, and weight all aligned with hierarchy intent?
  - Identify any "competing for primary" elements.
  Use the 3-axis output model. Be honest about confidence.
positiveExample: |
  Linear command palette — primary action reads with weight + saturation
  + spacing; secondary items reduced weight; tertiary metadata gets
  dedicated visual register (monospace, dim).
negativeExample: |
  Three buttons all with same weight, color, size — no primary signal.
findingTemplate:
  code: CRAFT-C001
  tier: foundational
  impact: large
```

**Pattern** (`catalog/patterns/spring-physics-microinteraction.yaml`):

```yaml
id: pattern-spring-physics
name: Spring Physics Micro-interaction
version: 1
status: stable
authoredAt: 2026-05-23
source: { ref: 'emil-design-eng#spring-physics' }
applicableTo:
  - { kind: 'jsx-attribute', match: 'transition' }
  - { kind: 'css-property', match: 'transition-timing-function' }
when: |
  Element transitions currently use cubic-bezier easing.
suggest: |
  Replace with spring physics. stiffness:200 damping:25 for primary
  interactions; stiffness:300 damping:30 for secondary; stiffness:170
  damping:26 for entrances.
before: |
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
after: |
  transition: transform { duration: spring.medium };
findingTemplate:
  code: CRAFT-P001
  tier: polish
  impact: medium
```

**Exemplar** (`catalog/exemplars/linear-empty-list.yaml`):

```yaml
id: exemplar-linear-empty-list
name: Linear Empty List State
componentType: EmptyState
url: https://linear.app/...
addedAt: 2026-05-23
addedBy: @chadjw
critique: |
  Hierarchy: heading is concise + verb-led. Body: one sentence of
  guidance, no marketing fluff. Action: single primary button.
  Visual: subtle line illustration matches Linear's monochromatic
  aesthetic. Density: generous whitespace, tight pairing.
whyExemplar: |
  Demonstrates the 4-part anatomy (heading + body + visual + action)
  with restraint. Visual doesn't compete with the message. Single CTA
  respects the user's decision budget.
radarReference:
  philosophicalCoherence: 90
  hierarchy: 95
  craftExecution: 92
  function: 95
  innovation: 70
citationCount: 0                        # incremented on use
```

### LLM provider integration

`llm/provider.ts` wraps the existing intelligence provider infrastructure (`packages/intelligence/`). Falls back to text-only when vision unavailable.

`llm/vision.ts` and `llm/text.ts` are thin wrappers exposing typed call signatures for the phase implementations.

Cost tracking: every LLM call records `{ provider, model, tokens, costUsd }` aggregated into `DesignCraftOutput.summary.llmCalls`.

### Render pipeline

`render/playwright.ts` boots a headless browser, renders the component via Storybook if available else via a synthetic harness, screenshots at multiple viewports (default: 1440, 768, 375), passes images to the vision model. Caches renders per content hash to avoid re-rendering unchanged components.

`render/target-discovery.ts` finds components or pages to render via Storybook stories, route manifests, or explicit file lists from the `files` MCP input.

### B' detect-and-offer logic

`resolvers/preconditions.ts` checks four precondition states:
- `designMdExists`: `design-system/DESIGN.md` present
- `aestheticIntentDeclared`: DESIGN.md has the Aesthetic Direction section populated
- `tokensExist`: `design-system/tokens.json` present
- `componentRegistryPopulated`: DESIGN.md has Component Registry section (for visual-mode target discovery)

`resolvers/offer.ts` constructs the `upgradeOffer` payload when preconditions are missing AND `autoCapture` is 'prompt' or 'auto'. The payload uses `emit_interaction` with a question + options. Picking "yes" emits a transition to `harness-design` with the relevant phases; the runner re-enters `harness-design-craft` once the chained skill completes.

### Contribution and growth infrastructure

`contribution/schema.ts` exposes validators for rubric/pattern/exemplar files. PRs adding new catalog entries are validated against the schemas at PR time and must include peer-review notes per the review process spec.

`contribution/signal.ts` aggregates CRITIQUE findings across audits. When the same finding-shape recurs N≥5 times across distinct projects/components, it's surfaced as a candidate pattern proposal exported to `.harness/design-craft/proposals/` for human review.

`measurement/usage.ts` tracks per-rubric trigger count, per-pattern apply count, per-exemplar cite count. Exposed via `getCatalogStats()` and surfaced to the dashboard.

### Graph integration

CRITIQUE/POLISH findings → `VIOLATES_CRAFT` edges in the graph (via extended DesignConstraintAdapter). BENCHMARK scores → `CRAFT_SCORE` nodes attached to component nodes. Codes registered: `CRAFT-C001..C100` (critique), `CRAFT-P001..P100` (polish), `CRAFT-B001..B100` (benchmark identifiers).

### harness-design overlap deferral

The skill respects an i18n-style deferral pattern (same shape as #2's a11y deferral):
- When DESIGN.md declares an anti-pattern matching a CRITIQUE finding, the finding is suppressed and `meta.deferralsToHarnessDesign` is incremented.
- harness-design owns the declared-anti-pattern finding; this skill owns the broader craft critique that goes beyond declared rules.

### harness.config.json additions

```json
{
  "design": {
    "strictness": "standard",
    "craft": {
      "enabled": true,
      "mode": "fast",
      "autoCapture": "prompt",
      "llm": {
        "provider": "anthropic",
        "model": "claude-sonnet-4-6",
        "visionModel": "claude-sonnet-4-6"
      },
      "catalog": {
        "path": "default",
        "rubrics": "all",
        "patterns": "all",
        "exemplars": "all"
      },
      "signal": {
        "proposalThreshold": 5
      }
    }
  }
}
```

---

## Integration Points

### Entry Points

| Kind | Path / Identifier | New / Modified |
|------|-------------------|----------------|
| Skill | `packages/cli/src/skills/harness-design-craft/{SKILL.md,skill.yaml}` | NEW |
| MCP tool | `mcp__harness__design_craft` | NEW |
| Skill module export | `getCatalogStats(): { rubrics: number; patterns: number; exemplars: number }` | NEW |
| Render pipeline | `packages/cli/src/skills/harness-design-craft/render/` using playwright | NEW |
| LLM provider integration | Wraps `packages/intelligence/` for vision-capable LLM calls | MODIFIED (intelligence may need vision support added) |
| Skill (referenced via chain) | `harness-design` — INVOKED via skill transition machinery (B'); no code changes | UNCHANGED |
| Config schema | `harness.config.json` — adds `design.craft.*` block | MODIFIED |
| DesignConstraintAdapter | Extended to handle `CRAFT-*` code namespace + `CRAFT_SCORE` nodes | MODIFIED |
| Dashboard | New design-craft stats page (rubric/pattern/exemplar usage) | NEW |

### Registrations Required

1. **Skill index regeneration** — `.harness/skills-index.json` regenerated for `harness-design-craft` (`tier: 2`, `type: flexible` matching `harness-design`).
2. **MCP tool registry** — `mcp__harness__design_craft` added.
3. **Config schema validation** — Zod schema extended with `design.craft.{enabled, mode, autoCapture, llm: { provider, model, visionModel }, catalog: { path, rubrics, patterns, exemplars }, signal: { proposalThreshold }}` keys.
4. **DesignConstraintAdapter** — register `CRAFT-*` code namespace for `VIOLATES_CRAFT` edges + `CRAFT_SCORE` node type.
5. **Skill barrel** — export from skill registry.
6. **Intelligence provider** — register vision-capable model variant if not already present in `packages/intelligence/`.
7. **Playwright vendoring** — add as dev dependency under the skill (or peer-dep with install detection).
8. **Dashboard route** — register the design-craft stats page.

### Documentation Updates

| Doc | Update |
|-----|--------|
| `AGENTS.md` | Add `harness-design-craft` under design-skills section; note its role as the ceiling-raising skill. |
| `docs/guides/designer-quickstart.md` | Add "Running craft critique" subsection; show output format examples. |
| `docs/changes/design-pipeline/design-craft-elevator/finding-codes.md` (NEW) | Reference page for `CRAFT-C001..C100`, `CRAFT-P001..P100`, `CRAFT-B001..B100`. |
| `docs/changes/design-pipeline/REFERENCES.md` | Mark sub-project #6 status as in-progress when implementation starts. |
| `docs/changes/design-pipeline/design-craft-elevator/contribution.md` (NEW) | Contribution format for rubrics/patterns/exemplars + review process. |
| `docs/changes/design-pipeline/design-craft-elevator/growth-trajectory.md` (NEW) | Long-term catalog growth model: seed → 20+75+400 over 12-24 months; signal-loop mechanics. |
| `harness.config.json` schema reference | Document `design.craft.*` keys. |

### Architectural Decisions

Four ADRs warranted (cross-cutting decisions establishing new patterns for the harness ecosystem):

| ADR | One-line rationale |
|-----|---------------------|
| **ADR-004: LLM-judgment-based skill pattern** | First LLM-judgment skill in harness; sets the pattern for confidence-as-first-class output, autoCapture progressive upgrade, vision-model integration. Reusable for future LLM-judgment skills. |
| **ADR-005: 3-axis craft output model (tier × impact × confidence)** | Replaces error/warn/info for LLM-judgment outputs where the standard severity vocabulary fails. Codifies tier/impact/confidence as the standard for any future LLM-judgment skill. |
| **ADR-006: Living catalog with growth infrastructure (the H pattern)** | Documents seed-plus-growth (contribution + signal + measurement). Codifies the pattern for any future skill that depends on a catalog so growth infrastructure is built in not bolted on. |
| **ADR-007: Detect-and-offer progressive upgrade pattern (the B' pattern)** | Documents soft-dependency-with-inline-upgrade as the standard for skills with prerequisite skills. Reusable for any future skill that has soft dependencies. |

### Knowledge Impact

**New domain concepts** (to enter `docs/knowledge/design/` and `docs/knowledge/skills/`):

- `docs/knowledge/design/llm-judgment-skills.md` — codifies the LLM-judgment skill pattern (confidence as first-class, deterministic-vs-judgment separation, vision-vs-text mode selection)
- `docs/knowledge/design/craft-output-vocabulary.md` — codifies 3-axis (tier × impact × confidence) and 5-dim radar as the standard craft output vocabulary
- `docs/knowledge/design/living-catalogs.md` — codifies the H-pattern (seed + growth) as the standard for catalog-backed skills
- `docs/knowledge/skills/detect-and-offer.md` — codifies B' as the standard soft-dependency-with-upgrade pattern; references ADR-007

**New graph node types**:

- `CRAFT_SCORE` node — BENCHMARK output per component; carries radar dimensions, exemplars cited, runId
- Existing `AestheticIntent` and `DesignConstraint` nodes reused

**New graph edges**:

- `VIOLATES_CRAFT (code_file → design_rule)` keyed by `CRAFT-C*` or `CRAFT-P*` code — emitted by DesignConstraintAdapter
- `CITES_EXEMPLAR (CRAFT_SCORE → exemplar)` — for BENCHMARK exemplar provenance
- `OFFERS_UPGRADE (skill → skill)` (optional) — for B' relationships, codified by ADR-007

**Existing nodes that gain meaning**:

- `code_file` — now associated with craft findings via `VIOLATES_CRAFT`, contributing to file-level craft scoring
- `skill` — gains `OFFERS_UPGRADE` relationships once B' pattern is formalized

**Discovery of business facts**:

- Each rubric/pattern/exemplar carries `source: { ref, url }` and `addedAt`/`contributors` — ingestible as `business_fact` nodes representing structured craft knowledge
- Growth trajectory (rubrics added per month, patterns proposed via signal loop, exemplars cited most) is operational knowledge worth ingesting

---

## Success Criteria

### Functional — phase correctness

1. **CRITIQUE phase produces findings using the 3-axis schema.** Given a fixture with a known craft issue (e.g., 3 buttons all same weight = no hierarchy), the phase produces at least one finding with `tier='foundational'`, `impact` ∈ medium/large, and non-null `confidence`.
2. **POLISH phase produces suggestions with before/after sketches.** Given a component with cubic-bezier transitions, the phase produces a `CRAFT-P001` suggestion with `before` and `after` content.
3. **BENCHMARK phase produces 5-dim radar scores.** Given a fixture component and an exemplar, all five radar dimensions populated with `score`, `confidence`, and `notes`; `overall` computed; `gaps` narrative non-empty.
4. **Fast mode runs all three phases on code-only inputs.** Deep mode invokes render + vision pipeline.
5. **Each finding includes a derived `priority` field** computed deterministically from tier × impact × confidence.
6. **Confidence is honest.** When the LLM is asked to evaluate ambiguous fixtures, low-confidence outputs are emitted (not silently dropped or upgraded).

### Catalog — seed and infrastructure

7. **10 critique rubrics ship in `catalog/rubrics/`** covering: hierarchy clarity, typography craft, motion quality, color confidence, density rhythm, restraint, polish details, copy voice, interaction craft, brand coherence.
8. **15 polish patterns ship in `catalog/patterns/`**: 3 motion, 3 skeleton, 3 typography, 3 interaction, 3 layout.
9. **50 exemplars ship in `catalog/exemplars/`**: 5 component types × 10 exemplars (EmptyState, LoadingState, ErrorState, Modal, Button — chosen for v1 coverage).
10. **Every catalog entry includes** `id`, `version`, `status` (stable/draft/deprecated), `authoredAt`, `contributors`, `source` citation.
11. **Contribution schema validates new entries** via schema-driven validation (reject incomplete contributions at PR time).
12. **Review process spec documented** at `docs/changes/design-pipeline/design-craft-elevator/contribution.md`.
13. **Signal feedback loop emits candidate pattern proposals** when the same finding-shape recurs N≥5 times across audits. Proposals exported to `.harness/design-craft/proposals/`.
14. **Usage measurement.** Per-rubric trigger count, per-pattern apply count, per-exemplar cite count exposed via `getCatalogStats()` and surfaced to the dashboard.

### Integration — wiring works

15. **MCP tool returns structured `DesignCraftOutput`.** Phase selector works: invoking with `mode='critique'` runs only CRITIQUE.
16. **B' detect-and-offer works.** Invoking the skill on a project with no DESIGN.md produces an `upgradeOffer` payload. Picking "yes" chains via skill-transition machinery to `harness-design`.
17. **`autoCapture` config respected.** `autoCapture='skip'` suppresses offers (for CI/autopilot); `autoCapture='auto'` chains without prompting.
18. **Soft dependency on harness-design works.** Generic critique runs without AestheticIntent. Intent-anchored critique runs when AestheticIntent declared.
19. **i18n-style deferral works.** When DESIGN.md declares anti-patterns matching a CRITIQUE finding, the finding is deferred to harness-design and `meta.deferralsToHarnessDesign` is incremented.
20. **DesignConstraintAdapter writes `VIOLATES_CRAFT` edges and `CRAFT_SCORE` nodes.** Idempotent across runs.
21. **Vision pipeline works end-to-end.** Deep mode renders fixture component via playwright, screenshots at three viewports, passes to vision LLM, parses response into the finding schema.

### Performance and cost

22. **Fast mode runtime ≤ 30 seconds on a 50-file project** (text LLM calls only).
23. **Deep mode runtime ≤ 3 minutes on a 10-component project** (render + vision per component).
24. **LLM cost tracking.** Every audit reports `llmCalls.{count, costUsd}` so projects can budget.
25. **Render cache works.** Re-running deep mode on unchanged components reuses cached screenshots.

### Output quality

26. **Priority derivation correctness.** Maps tier × impact × confidence to a priority score that sorts foundational/large/high above aspirational/small/low.
27. **Markdown report formatter** produces a grouped, navigable report with `CRAFT-*` codes linked to `finding-codes.md` and rubric/pattern/exemplar names linked to their catalog entries.
28. **Confidence rendering.** Findings with low confidence visually distinguished in markdown output (e.g., italic or prefixed `(low confidence:)`).
29. **Skill SKILL.md follows the harness skill format** — passes the skill validator, includes When-to-Use, Process (3 phases), Harness Integration, Gates.

### Documentation

30. **AGENTS.md, designer-quickstart.md, finding-codes.md, contribution.md, growth-trajectory.md** all created/updated.
31. **Four ADRs filed** (ADR-004 through ADR-007) under `docs/knowledge/decisions/`.
32. **Four knowledge entries filed**: `llm-judgment-skills.md`, `craft-output-vocabulary.md`, `living-catalogs.md`, `detect-and-offer.md`.

### Composition with sub-projects #4 and #5

33. **MCP tool API is stable and documented** with versioned schema so #5 orchestrator can wrap it.
34. **Findings include a `runId`** so #4 verifier can detect fixpoint by comparing finding sets across iterations.
35. **`getCatalogStats()` export is stable** so dashboard and other skills can depend on it.

### Negative criteria

36. **No autofix / codemod applied.** POLISH produces suggestions only; source files unmodified.
37. **No always-on watching.** Skill is invocation-triggered (skill run, MCP, CI, autopilot).
38. **No replacement of harness-design.** Both skills coexist; #6 defers declared-anti-pattern findings.

---

## Implementation Order

Approach 3: parallel streams + convergence.

### Sprint 0 — Schema Spike (~1 day)

**Goal:** lock the 3-axis finding schema, 5-dim radar schema, rubric/pattern/exemplar contribution schemas BEFORE streams diverge.

**Deliverables:**
- Three rubrics, three patterns, three exemplars authored on paper against the proposed schemas
- BENCHMARK output specimen authored against radar schema
- Schema-fit review pass

**Exit criteria:** schemas accept all spec'd content without ambiguity. Both streams have locked-down input contracts.

### Sprint 1 (~7 days) — Streams A and B in parallel

**Stream A (engineering, ~7 days):**
- LLM provider integration (extending `packages/intelligence/` if needed for vision)
- 3-axis finding schema in code; 5-dim radar schema in code
- One rubric, one pattern, one exemplar wired end-to-end
- CRITIQUE phase end-to-end with 1 rubric
- POLISH and BENCHMARK phases skeletal (return empty arrays)
- MCP tool `harness-design-craft` with phase selector
- Skill SKILL.md + skill.yaml
- Visual pipeline SPIKE (playwright + vision LLM proof, not productionized)

**Stream B (curation, ~7 days):**
- 5 critique rubrics authored
- 5 polish patterns authored
- 25 exemplars curated (5 component types × 5 each)
- Contribution schema validator implementation alongside curation
- Documentation drafted (`contribution.md` draft, `growth-trajectory.md` draft)

**Exit criteria:**
- Vertical slice: end-to-end CRITIQUE run on fixture produces valid 3-axis finding
- Sprint 1 catalog: 5+5+25 items pass contribution schema validation
- Visual spike: playwright renders fixture component; vision LLM returns parsable response

**Stop conditions:** if schema needs revision → halt convergence; iterate before Sprint 2.

### Sprint 2 (~7 days) — Streams continue, visual productionization

**Stream A:**
- Productionize visual pipeline (render cache, viewport variants, error handling, cost tracking)
- POLISH phase end-to-end with first 3 patterns
- BENCHMARK phase end-to-end with first 5 exemplars
- B' detect-and-offer logic implementation
- `autoCapture` config flag wiring
- DesignConstraintAdapter extension for `CRAFT-*` codes + `CRAFT_SCORE` nodes

**Stream B:**
- Complete H seed catalog: remaining 5 rubrics, 10 patterns, 25 exemplars
- Peer review pass on Sprint 1 content
- Contribution review process spec finalization

**Exit criteria:**
- Full H seed catalog (10+15+50) ships
- Visual pipeline production-quality
- B' upgrade path works for all 4 precondition states

### Sprint 3 (~5 days) — Convergence + Growth infrastructure

- Wire full catalog into all 3 phases at scale
- Signal feedback loop implementation (CRITIQUE-recurrence → pattern-proposal)
- Usage measurement implementation (per-item counters)
- Dashboard stats page
- Integration testing across all phase × mode × precondition combinations
- `harness.config.json` schema extension validated
- i18n-style deferral wiring (defer declared-anti-pattern findings to harness-design)

**Exit criteria:**
- All 3 phases working end-to-end at full catalog scale
- Growth infrastructure operational (signal loop, measurement, contribution validation)
- Integration tests cover the matrix

### Sprint 4 (~5 days) — Polish

- ADRs filed (4)
- Knowledge entries filed (4)
- Documentation finalization (AGENTS.md, designer-quickstart.md, finding-codes.md, contribution.md, growth-trajectory.md)
- Performance baselines captured (fast-mode + deep-mode runtimes + LLM costs)
- LLM-mock test infrastructure for deterministic CI

**Exit criteria:** all Section "Success Criteria" pass.

**Stop conditions:** if visual pipeline reveals unfixable problems, downgrade Q3 to A (code-only) in the as-shipped spec.

### Dependencies and parallelism

- Sprint 0 must complete before Sprint 1
- Streams A and B run in parallel within Sprint 1 and Sprint 2
- Convergence happens at Sprint 3
- Polish at Sprint 4 has lighter dependencies; can absorb slip from earlier sprints
- Coordination: lock finding schema (3-axis + 5-dim radar) and contribution format on Sprint 1 day 1; both streams work against the locked schemas

### Re-entry points

- After Sprint 1: vertical slice + half-seed catalog usable for demos
- After Sprint 2: full seed catalog + visual pipeline usable for early adopters
- After Sprint 3: feature-complete, growth-ready
- After Sprint 4: production ship
