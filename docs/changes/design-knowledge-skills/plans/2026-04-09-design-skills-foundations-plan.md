# Plan: Design Knowledge Skills — Phase 1 Foundations

**Date:** 2026-04-09
**Spec:** docs/changes/design-knowledge-skills/proposal.md
**Estimated tasks:** 22
**Estimated time:** ~110 minutes

## Goal

Create 20 foundation-tier design knowledge skills (Color 6, Typography 7, Layout & Composition 6, Cross-cutting 1) across all 4 platforms, passing schema validation and structure tests.

## Observable Truths (Acceptance Criteria)

1. When `ls agents/skills/claude-code/ | grep "^design-"` is run, 20 directories are listed matching the skill names in this plan.
2. When `npx vitest run agents/skills/tests/structure.test.ts` is run, all 20 new skill.yaml files pass SkillMetadataSchema validation.
3. When `npx vitest run agents/skills/tests/structure.test.ts` is run, all 20 new SKILL.md files pass the knowledge-type section check (`## Instructions` required).
4. Each SKILL.md contains all 7 spec-required sections: `## When to Use`, `## Instructions`, `## Details`, `## Source`, `## Process`, `## Harness Integration`, `## Success Criteria`.
5. Each SKILL.md is 150-250 lines with at least 2 worked examples from real design systems and at least 3 anti-patterns.
6. When `diff -rq agents/skills/claude-code/design-color-harmony/SKILL.md agents/skills/gemini-cli/design-color-harmony/SKILL.md` is run, files are identical (and likewise for all 20 skills across all 4 platforms).
7. Each platform replica's skill.yaml has its `platforms` field set to the correct single-platform value (e.g., `- gemini-cli` for gemini-cli copies).
8. When `harness validate` is run, validation passes.

## File Map

### CREATE (claude-code) — 40 files in 20 directories

- CREATE agents/skills/claude-code/design-color-harmony/skill.yaml
- CREATE agents/skills/claude-code/design-color-harmony/SKILL.md
- CREATE agents/skills/claude-code/design-contrast-ratio/skill.yaml
- CREATE agents/skills/claude-code/design-contrast-ratio/SKILL.md
- CREATE agents/skills/claude-code/design-color-psychology/skill.yaml
- CREATE agents/skills/claude-code/design-color-psychology/SKILL.md
- CREATE agents/skills/claude-code/design-palette-construction/skill.yaml
- CREATE agents/skills/claude-code/design-palette-construction/SKILL.md
- CREATE agents/skills/claude-code/design-dark-mode-color/skill.yaml
- CREATE agents/skills/claude-code/design-dark-mode-color/SKILL.md
- CREATE agents/skills/claude-code/design-color-accessibility/skill.yaml
- CREATE agents/skills/claude-code/design-color-accessibility/SKILL.md
- CREATE agents/skills/claude-code/design-typography-fundamentals/skill.yaml
- CREATE agents/skills/claude-code/design-typography-fundamentals/SKILL.md
- CREATE agents/skills/claude-code/design-type-scale/skill.yaml
- CREATE agents/skills/claude-code/design-type-scale/SKILL.md
- CREATE agents/skills/claude-code/design-font-pairing/skill.yaml
- CREATE agents/skills/claude-code/design-font-pairing/SKILL.md
- CREATE agents/skills/claude-code/design-typographic-hierarchy/skill.yaml
- CREATE agents/skills/claude-code/design-typographic-hierarchy/SKILL.md
- CREATE agents/skills/claude-code/design-readability/skill.yaml
- CREATE agents/skills/claude-code/design-readability/SKILL.md
- CREATE agents/skills/claude-code/design-web-fonts/skill.yaml
- CREATE agents/skills/claude-code/design-web-fonts/SKILL.md
- CREATE agents/skills/claude-code/design-responsive-type/skill.yaml
- CREATE agents/skills/claude-code/design-responsive-type/SKILL.md
- CREATE agents/skills/claude-code/design-grid-systems/skill.yaml
- CREATE agents/skills/claude-code/design-grid-systems/SKILL.md
- CREATE agents/skills/claude-code/design-whitespace/skill.yaml
- CREATE agents/skills/claude-code/design-whitespace/SKILL.md
- CREATE agents/skills/claude-code/design-visual-hierarchy/skill.yaml
- CREATE agents/skills/claude-code/design-visual-hierarchy/SKILL.md
- CREATE agents/skills/claude-code/design-alignment/skill.yaml
- CREATE agents/skills/claude-code/design-alignment/SKILL.md
- CREATE agents/skills/claude-code/design-responsive-strategy/skill.yaml
- CREATE agents/skills/claude-code/design-responsive-strategy/SKILL.md
- CREATE agents/skills/claude-code/design-content-density/skill.yaml
- CREATE agents/skills/claude-code/design-content-density/SKILL.md
- CREATE agents/skills/claude-code/design-consistency/skill.yaml
- CREATE agents/skills/claude-code/design-consistency/SKILL.md

### CREATE (platform replicas) — 120 files in 60 directories

- CREATE agents/skills/gemini-cli/design-\*/skill.yaml (20 files, platforms field: `- gemini-cli`)
- CREATE agents/skills/gemini-cli/design-\*/SKILL.md (20 files, identical to claude-code)
- CREATE agents/skills/cursor/design-\*/skill.yaml (20 files, platforms field: `- cursor`)
- CREATE agents/skills/cursor/design-\*/SKILL.md (20 files, identical to claude-code)
- CREATE agents/skills/codex/design-\*/skill.yaml (20 files, platforms field: `- codex`)
- CREATE agents/skills/codex/design-\*/SKILL.md (20 files, identical to claude-code)

**Total: 160 files in 80 directories.**

## Skeleton

1. Color domain skills in claude-code (~6 tasks, ~30 min)
2. Typography domain skills in claude-code (~7 tasks, ~35 min)
3. Layout & Composition domain skills in claude-code (~6 tasks, ~30 min)
4. Cross-cutting skill in claude-code (~1 task, ~5 min)
5. Platform replication (~1 task, ~5 min)
6. Validation (~1 task, ~5 min)

**Estimated total:** 22 tasks, ~110 minutes

