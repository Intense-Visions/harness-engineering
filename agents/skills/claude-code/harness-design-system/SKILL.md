# Harness Design System

> Token-first design management. Discover existing design patterns, define intent through curated palettes and typography, generate W3C DTCG tokens, and validate every color pair for WCAG compliance.

## When to Use

- Starting a new project that needs design tokens (colors, typography, spacing)
- Adding design consistency to an existing project that lacks a token system
- When `on_project_init` triggers fire and the project has no `design-system/tokens.json`
- When `on_new_feature` triggers fire with design scope (new theme, new component library, rebrand)
- Regenerating tokens after stakeholder feedback on palette or typography choices
- NOT for accessibility auditing of existing components (use harness-accessibility)
- NOT for aesthetic direction, mood boards, or brand strategy (use harness-design, Phase 4)
- NOT for platform-specific implementation of tokens into CSS/Tailwind/etc. (use harness-design-web/mobile, Phase 5)
- NOT for fixing individual contrast failures in code (use harness-accessibility fix phase)

## Process

### Phase 1: DISCOVER -- Detect Existing Design System

1. **Read existing design files.** Search for:
   - `design-system/tokens.json` -- existing W3C DTCG tokens
   - `design-system/DESIGN.md` -- existing design intent documentation
   - `tailwind.config.*` -- Tailwind CSS configuration with theme overrides
   - CSS files with custom properties (`--color-*`, `--font-*`, `--space-*`)
   - `theme.ts`, `theme.js`, `styles/variables.*` -- CSS-in-JS or preprocessor variables

2. **Check harness configuration.** Read `harness.config.json` for:
   - `design.strictness` -- enforcement level (`strict`, `standard`, `permissive`)
   - `design.platforms` -- which platforms are enabled (web, mobile)
   - `design.tokenPath` -- path to tokens file (default: `design-system/tokens.json`)
   - `design.aestheticIntent` -- path to design intent doc (default: `design-system/DESIGN.md`)

3. **Detect framework.** Identify the CSS strategy in use:
   - Tailwind CSS (presence of `tailwind.config.*`)
   - CSS-in-JS (styled-components, Emotion, Stitches imports)
   - CSS Modules (`.module.css` or `.module.scss` files)
   - Vanilla CSS/SCSS (global stylesheets)
   - None detected (greenfield)

4. **Identify existing patterns.** Use Grep to find:
   - Color values: hex codes (`#[0-9a-fA-F]{3,8}`), rgb/hsl functions
   - Font declarations: `font-family` properties, `@font-face` rules
   - Spacing patterns: margin/padding values, gap values
   - Count unique values to estimate design debt (many unique colors = high debt)

5. **Load industry recommendations.** If an industry is specified (via CLI arg or config), read the industry profile from `agents/skills/shared/design-knowledge/industries/{industry}.yaml`. This provides sector-specific guidance on color psychology, typography conventions, and regulatory considerations.

6. **Report findings before proceeding.** Present a summary:
   - Existing token file: yes/no
   - Framework detected: [name]
   - Unique colors found: [count]
   - Unique fonts found: [count]
   - Industry profile loaded: yes/no
   - Design debt assessment: low/medium/high

### Phase 2: DEFINE -- Select Palette, Typography, and Spacing

1. **Present palette options.** Load curated palettes from `agents/skills/shared/design-knowledge/palettes/curated.yaml`. Filter by industry tags if an industry is specified. Present 3-5 palette options with:
   - Palette name and description
   - Primary, secondary, accent, neutral color ramps
   - Semantic colors (success, warning, error, info)
   - Pre-computed contrast ratios for common pairs (text-on-background)

2. **Present typography pairings.** Load pairings from `agents/skills/shared/design-knowledge/typography/pairings.yaml`. Present 3-5 options with:
   - Heading font + body font combination
   - Fallback stacks for each font
   - Recommended size scale (base size, scale ratio)
   - Line height and letter spacing recommendations

3. **Define spacing scale.** Default: 4px base with multipliers [0.25, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16]. Allow customization of:
   - Base unit (4px, 8px)
   - Scale multipliers
   - Named aliases (xs, sm, md, lg, xl, 2xl, etc.)

4. **Capture design intent.** Ask the user to define:
   - Style: minimal, expressive, corporate, playful, editorial
   - Tone: warm, cool, neutral, bold, muted
   - Key differentiator: what makes this product's visual identity unique
   - Anti-patterns: specific design choices to avoid

5. **Confirm all choices.** Present a complete summary of palette, typography, spacing, and intent. Wait for user confirmation before generating. This is a hard gate -- no generation without confirmation.

### Phase 3: GENERATE -- Create Tokens and Documentation