## Shared Patterns

### skill.yaml Template

Every skill.yaml in this plan follows the same structure. Only these fields vary per skill:

- `name` — the skill directory name
- `description` — one-line description from the spec taxonomy table
- `related_skills` — from the spec taxonomy table
- `keywords` — domain-specific terms for dispatcher scoring

All other fields are constant:

```yaml
version: '1.0.0'
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
stack_signals: []
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

### SKILL.md Template

Every SKILL.md follows the spec structure (see proposal.md lines 88-142). Required sections:

1. `# <Title>` — h1 heading (required by structure.test.ts line 46)
2. `> <description>` — blockquote
3. `## When to Use` — trigger conditions
4. `## Instructions` — step-by-step with concrete values (required by structure.test.ts line 61)
5. `## Details` — sub-topics, anti-patterns, real-world examples
6. `## Source` — authoritative references
7. `## Process` — standard 3-step process block
8. `## Harness Integration` — standard knowledge integration block
9. `## Success Criteria` — standard criteria block

Each SKILL.md must be **150-250 lines**, include **at least 2 worked examples** from real design systems (Stripe, Apple, Vercel, Material Design, etc.) with specific values, and include **at least 3 anti-patterns**.

### SKILL.md Content Quality Requirements

From the spec hard rules:

- **No "use your judgment"** — every principle includes concrete decision procedures
- **Framework-agnostic** — teach what good design is, not how to write CSS
- **PhD-level rigor, practitioner-level accessibility** — no dumbed-down summaries, no unexplained jargon
- **Specific values** — not "use a nice blue" but "Stripe uses `#533afd` because saturated violet reads as confident and premium in fintech contexts"
- **Anti-patterns describe what bad looks like** — so the reader can self-diagnose mistakes

---

## Tasks

### Task 1: design-color-harmony

**Depends on:** none
**Files:** agents/skills/claude-code/design-color-harmony/skill.yaml, agents/skills/claude-code/design-color-harmony/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/design-color-harmony`

2. Create `agents/skills/claude-code/design-color-harmony/skill.yaml`:

```yaml
name: design-color-harmony
version: '1.0.0'
description: Color wheel relationships — complementary, analogous, triadic, split-complementary, tetradic schemes
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - design-color-psychology
  - design-palette-construction
  - design-contrast-ratio
stack_signals: []
keywords:
  - color wheel
  - complementary
  - analogous
  - triadic
  - split-complementary
  - tetradic
  - color scheme
  - hue relationships
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/design-color-harmony/SKILL.md` (150-250 lines):
   - Cover: color wheel fundamentals, 5 harmony types (complementary, analogous, triadic, split-complementary, tetradic), temperature relationships, saturation/value coordination within schemes
   - Worked examples: Stripe's purple-teal complementary pair, Material Design 3's tonal palettes derived from a single seed hue, Vercel's analogous neutral scheme
   - Anti-patterns: rainbow effect (too many unrelated hues), false harmony (colors that are technically harmonious but clash in context), ignoring value/saturation (selecting hues without coordinating lightness)
   - Sources: Itten's color theory, Munsell color system, Material Design 3 color docs

4. Run: `harness validate`
5. Commit: `feat(skills): add design-color-harmony knowledge skill`

---

### Task 2: design-contrast-ratio

**Depends on:** none
**Files:** agents/skills/claude-code/design-contrast-ratio/skill.yaml, agents/skills/claude-code/design-contrast-ratio/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/design-contrast-ratio`

2. Create `agents/skills/claude-code/design-contrast-ratio/skill.yaml`:

```yaml
name: design-contrast-ratio
version: '1.0.0'
description: Luminance contrast for readability and visual weight — WCAG ratios, contrast as hierarchy tool
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - design-color-harmony
  - design-color-accessibility
  - a11y-color-contrast
  - design-visual-hierarchy
stack_signals: []
keywords:
  - contrast ratio
  - luminance
  - WCAG
  - readability
  - visual weight
  - AA
  - AAA
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/design-contrast-ratio/SKILL.md` (150-250 lines):
   - Cover: relative luminance formula, WCAG AA/AAA thresholds, contrast as hierarchy tool (not just accessibility), contrast zones (high-contrast for primary actions, mid for secondary, low for decorative)
   - Worked examples: Apple's use of contrast tiers (primary text at 17:1, secondary at 7:1, tertiary at 4.5:1), Stripe's Dashboard contrast hierarchy, Material Design's on-surface opacity levels mapped to contrast ratios
   - Anti-patterns: gray-on-gray (insufficient contrast masquerading as elegance), contrast overload (everything at maximum contrast destroys hierarchy), ignoring non-text contrast (UI components below 3:1)
   - Sources: WCAG 2.1 Success Criterion 1.4.3, 1.4.6, 1.4.11; W3C relative luminance definition

4. Run: `harness validate`
5. Commit: `feat(skills): add design-contrast-ratio knowledge skill`

---

### Task 3: design-color-psychology

**Depends on:** none
**Files:** agents/skills/claude-code/design-color-psychology/skill.yaml, agents/skills/claude-code/design-color-psychology/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/design-color-psychology`

2. Create `agents/skills/claude-code/design-color-psychology/skill.yaml`:

```yaml
name: design-color-psychology
version: '1.0.0'
description: Emotional and cultural color associations — warmth/coolness, trust, urgency, industry conventions
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - design-color-harmony
  - design-brand-consistency
stack_signals: []
keywords:
  - color psychology
  - color meaning
  - emotional associations
  - cultural color
  - warmth
  - coolness
  - trust
  - urgency
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/design-color-psychology/SKILL.md` (150-250 lines):
   - Cover: warm/cool temperature effects, cultural variation (red = luck in China, danger in Western), industry conventions (blue = finance/trust, green = health/growth), emotional valence per hue family, saturation/lightness effects on perceived emotion
   - Worked examples: Why Stripe chose violet (#533afd) — saturated purple reads as confident and premium in fintech, why Calm uses deep blue — low-arousal color for relaxation apps, why Shopify uses green — growth/commerce association
   - Anti-patterns: cultural blindness (using white for celebration in cultures where white = mourning), category confusion (green for errors, red for success), mood mismatch (aggressive red for a meditation app)
   - Sources: Elliot & Maier (2014) color psychology research, cross-cultural color studies

4. Run: `harness validate`
5. Commit: `feat(skills): add design-color-psychology knowledge skill`

---

### Task 4: design-palette-construction

**Depends on:** none
**Files:** agents/skills/claude-code/design-palette-construction/skill.yaml, agents/skills/claude-code/design-palette-construction/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/design-palette-construction`

2. Create `agents/skills/claude-code/design-palette-construction/skill.yaml`:

```yaml
name: design-palette-construction
version: '1.0.0'
description: Building functional palettes — primary/secondary/accent, neutral scales, semantic colors, tint/shade generation
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - design-color-harmony
  - design-color-accessibility
  - design-dark-mode-color
  - design-token-architecture
stack_signals: []
keywords:
  - palette
  - primary color
  - secondary color
  - accent
  - neutral scale
  - semantic colors
  - tint
  - shade
  - color system
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/design-palette-construction/SKILL.md` (150-250 lines):
   - Cover: palette anatomy (primary/secondary/accent/neutral/semantic), generating tint/shade scales (10 steps from 50-950), neutral scale construction (warm vs cool neutrals), semantic color mapping (success/warning/error/info), the 60-30-10 distribution rule
   - Worked examples: Tailwind CSS color scale generation (50-950 with perceptual uniformity), Material Design 3's HCT color space for tonal palettes from a single seed, Stripe's functional palette (brand purple + neutral slate + semantic traffic lights)
   - Anti-patterns: too many primaries (more than 2 brand colors competing), missing neutral scale (no grays = no hierarchy), semantic ambiguity (using the same green for both "success" and "go/action")
   - Sources: Material Design 3 color system, Tailwind CSS color palette docs, RefactoringUI color guidelines

4. Run: `harness validate`
5. Commit: `feat(skills): add design-palette-construction knowledge skill`

---

### Task 5: design-dark-mode-color

**Depends on:** none
**Files:** agents/skills/claude-code/design-dark-mode-color/skill.yaml, agents/skills/claude-code/design-dark-mode-color/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/design-dark-mode-color`

2. Create `agents/skills/claude-code/design-dark-mode-color/skill.yaml`:

```yaml
name: design-dark-mode-color
version: '1.0.0'
description: Color adaptation for dark themes — inverted hierarchy, reduced saturation, elevation through lightness
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - design-palette-construction
  - design-elevation-shadow
  - design-contrast-ratio
  - css-dark-mode
stack_signals: []
keywords:
  - dark mode
  - dark theme
  - inverted hierarchy
  - reduced saturation
  - elevation
  - surface tint
  - night mode
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/design-dark-mode-color/SKILL.md` (150-250 lines):
   - Cover: why dark mode is not "invert colors" — hierarchy inverts (light = elevated, not recessed), saturation reduction (vivid colors on dark backgrounds cause halation), surface elevation via lightness tint, background layering (#121212 base with progressively lighter surfaces), text opacity (87%/60%/38% for primary/secondary/disabled on dark)
   - Worked examples: Material Design 3's surface tint system (primary color at 5%/8%/11%/12%/14% opacity over #1C1B1F), Apple's semantic system colors that auto-adapt (systemBlue shifts from #007AFF to #0A84FF in dark mode), GitHub's dark mode primer palette
   - Anti-patterns: pure black backgrounds (#000000 causes excessive contrast and eye fatigue — use #121212 or similar), inverting light mode palette directly (colors that look great on white look garish on dark), shadows on dark (shadows are invisible on dark surfaces — use lighter borders or surface tints instead)
   - Sources: Material Design dark theme guide, Apple HIG dark mode, W3C WCAG contrast in dark mode

4. Run: `harness validate`
5. Commit: `feat(skills): add design-dark-mode-color knowledge skill`

---

### Task 6: design-color-accessibility

**Depends on:** none
**Files:** agents/skills/claude-code/design-color-accessibility/skill.yaml, agents/skills/claude-code/design-color-accessibility/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/design-color-accessibility`

2. Create `agents/skills/claude-code/design-color-accessibility/skill.yaml`:

```yaml
name: design-color-accessibility
version: '1.0.0'
description: Color independence — conveying information without color alone, colorblind-safe palettes, perceptual uniformity
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - design-contrast-ratio
  - design-palette-construction
  - a11y-color-contrast
stack_signals: []
keywords:
  - colorblind
  - color independence
  - deuteranopia
  - protanopia
  - tritanopia
  - perceptual uniformity
  - accessible palette
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/design-color-accessibility/SKILL.md` (150-250 lines):
   - Cover: types of color vision deficiency (protanopia/deuteranopia/tritanopia/achromatopsia with prevalence), WCAG 1.4.1 Use of Color, redundant encoding (color + shape + label), perceptually uniform color spaces (OKLCH, CIELAB) for palette generation, safe color pairs (blue+orange, blue+red avoid the red-green confusion zone)
   - Worked examples: Material Design's use of shape + color for chip states, Stripe's error states using icon + color + text label, IBM's colorblind-safe data visualization palette (8 distinct colors all distinguishable under all CVD types)
   - Anti-patterns: traffic light reliance (red/yellow/green status without icons or text), hue-only differentiation in charts (series distinguishable only by hue shift), using red-green as the primary semantic pair without alternatives
   - Sources: WCAG 2.1 SC 1.4.1, Colour Blind Awareness statistics, Machado et al. (2009) CVD simulation

4. Run: `harness validate`
5. Commit: `feat(skills): add design-color-accessibility knowledge skill`

---

### Task 7: design-typography-fundamentals

**Depends on:** none
**Files:** agents/skills/claude-code/design-typography-fundamentals/skill.yaml, agents/skills/claude-code/design-typography-fundamentals/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/design-typography-fundamentals`

2. Create `agents/skills/claude-code/design-typography-fundamentals/skill.yaml`:

```yaml
name: design-typography-fundamentals
version: '1.0.0'
description: Anatomy of type — x-height, ascenders, counters, serifs, stroke contrast, optical sizing
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - design-type-scale
  - design-font-pairing
  - design-readability