1. **Generate `design-system/tokens.json`** in W3C Design Token Community Group (DTCG) format. Structure:

   ```json
   {
     "color": {
       "primary": {
         "50": { "$value": "#eff6ff", "$type": "color", "$description": "Lightest primary" },
         "500": { "$value": "#3b82f6", "$type": "color", "$description": "Base primary" },
         "900": { "$value": "#1e3a5f", "$type": "color", "$description": "Darkest primary" }
       },
       "semantic": {
         "success": {
           "$value": "{color.green.500}",
           "$type": "color",
           "$description": "Success state"
         },
         "error": { "$value": "{color.red.500}", "$type": "color", "$description": "Error state" }
       }
     },
     "typography": {
       "heading": {
         "fontFamily": { "$value": "Inter, system-ui, sans-serif", "$type": "fontFamily" },
         "fontWeight": { "$value": 600, "$type": "fontWeight" }
       },
       "body": {
         "fontFamily": { "$value": "Source Sans 3, system-ui, sans-serif", "$type": "fontFamily" },
         "fontSize": { "$value": "1rem", "$type": "dimension" }
       }
     },
     "spacing": {
       "xs": { "$value": "4px", "$type": "dimension", "$description": "Extra small spacing" },
       "sm": { "$value": "8px", "$type": "dimension", "$description": "Small spacing" },
       "md": { "$value": "16px", "$type": "dimension", "$description": "Medium spacing" },
       "lg": { "$value": "24px", "$type": "dimension", "$description": "Large spacing" },
       "xl": { "$value": "32px", "$type": "dimension", "$description": "Extra large spacing" }
     }
   }
   ```

2. **Generate `design-system/DESIGN.md`** with:
   - Aesthetic direction (style, tone, differentiator)
   - Color usage guidelines (when to use primary vs. secondary vs. accent)
   - Typography hierarchy (h1-h6 sizing, body text, captions)
   - Spacing conventions (component padding, layout gaps, section margins)
   - Anti-patterns (explicitly forbidden design choices)
   - Platform-specific notes (Tailwind class mappings, CSS variable names)
   - Strictness override instructions (how to change `design.strictness`)

3. **Populate the knowledge graph.** If a graph exists at `.harness/graph/`, run `DesignIngestor` from `packages/graph/src/ingest/DesignIngestor.ts` to create graph nodes for:
   - Each color token (type: `design_token`, subtype: `color`)
   - Each typography token (type: `design_token`, subtype: `typography`)
   - Each spacing token (type: `design_token`, subtype: `spacing`)
   - The aesthetic intent (type: `aesthetic_intent`) with style, tone, differentiator, and strictness properties
   - `declares_intent` edges from the project to the aesthetic intent node

### Phase 4: VALIDATE -- Verify Tokens and Compliance

1. **Parse `tokens.json` against W3C DTCG structure.** Verify:
   - Every token has `$value` and `$type` fields
   - Token references (e.g., `{color.primary.500}`) resolve to existing tokens
   - No orphan tokens (defined but never referenced in DESIGN.md or usage guidelines)

2. **Check color contrast compliance.** For every declared contrast pair:
   - Calculate the contrast ratio using the WCAG 2.1 relative luminance formula
   - Normal text (< 18px): require >= 4.5:1 ratio (WCAG AA)
   - Large text (>= 18px or >= 14px bold): require >= 3:1 ratio (WCAG AA)
   - Report each pair with its ratio and pass/fail status

3. **Verify typography completeness.** Check that:
   - Every font family declaration includes a fallback stack (at least `system-ui` or `sans-serif`/`serif`/`monospace`)
   - Heading and body fonts are different (unless intentional single-font system)
   - Font weights are specified as numbers, not names

4. **Verify spacing scale.** Check that:
   - Spacing values are monotonically increasing
   - No gaps in the scale (e.g., jumping from 8px to 48px with nothing between)
   - Base unit is consistent across all values

5. **Run project health check.** Execute `harness validate` to ensure the new files do not break any existing constraints.

6. **Report validation results.** Present a summary:
   - DTCG structure: pass/fail with details
   - Contrast pairs: N passed, M failed (list failures)
   - Typography: pass/fail with details
   - Spacing: pass/fail with details
   - Harness validate: pass/fail

## Harness Integration

- **`harness validate`** -- Run after generating tokens to verify project health. Token generation must not break existing constraints.
- **`harness scan`** -- Run after token changes to refresh the knowledge graph. Updated graph enables impact analysis when tokens are modified later.
- **`DesignIngestor`** (`packages/graph/src/ingest/DesignIngestor.ts`) -- Parses `tokens.json` and `DESIGN.md` to create graph nodes representing the design system. Called during the GENERATE phase.
- **`DesignConstraintAdapter`** (`packages/graph/src/constraints/DesignConstraintAdapter.ts`) -- Enforces design constraints by checking for `VIOLATES` edges in the graph. Used during validation to detect constraint violations.
- **`harness-impact-analysis`** -- When tokens change, impact analysis traces which components consume affected tokens, enabling targeted re-validation.

## Success Criteria