stack_signals: []
keywords:
  - typography
  - x-height
  - ascender
  - descender
  - serif
  - sans-serif
  - stroke contrast
  - optical sizing
  - typeface anatomy
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/design-typography-fundamentals/SKILL.md` (150-250 lines):
   - Cover: typeface anatomy (baseline, x-height, cap height, ascenders, descenders, counters, bowls, terminals), classification system (serif, sans-serif, slab, monospace, display), stroke contrast and how it affects readability at size, optical sizing (why a font looks different at 12px vs 72px), metrics that matter for UI (x-height ratio determines perceived size)
   - Worked examples: Inter's tall x-height (0.756 ratio) designed for screen legibility, Apple's SF Pro using optical sizing (text vs display cuts), how Stripe uses weight-300 Inter for headlines to achieve elegance without fragility
   - Anti-patterns: display fonts at body size (decorative typefaces become unreadable below 16px), ignoring x-height when comparing font sizes (Georgia at 16px reads larger than Futura at 16px), treating all sans-serifs as interchangeable
   - Sources: Bringhurst "The Elements of Typographic Style", Google Fonts knowledge base, Rasmus Andersson's Inter design notes

4. Run: `harness validate`
5. Commit: `feat(skills): add design-typography-fundamentals knowledge skill`

---

### Task 8: design-type-scale

**Depends on:** none
**Files:** agents/skills/claude-code/design-type-scale/skill.yaml, agents/skills/claude-code/design-type-scale/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/design-type-scale`

2. Create `agents/skills/claude-code/design-type-scale/skill.yaml`:

```yaml
name: design-type-scale
version: '1.0.0'
description: Mathematical type scales — modular, major third, perfect fourth, golden ratio, custom scales
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - design-typography-fundamentals
  - design-visual-hierarchy
  - design-responsive-type
stack_signals: []
keywords:
  - type scale
  - modular scale
  - major third
  - perfect fourth
  - golden ratio
  - font size
  - scale ratio
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/design-type-scale/SKILL.md` (150-250 lines):
   - Cover: what a type scale is and why it matters (consistent sizing creates visual rhythm), common ratios (minor second 1.067, major second 1.125, minor third 1.2, major third 1.25, perfect fourth 1.333, golden ratio 1.618), how to choose a ratio (tighter ratios for data-dense apps, wider for marketing), generating scale values from a base size, mapping scale steps to semantic names (body, h6, h5, h4, h3, h2, h1, display)
   - Worked examples: Material Design 3's type scale (14 named styles from label-small at 11px to display-large at 57px using a custom scale), Tailwind's type scale (xs through 9xl, roughly a major second), Vercel's minimal scale (limited to 5 sizes — 14, 16, 20, 24, 32 — for extreme constraint)
   - Anti-patterns: too many sizes (more than 8-10 creates decision paralysis and inconsistency), arbitrary sizes (14, 15, 17, 19 — no mathematical relationship = no rhythm), one-ratio-fits-all (using golden ratio for a data dashboard yields absurdly large headers)
   - Sources: Robert Bringhurst, Tim Brown's Modular Scale, type-scale.com, Material Design type system

4. Run: `harness validate`
5. Commit: `feat(skills): add design-type-scale knowledge skill`

---

### Task 9: design-font-pairing

**Depends on:** none
**Files:** agents/skills/claude-code/design-font-pairing/skill.yaml, agents/skills/claude-code/design-font-pairing/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/design-font-pairing`

2. Create `agents/skills/claude-code/design-font-pairing/skill.yaml`:

```yaml
name: design-font-pairing
version: '1.0.0'
description: Combining typefaces — contrast principles, superfamilies, serif+sans rules, limiting to 2-3 families
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - design-typography-fundamentals
  - design-type-scale
  - design-brand-consistency
stack_signals: []
keywords:
  - font pairing
  - typeface combination
  - serif sans-serif
  - superfamily
  - contrast
  - concord
  - font stack
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/design-font-pairing/SKILL.md` (150-250 lines):
   - Cover: the concord/contrast/conflict model, superfamilies (one family with serif + sans variants), serif+sans pairing principles (match x-height, contrast in classification not in quality), the 2-3 family maximum rule, single-family strategies (weight and style variation within one typeface), how to evaluate a pairing (set real UI text, not pangrams)
   - Worked examples: Stripe's Inter (UI) + system serif for long-form (contrast through classification), Apple's SF Pro + New York (same design DNA, different classification), Material Design's Roboto + Roboto Slab (superfamily approach)
   - Anti-patterns: two similar sans-serifs (Helvetica + Arial = conflict, not contrast), more than 3 families (visual cacophony), pairing by aesthetic feeling without checking x-height compatibility (one looks much larger/smaller than the other at the same px size)
   - Sources: Bringhurst on combining typefaces, Google Fonts pairing suggestions, Bethany Heck's Font Review Journal

4. Run: `harness validate`
5. Commit: `feat(skills): add design-font-pairing knowledge skill`

---

### Task 10: design-typographic-hierarchy

**Depends on:** none
**Files:** agents/skills/claude-code/design-typographic-hierarchy/skill.yaml, agents/skills/claude-code/design-typographic-hierarchy/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/design-typographic-hierarchy`

2. Create `agents/skills/claude-code/design-typographic-hierarchy/skill.yaml`:

```yaml
name: design-typographic-hierarchy
version: '1.0.0'
description: Reading order through type — size, weight, color, spacing, case, and position as hierarchy signals
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - design-type-scale
  - design-visual-hierarchy
  - design-whitespace
stack_signals: []
keywords:
  - typographic hierarchy
  - reading order
  - heading levels
  - weight
  - emphasis
  - visual priority
  - scanning
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/design-typographic-hierarchy/SKILL.md` (150-250 lines):
   - Cover: the 6 hierarchy levers (size, weight, color, spacing, case, position), primary/secondary/tertiary levels, squint test (hierarchy should be readable at 25% zoom), establishing hierarchy with a single font (weight + size + color), the role of whitespace in separating hierarchy levels, heading levels and their relationship to visual hierarchy (they can diverge)
   - Worked examples: Vercel's documentation hierarchy (3 distinct levels using only Inter — size + weight + color), Stripe's API docs (monospace for code, weight for emphasis, size for sections), Apple's marketing pages (massive display type > subhead > body = clear 3-tier)
   - Anti-patterns: everything-is-bold (when everything is emphasized, nothing is), too many levels (more than 4-5 active hierarchy levels on one page confuses), size as the only differentiator (all the same weight and color, just bigger = weak hierarchy)
   - Sources: Lupton "Thinking with Type", Butterick's Practical Typography, Material Design typography guidelines