- `design-system/tokens.json` exists and is valid W3C DTCG format (every token has `$value` and `$type`)
- `design-system/DESIGN.md` exists with aesthetic direction, usage guidelines, anti-patterns, and platform notes
- All declared color contrast pairs pass WCAG AA thresholds (4.5:1 normal text, 3:1 large text)
- Every font family has a fallback stack
- Spacing scale is monotonically increasing with no gaps
- Graph nodes created for each token (if graph exists at `.harness/graph/`)
- `harness validate` passes after token generation
- User confirmed palette and typography choices before generation

## Examples

### Example: SaaS Dashboard Project

**Context:** New SaaS analytics dashboard. Industry: `saas`. No existing design system.

**DISCOVER output:**

```
Design System Discovery Report
-------------------------------
Existing token file:    No
Framework detected:     Tailwind CSS (tailwind.config.ts)
Unique colors found:    23 (high debt -- colors scattered across components)
Unique fonts found:     4 (medium debt -- inconsistent font usage)
Industry profile:       Loaded (saas) -- recommends professional blues, clean sans-serif
Design debt assessment: High -- no centralized design system, ad-hoc color usage
```

**DEFINE choices:**

```
Selected palette:     "Ocean Professional" (blue primary, slate neutral, emerald accent)
Selected typography:  Inter (headings, 600 weight) + Source Sans 3 (body, 400 weight)
Spacing base:         4px with standard multipliers
Style:                Minimal, data-focused
Tone:                 Cool, professional
Differentiator:       Dense information display with generous whitespace between sections
Anti-patterns:        No gradients on data elements, no decorative borders on cards
```

**GENERATE output (tokens.json snippet):**

```json
{
  "color": {
    "primary": {
      "50": { "$value": "#eff6ff", "$type": "color", "$description": "Background tint" },
      "100": { "$value": "#dbeafe", "$type": "color", "$description": "Hover state" },
      "500": { "$value": "#3b82f6", "$type": "color", "$description": "Primary action" },
      "700": { "$value": "#1d4ed8", "$type": "color", "$description": "Primary text on light" },
      "900": { "$value": "#1e3a5f", "$type": "color", "$description": "Darkest primary" }
    },
    "neutral": {
      "50": { "$value": "#f8fafc", "$type": "color", "$description": "Page background" },
      "900": { "$value": "#0f172a", "$type": "color", "$description": "Primary text" }
    }
  },
  "typography": {
    "heading": {
      "fontFamily": { "$value": "Inter, system-ui, sans-serif", "$type": "fontFamily" }
    },
    "body": {
      "fontFamily": { "$value": "Source Sans 3, system-ui, sans-serif", "$type": "fontFamily" }
    }
  }
}
```

**VALIDATE output:**

```
Validation Results
------------------
DTCG structure:  PASS (42 tokens, all have $value and $type)
Contrast pairs:  PASS (12/12 pairs meet WCAG AA)
  - primary-700 on neutral-50:  8.1:1  PASS (normal text)
  - neutral-900 on neutral-50: 15.4:1  PASS (normal text)
  - neutral-50 on primary-500:  4.7:1  PASS (normal text)
Typography:      PASS (all fonts have fallback stacks)
Spacing:         PASS (monotonically increasing, no gaps)
Harness validate: PASS
```

## Gates

These are hard stops. Violating any gate means the process has broken down.

- **No tokens generated without user confirming palette and typography choices.** The DEFINE phase must end with explicit user confirmation. Do not auto-select and generate.
- **No `tokens.json` written without passing DTCG schema validation.** Every token must have `$value` and `$type`. Malformed tokens are rejected before writing to disk.
- **No contrast pair allowed below 4.5:1 for normal text.** If a selected palette produces a failing contrast pair, flag it and ask the user to choose an alternative. Do not silently accept.
- **No fonts without fallback stacks.** Every `fontFamily` token must include at least one generic fallback (`sans-serif`, `serif`, `monospace`, or `system-ui`).
- **No spacing scale with non-monotonic values.** If a user customizes spacing, validate that values increase. Reject scales where `md` is larger than `lg`.

## Escalation

- **After 3 failed contrast validations on the same palette:** Suggest an alternative palette from the curated set that has pre-verified contrast ratios. Present the alternative with a comparison showing which pairs now pass.
- **When user rejects all curated palettes:** Accept custom colors but warn: "Custom colors have not been pre-validated for contrast compliance. Running full contrast check now." Run validation and report results before generating.
- **When existing project has conflicting design patterns:** Surface the specific conflicts (e.g., "Found 5 different blue values across 12 components"). Ask the user to choose: consolidate to the new palette, or map each existing value to the nearest token. Do not silently override existing colors.
- **When `design.strictness` is set to `permissive` but contrast fails:** Still report the failure as a warning. Permissive mode does not suppress contrast checks -- it only changes the severity from error to warning.
- **When the graph is unavailable:** Skip the graph population step in GENERATE. Log: "Graph not available at .harness/graph/ -- skipping token graph population. Run `harness scan` later to populate." Continue with file generation.