4. Run: `harness validate`
5. Commit: `feat(skills): add design-typographic-hierarchy knowledge skill`

---

### Task 11: design-readability

**Depends on:** none
**Files:** agents/skills/claude-code/design-readability/skill.yaml, agents/skills/claude-code/design-readability/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/design-readability`

2. Create `agents/skills/claude-code/design-readability/skill.yaml`:

```yaml
name: design-readability
version: '1.0.0'
description: Optimizing for reading — line length, leading, paragraph spacing, alignment, F-pattern/Z-pattern
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - design-typography-fundamentals
  - design-content-density
  - design-responsive-type
stack_signals: []
keywords:
  - readability
  - line length
  - measure
  - leading
  - line height
  - paragraph spacing
  - alignment
  - F-pattern
  - Z-pattern
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/design-readability/SKILL.md` (150-250 lines):
   - Cover: optimal line length (45-75 characters, 66 ideal for single column), leading (1.4-1.6x for body text, 1.1-1.2x for headings), paragraph spacing (0.5-1.0em between paragraphs), text alignment (left for LTR body, center sparingly, justified only with good hyphenation), reading patterns (F-pattern for content-heavy, Z-pattern for sparse layouts), the relationship between font size, line height, and measure
   - Worked examples: Stripe's documentation (max-width: 680px for ~70 characters per line, line-height: 1.625), Apple's developer docs (16px base, 1.47 line-height, ~80ch max-width), Medium's reading optimization (21px body, 1.58 line-height, 680px max-width)
   - Anti-patterns: full-width text (100% viewport body text on wide screens = 150+ characters per line), cramped leading (line-height: 1.0-1.2 for body text), justified text without hyphenation (rivers of white space)
   - Sources: Bringhurst on measure, Butterick's Practical Typography, Nielsen Norman Group reading pattern research

4. Run: `harness validate`
5. Commit: `feat(skills): add design-readability knowledge skill`

---

### Task 12: design-web-fonts

**Depends on:** none
**Files:** agents/skills/claude-code/design-web-fonts/skill.yaml, agents/skills/claude-code/design-web-fonts/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/design-web-fonts`

2. Create `agents/skills/claude-code/design-web-fonts/skill.yaml`:

```yaml
name: design-web-fonts
version: '1.0.0'
description: Font loading strategy — performance vs. FOUT/FOIT, variable fonts, subsetting, system font stacks
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - design-typography-fundamentals
  - design-responsive-type
stack_signals: []
keywords:
  - web fonts
  - font loading
  - FOUT
  - FOIT
  - variable fonts
  - subsetting
  - system fonts
  - font-display
  - woff2
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/design-web-fonts/SKILL.md` (150-250 lines):
   - Cover: font loading strategies (font-display: swap/optional/fallback), FOUT vs FOIT tradeoffs, variable fonts (single file for multiple weights/widths, size savings), subsetting (Latin-only reduces Inter from 300KB to 20KB), system font stacks as zero-cost fallback, font file formats (WOFF2 only for modern browsers), preloading critical fonts, self-hosting vs CDN tradeoffs
   - Worked examples: Next.js font optimization (automatic subsetting + preloading via next/font), Vercel's system font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, ...`), GitHub's approach (system fonts for UI, custom font only for marketing)
   - Anti-patterns: loading 6+ font files on initial page load (>500KB total), no fallback font specified (invisible text during load), loading full character sets for Latin-only content, using font-display: block (3-second invisible text)
   - Sources: web.dev font best practices, MDN font-display, Google Fonts API documentation

4. Run: `harness validate`
5. Commit: `feat(skills): add design-web-fonts knowledge skill`

---

### Task 13: design-responsive-type

**Depends on:** none
**Files:** agents/skills/claude-code/design-responsive-type/skill.yaml, agents/skills/claude-code/design-responsive-type/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/design-responsive-type`

2. Create `agents/skills/claude-code/design-responsive-type/skill.yaml`:

```yaml
name: design-responsive-type
version: '1.0.0'
description: Type across viewports — fluid typography (clamp), viewport scaling, minimum sizes, maintaining hierarchy
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - design-type-scale
  - design-readability
  - design-responsive-strategy
stack_signals: []
keywords:
  - responsive type
  - fluid typography
  - clamp
  - viewport units
  - minimum font size
  - scaling
  - responsive font
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/design-responsive-type/SKILL.md` (150-250 lines):
   - Cover: the problem (fixed sizes create either too-small mobile text or too-large desktop text), CSS clamp() for fluid type (`clamp(min, preferred, max)`), calculating preferred value (`vw + rem` formula), maintaining hierarchy ratio across breakpoints, minimum readable sizes (16px body minimum on mobile), when to use breakpoints vs fluid scaling, viewport unit limitations (very large/small screens)
   - Worked examples: Utopia fluid type calculator approach (16px-20px body across 320px-1240px viewport), Material Design's responsive type scale (specific sizes at compact/medium/expanded breakpoints), Tailwind's responsive text utilities mapped to design intent
   - Anti-patterns: pure vw units (text becomes microscopic on small screens, enormous on large), too many breakpoint overrides (5+ breakpoints for font sizes = maintenance nightmare), shrinking body text below 14px on any viewport, non-proportional scaling (headings grow but body stays fixed, destroying hierarchy)
   - Sources: Utopia.fyi fluid type documentation, CSS-Tricks fluid typography guide, WCAG 1.4.4 Resize Text

4. Run: `harness validate`
5. Commit: `feat(skills): add design-responsive-type knowledge skill`

---

### Task 14: design-grid-systems

**Depends on:** none
**Files:** agents/skills/claude-code/design-grid-systems/skill.yaml, agents/skills/claude-code/design-grid-systems/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/design-grid-systems`

2. Create `agents/skills/claude-code/design-grid-systems/skill.yaml`:

```yaml
name: design-grid-systems
version: '1.0.0'
description: Grid theory — column, modular, baseline, compound grids, breaking the grid intentionally
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - design-alignment
  - design-whitespace
  - design-responsive-strategy
stack_signals: []
keywords:
  - grid
  - column grid
  - modular grid
  - baseline grid
  - gutter
  - margin
  - grid breakout
  - layout grid
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/design-grid-systems/SKILL.md` (150-250 lines):
   - Cover: grid types (column, modular, baseline, manuscript, compound), anatomy (columns, gutters, margins, fields), choosing column count (4 mobile, 8 tablet, 12 desktop as standard), gutter sizing (16px-24px typical, proportional to column width), baseline grid (type sits on a consistent vertical rhythm, typically 4px or 8px), breaking the grid intentionally (full-bleed images, feature sections — the break creates emphasis because it violates the established pattern)
   - Worked examples: Material Design's responsive grid (4/8/12 columns with 16px gutters), Stripe's marketing grid (12-column with generous margins creating a narrow content well), Apple's developer documentation grid (single-column manuscript with sidebar)
   - Anti-patterns: gutterless grids (content collides without breathing room), inconsistent margins (left margin 20px, right margin 32px — not a system), the 12-column trap (forcing everything into 12 columns when a simpler grid would suffice), ignoring the baseline (vertical spacing that is arbitrary rather than rhythmic)
   - Sources: Josef Muller-Brockmann "Grid Systems", Material Design layout documentation, Massimo Vignelli "The Vignelli Canon"

4. Run: `harness validate`
5. Commit: `feat(skills): add design-grid-systems knowledge skill`

---

### Task 15: design-whitespace

**Depends on:** none
**Files:** agents/skills/claude-code/design-whitespace/skill.yaml, agents/skills/claude-code/design-whitespace/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/design-whitespace`

2. Create `agents/skills/claude-code/design-whitespace/skill.yaml`:

```yaml
name: design-whitespace
version: '1.0.0'
description: Space as design element — macro vs. micro, breathing room, density control, whitespace as luxury signal
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - design-grid-systems
  - design-content-density
  - design-visual-hierarchy
stack_signals: []
keywords:
  - whitespace
  - negative space
  - spacing
  - padding
  - margin
  - breathing room
  - density
  - macro space
  - micro space
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/design-whitespace/SKILL.md` (150-250 lines):
   - Cover: macro vs micro whitespace (page margins vs letter-spacing), whitespace as grouping mechanism (Gestalt proximity — more space between = less related), spacing scales (4px base unit: 4, 8, 12, 16, 24, 32, 48, 64, 96), whitespace as luxury signal (premium brands use more), active vs passive whitespace (intentional design decisions vs leftover space), the paradox that adding whitespace often makes a layout feel more organized despite having less content
   - Worked examples: Apple's product pages (massive whitespace between sections signals premium), Stripe's dashboard (consistent 8px-based spacing scale), Vercel's homepage (generous padding creates calm, focused reading)
   - Anti-patterns: horror vacui (fear of empty space — filling every gap with content or decoration), inconsistent spacing (8px here, 13px there, 20px somewhere else — no system), equal spacing everywhere (uniform spacing eliminates grouping signals and hierarchy)
   - Sources: Muller-Brockmann on space, Refactoring UI spacing guidelines, Material Design spacing documentation

4. Run: `harness validate`
5. Commit: `feat(skills): add design-whitespace knowledge skill`

---

### Task 16: design-visual-hierarchy

**Depends on:** none
**Files:** agents/skills/claude-code/design-visual-hierarchy/skill.yaml, agents/skills/claude-code/design-visual-hierarchy/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/design-visual-hierarchy`

2. Create `agents/skills/claude-code/design-visual-hierarchy/skill.yaml`:

```yaml
name: design-visual-hierarchy
version: '1.0.0'
description: Directing attention — size, color, contrast, position, isolation, motion as hierarchy tools
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - design-typographic-hierarchy
  - design-contrast-ratio
  - design-whitespace
  - design-gestalt-proximity
stack_signals: []
keywords:
  - visual hierarchy
  - attention
  - focal point
  - emphasis
  - dominance
  - subordination
  - visual weight
  - scanning
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/design-visual-hierarchy/SKILL.md` (150-250 lines):
   - Cover: the 7 hierarchy tools (size, color, contrast, position, isolation/whitespace, texture/detail, motion), visual weight (what makes an element "heavier" — dark, large, saturated, complex), the squint test and blur test for validating hierarchy, F-pattern and Z-pattern eye tracking, creating a clear entry point (every page should have exactly one dominant element), primary/secondary/tertiary hierarchy as a system
   - Worked examples: Stripe's homepage (massive headline is entry point > subtext > CTA button — 3 clear tiers), Apple's product pages (hero image dominates > product name > specs), Vercel's dashboard (active navigation item uses weight + color, content area uses size hierarchy)
   - Anti-patterns: competing focal points (two elements of equal visual weight fight for attention), flat hierarchy (everything the same size, weight, and color — nothing stands out), decoration masquerading as content (ornamental elements draw more attention than the actual content)
   - Sources: Dondis "A Primer of Visual Literacy", Nielsen Norman Group eye-tracking research, Weinschenk "100 Things Every Designer Needs to Know About People"

4. Run: `harness validate`
5. Commit: `feat(skills): add design-visual-hierarchy knowledge skill`

---

### Task 17: design-alignment

**Depends on:** none
**Files:** agents/skills/claude-code/design-alignment/skill.yaml, agents/skills/claude-code/design-alignment/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/design-alignment`

2. Create `agents/skills/claude-code/design-alignment/skill.yaml`:

```yaml
name: design-alignment
version: '1.0.0'
description: Visual order — edge, center, optical vs. mathematical alignment, alignment as invisible structure
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - design-grid-systems
  - design-consistency
stack_signals: []
keywords:
  - alignment
  - edge alignment
  - center alignment
  - optical alignment
  - mathematical alignment
  - visual order
  - invisible structure
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/design-alignment/SKILL.md` (150-250 lines):
   - Cover: types of alignment (left/right edge, center, top/bottom baseline), strong vs weak alignment axes (left edge alignment creates a strong vertical line the eye follows), optical vs mathematical alignment (a triangle centered mathematically looks off-center visually — optical center is slightly above mathematical center), alignment as invisible structure (consistent left edges create a line even with no visible line drawn), reducing alignment lines (fewer distinct alignment points = cleaner design), cross-element alignment (aligning elements across different sections creates cohesion)
   - Worked examples: Apple's product comparison tables (every element on a strict baseline grid), Stripe's pricing cards (content within cards aligns across cards), Material Design's list items (leading icon, primary text, and trailing element all on strict alignment rails)
   - Anti-patterns: centered everything (center alignment is weak — it creates no strong edge, making layouts feel floaty), approximate alignment (3px off looks like a mistake, not a design choice — either align exactly or offset intentionally), mixing alignment systems (left-aligned heading, centered body, right-aligned caption on the same page)
   - Sources: Robin Williams "The Non-Designer's Design Book", Muller-Brockmann grid systems, Apple HIG alignment guidelines

4. Run: `harness validate`
5. Commit: `feat(skills): add design-alignment knowledge skill`

---

### Task 18: design-responsive-strategy

**Depends on:** none
**Files:** agents/skills/claude-code/design-responsive-strategy/skill.yaml, agents/skills/claude-code/design-responsive-strategy/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/design-responsive-strategy`

2. Create `agents/skills/claude-code/design-responsive-strategy/skill.yaml`:

```yaml
name: design-responsive-strategy
version: '1.0.0'
description: Responsive as design decision — content priority, progressive disclosure, design-first breakpoints
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - design-grid-systems
  - design-responsive-type
  - design-content-density
stack_signals: []
keywords:
  - responsive design
  - breakpoints
  - mobile first
  - content priority
  - progressive disclosure
  - adaptive
  - viewport
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/design-responsive-strategy/SKILL.md` (150-250 lines):
   - Cover: content-first breakpoints (set breakpoints where the content breaks, not at device widths), mobile-first as a design constraint (what is essential? start there), progressive disclosure (show core content first, reveal details on demand or at larger sizes), responsive patterns (reflow, stack, reveal, off-canvas, resize), what changes across breakpoints (layout, density, navigation pattern, content visibility), what should NOT change (brand, hierarchy, core functionality)
   - Worked examples: Stripe's docs (sidebar collapses to off-canvas below 768px, content reflows from 2-column to 1-column), Material Design's responsive scaffolding (navigation rail > drawer at 600dp, top bar > bottom bar on compact), Apple's product pages (hero image resizes, feature grid stacks, comparison table becomes swipeable cards)
   - Anti-patterns: device-width breakpoints (designing for "iPhone" instead of content needs), hiding critical content on mobile (mobile users have the same goals as desktop users), responsive as afterthought (designing for desktop then squeezing into mobile), breakpoint cliffs (dramatic layout change at exactly 768px with no transition)
   - Sources: Ethan Marcotte "Responsive Web Design", Luke Wroblewski "Mobile First", Material Design responsive layout guidelines

4. Run: `harness validate`
5. Commit: `feat(skills): add design-responsive-strategy knowledge skill`

---

### Task 19: design-content-density

**Depends on:** none
**Files:** agents/skills/claude-code/design-content-density/skill.yaml, agents/skills/claude-code/design-content-density/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/design-content-density`

2. Create `agents/skills/claude-code/design-content-density/skill.yaml`:

```yaml
name: design-content-density
version: '1.0.0'
description: Information density tradeoffs — compact vs. comfortable vs. spacious, data-dense vs. marketing
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - design-whitespace
  - design-readability
  - design-responsive-strategy
stack_signals: []
keywords:
  - content density
  - information density
  - compact
  - comfortable
  - spacious
  - data-dense
  - scanability
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/design-content-density/SKILL.md` (150-250 lines):
   - Cover: density as a design variable (not a bug), the density spectrum (compact/comfortable/spacious), matching density to context (data tables = compact, marketing = spacious, dashboards = comfortable), Tufte's data-ink ratio (maximize data, minimize chrome), density controls (let users choose — Gmail's compact/cozy/comfortable), how density interacts with typography (tighter leading, smaller body, reduced margins for compact), progressive density (overview sparse, detail view dense)
   - Worked examples: Bloomberg Terminal (extreme density — every pixel carries information, appropriate for expert users), Stripe Dashboard (comfortable density — balanced data display with breathing room), Apple's product pages (spacious density — one idea per viewport, maximum whitespace)
   - Anti-patterns: one density for all contexts (marketing page density on a data table = wasted space; data table density on a landing page = overwhelming), density without hierarchy (cramming content together without visual priority = wall of text), user-hostile density (compact by default with no option to increase spacing for accessibility)
   - Sources: Edward Tufte "The Visual Display of Quantitative Information", Material Design density guidelines, Nielsen Norman Group information density research

4. Run: `harness validate`
5. Commit: `feat(skills): add design-content-density knowledge skill`

---

### Task 20: design-consistency

**Depends on:** none
**Files:** agents/skills/claude-code/design-consistency/skill.yaml, agents/skills/claude-code/design-consistency/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/design-consistency`

2. Create `agents/skills/claude-code/design-consistency/skill.yaml`:

```yaml
name: design-consistency
version: '1.0.0'
description: Internal vs. external consistency — within-product patterns, platform adherence, breaking consistency deliberately
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - design-alignment
  - design-gestalt-similarity
  - design-brand-consistency
  - design-design-governance
stack_signals: []
keywords:
  - consistency
  - internal consistency
  - external consistency
  - platform conventions
  - design patterns
  - predictability
  - intentional inconsistency
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/design-consistency/SKILL.md` (150-250 lines):
   - Cover: types of consistency (internal — within-product, external — with platform/industry conventions), Jakob's Law (users spend most time on other sites — match expectations), consistency layers (visual, behavioral, linguistic, spatial), when to break consistency deliberately (to draw attention, to signal a different context, to improve on a bad convention), maintaining consistency at scale (style guides, component libraries, linting), consistency vs innovation (the innovation cost — every departure from convention requires learning)
   - Worked examples: Apple's platform consistency (every app uses the same navigation patterns, gesture vocabulary, and semantic colors), Stripe's cross-product consistency (Dashboard, Docs, and API all share the same type scale, color palette, and interaction patterns), Material Design's consistency framework (components behave identically across all implementing apps)
   - Anti-patterns: foolish consistency (maintaining a bad pattern because "we've always done it this way"), inconsistency through neglect (different developers implementing the same pattern differently without a shared reference), surface consistency without behavioral consistency (buttons look the same but behave differently)
   - Sources: Nielsen's Heuristic #4 (Consistency and Standards), Jakob's Law, Don Norman "The Design of Everyday Things"

4. Run: `harness validate`
5. Commit: `feat(skills): add design-consistency knowledge skill`

---

### Task 21: Replicate all 20 skills to gemini-cli, cursor, and codex

**Depends on:** Tasks 1-20
**Files:** 60 directories across 3 platforms (120 files total)

[checkpoint:human-verify] — Verify all 20 claude-code skills exist and look correct before replicating.

1. Run the following replication script:

```bash
#!/bin/bash
SKILLS_BASE="agents/skills"
SOURCE="claude-code"
TARGETS=("gemini-cli" "cursor" "codex")

SKILLS=(
  design-color-harmony
  design-contrast-ratio
  design-color-psychology
  design-palette-construction
  design-dark-mode-color
  design-color-accessibility
  design-typography-fundamentals
  design-type-scale
  design-font-pairing
  design-typographic-hierarchy
  design-readability
  design-web-fonts
  design-responsive-type
  design-grid-systems
  design-whitespace
  design-visual-hierarchy
  design-alignment
  design-responsive-strategy
  design-content-density
  design-consistency
)

for TARGET in "${TARGETS[@]}"; do
  for SKILL in "${SKILLS[@]}"; do
    mkdir -p "$SKILLS_BASE/$TARGET/$SKILL"
    # Copy SKILL.md identically
    cp "$SKILLS_BASE/$SOURCE/$SKILL/SKILL.md" "$SKILLS_BASE/$TARGET/$SKILL/SKILL.md"
    # Copy skill.yaml with platform field adjusted
    sed "s/  - claude-code/  - $TARGET/" "$SKILLS_BASE/$SOURCE/$SKILL/skill.yaml" > "$SKILLS_BASE/$TARGET/$SKILL/skill.yaml"
  done
done
```

2. Verify replication:

```bash
# Count: should be 20 per platform
ls agents/skills/gemini-cli/ | grep "^design-" | wc -l
ls agents/skills/cursor/ | grep "^design-" | wc -l
ls agents/skills/codex/ | grep "^design-" | wc -l

# Spot-check SKILL.md parity
diff agents/skills/claude-code/design-color-harmony/SKILL.md agents/skills/gemini-cli/design-color-harmony/SKILL.md
diff agents/skills/claude-code/design-color-harmony/SKILL.md agents/skills/cursor/design-color-harmony/SKILL.md
diff agents/skills/claude-code/design-color-harmony/SKILL.md agents/skills/codex/design-color-harmony/SKILL.md

# Spot-check platform field
grep "platforms" agents/skills/gemini-cli/design-color-harmony/skill.yaml
grep "platforms" agents/skills/cursor/design-color-harmony/skill.yaml
grep "platforms" agents/skills/codex/design-color-harmony/skill.yaml
```

3. Run: `harness validate`
4. Commit: `feat(skills): replicate 20 design foundation skills to gemini-cli, cursor, codex`

---

### Task 22: Run full validation suite

**Depends on:** Task 21

1. Run schema validation tests:

```bash
npx vitest run agents/skills/tests/structure.test.ts
```

2. Verify all 20 skills pass SkillMetadataSchema:

```bash
npx vitest run agents/skills/tests/schema.test.ts
```

3. Verify SKILL.md section completeness (spot-check 5 random skills):

```bash
for skill in design-color-harmony design-type-scale design-grid-systems design-consistency design-responsive-type; do
  echo "=== $skill ==="
  for section in "## When to Use" "## Instructions" "## Details" "## Source" "## Process" "## Harness Integration" "## Success Criteria"; do
    grep -c "$section" agents/skills/claude-code/$skill/SKILL.md
  done
done
```

4. Verify line counts (should be 150-250):

```bash
for skill in agents/skills/claude-code/design-*/SKILL.md; do
  echo "$(wc -l < "$skill") $skill"
done
```

5. Run: `harness validate`
6. Commit: `chore(skills): verify design foundation skills pass all validation`

---

## Parallelization Notes

- Tasks 1-20 are fully independent and can execute in parallel. Each creates one skill in claude-code.
- Task 21 (replication) must wait for all 20 skills to exist.
- Task 22 (validation) must wait for Task 21.
- Within domains, tasks can be assigned to parallel agents:
  - Agent A: Tasks 1-6 (Color domain)
  - Agent B: Tasks 7-13 (Typography domain)
  - Agent C: Tasks 14-19 (Layout domain)
  - Agent D: Task 20 (Cross-cutting)
  - Then Agent A: Task 21 (replication), Task 22 (validation)

## Evidence

- `agents/skills/tests/schema.ts:49-76` — SkillMetadataSchema definition confirms required fields
- `agents/skills/tests/structure.test.ts:20` — Knowledge type only requires `## Instructions` section in tests
- `agents/skills/tests/structure.test.ts:45-47` — SKILL.md must start with `# ` heading
- `agents/skills/claude-code/a11y-color-contrast/skill.yaml` — Reference knowledge skill format
- `agents/skills/cursor/a11y-color-contrast/skill.yaml:10` — Platform replicas change `platforms` field to match target platform
- Codex directory has 138 skills (no a11y/css skills) — but spec requires replication to all 4 platforms
- SKILL.md files are identical across claude-code, gemini-cli, cursor (confirmed via diff)
