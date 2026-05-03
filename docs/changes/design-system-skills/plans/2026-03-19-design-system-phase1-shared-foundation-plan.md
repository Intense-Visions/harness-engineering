# Plan: Design System Skills — Phase 1: Shared Foundation

**Date:** 2026-03-19
**Spec:** docs/changes/design-system-skills/proposal.md
**Estimated tasks:** 7
**Estimated time:** 45 minutes

## Goal

All shared design knowledge data exists and the `harness.config.json` schema accepts a `design` block. This is the data foundation that every subsequent design skill reads from.

## Observable Truths (Acceptance Criteria)

1. `agents/skills/shared/design-knowledge/industries/` contains YAML files for at least 8 verticals (saas, fintech, healthcare, ecommerce, creative, services, lifestyle, emerging-tech), each with recommended styles, palettes, and typography.
2. `agents/skills/shared/design-knowledge/anti-patterns/` contains YAML files for typography, color, layout, and motion anti-patterns.
3. `agents/skills/shared/design-knowledge/palettes/curated.yaml` contains curated color palettes with WCAG-validated contrast pairs.
4. `agents/skills/shared/design-knowledge/typography/pairings.yaml` contains font pairings with fallback stacks.
5. `agents/skills/shared/design-knowledge/platform-rules/` contains YAML files for web, ios, android, and flutter platform rules.
6. `HarnessConfigSchema` in `packages/cli/src/config/schema.ts` accepts an optional `design` block with `strictness`, `platforms`, `tokenPath`, and `aestheticIntent` fields.
7. Parsing a `harness.config.json` with a valid `design` block succeeds; parsing one with invalid values (e.g., `strictness: "banana"`) fails.
8. `pnpm test` in the CLI package passes (no regressions).
9. All YAML files parse without error (valid YAML syntax).

## File Map

```
CREATE agents/skills/shared/design-knowledge/industries/saas.yaml
CREATE agents/skills/shared/design-knowledge/industries/fintech.yaml
CREATE agents/skills/shared/design-knowledge/industries/healthcare.yaml
CREATE agents/skills/shared/design-knowledge/industries/ecommerce.yaml
CREATE agents/skills/shared/design-knowledge/industries/creative.yaml
CREATE agents/skills/shared/design-knowledge/industries/services.yaml
CREATE agents/skills/shared/design-knowledge/industries/lifestyle.yaml
CREATE agents/skills/shared/design-knowledge/industries/emerging-tech.yaml
CREATE agents/skills/shared/design-knowledge/anti-patterns/typography.yaml
CREATE agents/skills/shared/design-knowledge/anti-patterns/color.yaml
CREATE agents/skills/shared/design-knowledge/anti-patterns/layout.yaml
CREATE agents/skills/shared/design-knowledge/anti-patterns/motion.yaml
CREATE agents/skills/shared/design-knowledge/palettes/curated.yaml
CREATE agents/skills/shared/design-knowledge/typography/pairings.yaml
CREATE agents/skills/shared/design-knowledge/platform-rules/web.yaml
CREATE agents/skills/shared/design-knowledge/platform-rules/ios.yaml
CREATE agents/skills/shared/design-knowledge/platform-rules/android.yaml
CREATE agents/skills/shared/design-knowledge/platform-rules/flutter.yaml
MODIFY packages/cli/src/config/schema.ts (add DesignConfigSchema + wire into HarnessConfigSchema)
CREATE packages/cli/tests/config/design-schema.test.ts (TDD tests for DesignConfigSchema)
```

## Tasks

### Task 1: TDD — Write failing tests for DesignConfigSchema

**Depends on:** none
**Files:** `packages/cli/tests/config/design-schema.test.ts`

Create the test file first (RED phase). These tests import `DesignConfigSchema` from `../../src/config/schema` and validate the design config shape.

```typescript
// packages/cli/tests/config/design-schema.test.ts
import { describe, it, expect } from 'vitest';
import { DesignConfigSchema, HarnessConfigSchema } from '../../src/config/schema';

describe('DesignConfigSchema', () => {
  it('accepts a valid full design config', () => {
    const result = DesignConfigSchema.safeParse({
      strictness: 'standard',
      platforms: ['web', 'mobile'],
      tokenPath: 'design-system/tokens.json',
      aestheticIntent: 'design-system/DESIGN.md',
    });
    expect(result.success).toBe(true);
  });

  it('accepts minimal design config (all fields optional)', () => {
    const result = DesignConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('defaults strictness to standard', () => {
    const result = DesignConfigSchema.parse({});
    expect(result.strictness).toBe('standard');
  });

  it('defaults platforms to empty array', () => {
    const result = DesignConfigSchema.parse({});
    expect(result.platforms).toEqual([]);
  });

  it('accepts strictness: strict', () => {
    const result = DesignConfigSchema.safeParse({ strictness: 'strict' });
    expect(result.success).toBe(true);
  });

  it('accepts strictness: permissive', () => {
    const result = DesignConfigSchema.safeParse({ strictness: 'permissive' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid strictness value', () => {
    const result = DesignConfigSchema.safeParse({ strictness: 'banana' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid platform value', () => {
    const result = DesignConfigSchema.safeParse({ platforms: ['desktop'] });
    expect(result.success).toBe(false);
  });

  it('accepts web platform', () => {
    const result = DesignConfigSchema.safeParse({ platforms: ['web'] });
    expect(result.success).toBe(true);
  });

  it('accepts mobile platform', () => {
    const result = DesignConfigSchema.safeParse({ platforms: ['mobile'] });
    expect(result.success).toBe(true);
  });

  it('accepts both platforms', () => {
    const result = DesignConfigSchema.safeParse({ platforms: ['web', 'mobile'] });
    expect(result.success).toBe(true);
  });

  it('tokenPath must be a string if provided', () => {
    const result = DesignConfigSchema.safeParse({ tokenPath: 123 });
    expect(result.success).toBe(false);
  });

  it('aestheticIntent must be a string if provided', () => {
    const result = DesignConfigSchema.safeParse({ aestheticIntent: 123 });
    expect(result.success).toBe(false);
  });
});

describe('HarnessConfigSchema with design block', () => {
  const baseConfig = {
    version: 1 as const,
    name: 'test',
  };

  it('accepts config with design block', () => {
    const result = HarnessConfigSchema.safeParse({
      ...baseConfig,
      design: {
        strictness: 'strict',
        platforms: ['web'],
        tokenPath: 'tokens.json',
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts config without design block', () => {
    const result = HarnessConfigSchema.safeParse(baseConfig);
    expect(result.success).toBe(true);
  });

  it('rejects config with invalid design block', () => {
    const result = HarnessConfigSchema.safeParse({
      ...baseConfig,
      design: { strictness: 'invalid' },
    });
    expect(result.success).toBe(false);
  });
});
```

**Verify (RED):** Run `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/cli/tests/config/design-schema.test.ts` — must FAIL because `DesignConfigSchema` is not yet exported from schema.ts.

---

### Task 2: Implement DesignConfigSchema (GREEN)

**Depends on:** Task 1
**Files:** `packages/cli/src/config/schema.ts`

Add the following to `packages/cli/src/config/schema.ts`, just before `HarnessConfigSchema`:

```typescript
export const DesignConfigSchema = z.object({
  strictness: z.enum(['strict', 'standard', 'permissive']).default('standard'),
  platforms: z.array(z.enum(['web', 'mobile'])).default([]),
  tokenPath: z.string().optional(),
  aestheticIntent: z.string().optional(),
});
```

Then add `design: DesignConfigSchema.optional(),` to `HarnessConfigSchema` (after the `phaseGates` line).

Also add to the type exports at the bottom:

```typescript
export type DesignConfig = z.infer<typeof DesignConfigSchema>;
```

**Verify (GREEN):** Run `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/cli/tests/config/design-schema.test.ts` — all tests pass.

**Verify (no regressions):** Run `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/cli/tests/` — all existing tests still pass.

**Verify (TypeScript):** Run `cd /Users/cwarner/Projects/harness-engineering && npx tsc --noEmit -p packages/cli/tsconfig.json` — compiles without errors.

---

### Task 3: Create industry YAML files (batch — all 8 verticals)

**Depends on:** none (parallel with Tasks 1-2)
**Files:** `agents/skills/shared/design-knowledge/industries/*.yaml`

Create all 8 industry YAML files. Each file follows this structure:

```yaml
# agents/skills/shared/design-knowledge/industries/{industry}.yaml
name: '{Industry Name}'
description: '{One-line description of design direction for this vertical}'

styles:
  primary: "{primary aesthetic, e.g., 'Clean minimalism with data-forward layouts'}"
  secondary: '{secondary aesthetic option}'
  avoid: ['{style to avoid}', '{another style to avoid}']

palette:
  primary:
    - name: '{color name}'
      hex: '#{hex}'
      usage: '{when to use}'
  accent:
    - name: '{color name}'
      hex: '#{hex}'
      usage: '{when to use}'
  neutral:
    - name: '{color name}'
      hex: '#{hex}'
      usage: '{when to use}'
  semantic:
    success: '#{hex}'
    warning: '#{hex}'
    error: '#{hex}'
    info: '#{hex}'

typography:
  display:
    families: ['{font}', '{font}']
    weights: [400, 700]
    characteristics: '{why these work for this industry}'
  body:
    families: ['{font}', '{font}']
    weights: [400, 500]
    characteristics: '{readability notes}'
  mono:
    families: ['{font}']
    usage: '{when monospace is needed}'

anti_patterns:
  - pattern: '{bad practice specific to this industry}'
    reason: "{why it's bad}"
    instead: '{what to do instead}'

examples:
  reference_sites: ['{example site}', '{example site}']
```

Create the following 8 files with industry-appropriate content:

1. **saas.yaml** — Clean, data-forward. Blues/indigos. Inter/Geist body, clean sans display. Avoid: cluttered dashboards, rainbow status colors.
2. **fintech.yaml** — Trust, precision. Deep blues/greens. Conservative typography. Avoid: playful fonts, bright gradients.
3. **healthcare.yaml** — Calm, accessible. Soft blues/greens/whites. High readability fonts. Avoid: red as decorative, small text.
4. **ecommerce.yaml** — Conversion-focused. Bold CTAs, warm accents. Clear hierarchy. Avoid: overwhelming grids, hidden prices.
5. **creative.yaml** — Expressive, editorial. Serif + sans pairings. Bold color. Avoid: generic stock imagery, template feel.
6. **services.yaml** — Professional trust. Neutral with accent. Conservative spacing. Avoid: flashy animations, unclear pricing.
7. **lifestyle.yaml** — Warm, aspirational. Earthy/bright tones. Rounded friendly fonts. Avoid: corporate sterility, dense text.
8. **emerging-tech.yaml** — Innovative, forward. Dark themes, accent neons. Geometric fonts. Avoid: retro-futurism cliches, inaccessible contrast.

Each file should have 3+ palette colors per category, 2+ font families per role, and 3+ industry-specific anti-patterns.

**Verify:** Run `cd /Users/cwarner/Projects/harness-engineering && for f in agents/skills/shared/design-knowledge/industries/*.yaml; do echo "--- $f ---"; node -e "const yaml = require('yaml'); const fs = require('fs'); const doc = yaml.parse(fs.readFileSync('$f', 'utf8')); if (!doc.name || !doc.styles || !doc.palette || !doc.typography) throw new Error('Missing required fields in $f'); console.log('OK:', doc.name);" || exit 1; done`

---

### Task 4: Create anti-pattern YAML files (batch — all 4 categories)

**Depends on:** none (parallel with all other tasks)
**Files:** `agents/skills/shared/design-knowledge/anti-patterns/*.yaml`

Create 4 anti-pattern catalog files. Each file follows this structure:

```yaml
# agents/skills/shared/design-knowledge/anti-patterns/{category}.yaml
category: "{category}"
description: "{What this catalog covers}"

universal:
  - id: "{CAT}-001"
    name: "{Short name}"
    description: "{What the anti-pattern is}"
    severity: "error" | "warning" | "info"
    detection: "{How to detect it programmatically}"
    fix: "{What to do instead}"
    wcag: "{WCAG criterion if applicable, e.g., '1.4.3' or null}"

industry_specific:
  - id: "{CAT}-I-001"
    name: "{Short name}"
    industries: ["{industry}", "{industry}"]
    description: "{What the anti-pattern is}"
    severity: "warning"
    fix: "{What to do instead}"
```

Create:

1. **typography.yaml** — Anti-patterns: system/default fonts in UI, too many font families (>3), missing fallback stacks, font size below 14px for body, inconsistent heading scale, using px instead of rem, line-height below 1.4 for body text. Include 8+ universal and 4+ industry-specific.

2. **color.yaml** — Anti-patterns: hardcoded hex instead of tokens, WCAG AA contrast failures (<4.5:1 for text), too many brand colors (>5), pure black on white (#000 on #fff), using color as sole indicator (a11y), inconsistent opacity usage. Include 8+ universal and 4+ industry-specific.

3. **layout.yaml** — Anti-patterns: inconsistent spacing (not following scale), content wider than ~75ch for reading, no responsive breakpoint strategy, z-index wars (arbitrary values), missing focus indicators, horizontal scroll on mobile, fixed positioning overuse. Include 8+ universal and 4+ industry-specific.

4. **motion.yaml** — Anti-patterns: animations without prefers-reduced-motion, transition duration >300ms for micro-interactions, layout shift during animation, parallax overuse, auto-playing video, animation blocking interaction. Include 6+ universal and 3+ industry-specific.

**Verify:** Run `cd /Users/cwarner/Projects/harness-engineering && for f in agents/skills/shared/design-knowledge/anti-patterns/*.yaml; do echo "--- $f ---"; node -e "const yaml = require('yaml'); const fs = require('fs'); const doc = yaml.parse(fs.readFileSync('$f', 'utf8')); if (!doc.category || !doc.universal || !doc.industry_specific) throw new Error('Missing required fields'); console.log('OK:', doc.category, '- universal:', doc.universal.length, '- industry:', doc.industry_specific.length);" || exit 1; done`

---

### Task 5: Create palette and typography data files

**Depends on:** none (parallel)
**Files:**

- `agents/skills/shared/design-knowledge/palettes/curated.yaml`
- `agents/skills/shared/design-knowledge/typography/pairings.yaml`

**palettes/curated.yaml** — Curated color palettes with WCAG-validated contrast pairs:

```yaml
# agents/skills/shared/design-knowledge/palettes/curated.yaml
description: 'Curated color palettes with pre-validated WCAG AA contrast pairs'

palettes:
  - name: 'Ocean Depth'
    tags: ['professional', 'trust', 'saas', 'fintech']
    colors:
      primary: '#1e3a5f'
      secondary: '#2563eb'
      accent: '#06b6d4'
      surface: '#f8fafc'
      surface_alt: '#e2e8f0'
      text_primary: '#0f172a'
      text_secondary: '#475569'
      text_inverse: '#ffffff'
    contrast_pairs:
      - foreground: '#0f172a'
        background: '#f8fafc'
        ratio: 15.4
        passes: ['AA', 'AAA']
      - foreground: '#ffffff'
        background: '#1e3a5f'
        ratio: 10.1
        passes: ['AA', 'AAA']
      - foreground: '#ffffff'
        background: '#2563eb'
        ratio: 4.6
        passes: ['AA']
```

Include 8+ palettes covering: professional/corporate, warm/lifestyle, bold/creative, dark mode, healthcare calm, fintech trust, e-commerce energy, minimal/editorial. Each palette must have at least 3 validated contrast pairs.

**typography/pairings.yaml** — Font pairings with fallback stacks:

```yaml
# agents/skills/shared/design-knowledge/typography/pairings.yaml
description: 'Curated font pairings with complete fallback stacks and usage guidance'

pairings:
  - name: 'Modern Editorial'
    tags: ['editorial', 'creative', 'premium']
    display:
      family: 'Instrument Serif'
      fallback: "Georgia, 'Times New Roman', serif"
      weights: [400, 700]
      variable: false
      source: 'Google Fonts'
    body:
      family: 'Geist'
      fallback: 'system-ui, -apple-system, sans-serif'
      weights: [400, 500, 600]
      variable: true
      source: 'Vercel'
    mono:
      family: 'Geist Mono'
      fallback: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace"
      weights: [400, 500]
      source: 'Vercel'
    scale:
      base: '1rem'
      ratio: 1.25
      sizes:
        xs: '0.75rem'
        sm: '0.875rem'
        base: '1rem'
        lg: '1.125rem'
        xl: '1.25rem'
        '2xl': '1.5rem'
        '3xl': '1.875rem'
        '4xl': '2.25rem'
        '5xl': '3rem'
    usage: 'Best for editorial, blog, and content-heavy sites that want to feel premium.'
```

Include 8+ pairings covering: modern editorial, clean tech, traditional professional, friendly/rounded, geometric minimal, monospace-forward, high-contrast a11y, and system-native. Each pairing must have display + body + mono + full fallback stacks + a type scale.

**Verify:** Run `cd /Users/cwarner/Projects/harness-engineering && for f in agents/skills/shared/design-knowledge/palettes/curated.yaml agents/skills/shared/design-knowledge/typography/pairings.yaml; do echo "--- $f ---"; node -e "const yaml = require('yaml'); const fs = require('fs'); const doc = yaml.parse(fs.readFileSync('$f', 'utf8')); console.log('OK:', doc.description, '- entries:', (doc.palettes || doc.pairings).length);" || exit 1; done`

---

### Task 6: Create platform rules YAML files (batch — all 4 platforms)

**Depends on:** none (parallel)
**Files:** `agents/skills/shared/design-knowledge/platform-rules/*.yaml`

Each platform rules file follows this structure:

```yaml
# agents/skills/shared/design-knowledge/platform-rules/{platform}.yaml
platform: '{platform}'
description: '{Platform design guidance}'

typography:
  system_font: '{platform system font stack}'
  min_body_size: '{minimum body text size}'
  min_touch_label: '{minimum label size for touch targets}'
  scale_approach: '{how this platform handles type scale}'

spacing:
  base_unit: '{base spacing unit}'
  grid: '{grid system}'
  safe_areas: '{safe area handling}'
  touch_target_min: '{minimum touch target size}'

color:
  dark_mode: '{dark mode requirements}'
  system_colors: '{how to handle system/dynamic colors}'
  contrast: '{platform-specific contrast requirements}'

components:
  navigation: '{platform navigation patterns}'
  buttons: '{button style conventions}'
  inputs: '{input field conventions}'
  lists: '{list/table conventions}'
  modals: '{modal/sheet conventions}'

accessibility:
  screen_reader: '{screen reader specifics}'
  focus: '{focus management requirements}'
  haptics: '{haptic feedback if applicable}'
  motion: '{reduced motion handling}'

frameworks:
  - name: '{framework}'
    token_format: '{how tokens map to this framework}'
    component_pattern: '{component authoring pattern}'

anti_patterns:
  - pattern: '{platform-specific bad practice}'
    reason: '{why}'
    instead: '{what to do}'
```

Create:

1. **web.yaml** — CSS/Tailwind conventions, rem-based sizing, responsive breakpoints (sm/md/lg/xl), prefers-color-scheme, prefers-reduced-motion, focus-visible, frameworks: Tailwind CSS, vanilla CSS, CSS Modules. Min body 16px, touch target 44px. Anti-patterns: vh on mobile, fixed widths, :hover-only interactions.

2. **ios.yaml** — HIG compliance, SF Pro system font, Dynamic Type support, safe areas (notch, home indicator), 44pt minimum tap targets, UIKit/SwiftUI patterns, SF Symbols for icons, dark mode via trait collection. Frameworks: SwiftUI, UIKit. Anti-patterns: custom back buttons, ignoring Dynamic Type, non-standard tab bars.

3. **android.yaml** — Material Design 3, Roboto/system font, 48dp minimum touch targets, edge-to-edge display, dynamic color (Material You), 8dp grid, Compose/XML patterns. Frameworks: Jetpack Compose, XML Views. Anti-patterns: iOS-style navigation on Android, ignoring system back gesture, fixed dp sizes that don't scale.

4. **flutter.yaml** — Cross-platform considerations, Material + Cupertino adaptive widgets, platform-aware defaults, ThemeData tokens, 48dp touch targets, MediaQuery for responsive, platform channels for native integration. Frameworks: Flutter/Dart. Anti-patterns: ignoring platform conventions, single-platform design applied everywhere, not using WidgetsBinding for accessibility.

**Verify:** Run `cd /Users/cwarner/Projects/harness-engineering && for f in agents/skills/shared/design-knowledge/platform-rules/*.yaml; do echo "--- $f ---"; node -e "const yaml = require('yaml'); const fs = require('fs'); const doc = yaml.parse(fs.readFileSync('$f', 'utf8')); if (!doc.platform || !doc.typography || !doc.spacing || !doc.components || !doc.accessibility) throw new Error('Missing required fields'); console.log('OK:', doc.platform);" || exit 1; done`

---

### Task 7: Final validation — all YAML parses, all tests pass, config round-trips

**Depends on:** Tasks 1-6
**Files:** none (verification only)

Run the following checks in order:

1. **YAML syntax check (all 18 files):**

   ```bash
   cd /Users/cwarner/Projects/harness-engineering
   node -e "
     const yaml = require('yaml');
     const fs = require('fs');
     const glob = require('glob');
     const files = glob.sync('agents/skills/shared/design-knowledge/**/*.yaml');
     console.log('Found', files.length, 'YAML files');
     if (files.length < 18) throw new Error('Expected 18+ YAML files, found ' + files.length);
     for (const f of files) {
       const doc = yaml.parse(fs.readFileSync(f, 'utf8'));
       if (!doc || typeof doc !== 'object') throw new Error('Invalid YAML: ' + f);
       console.log('  OK:', f);
     }
     console.log('All YAML files valid');
   "
   ```

2. **Design schema tests pass:**

   ```bash
   npx vitest run packages/cli/tests/config/design-schema.test.ts
   ```

3. **Full CLI test suite passes (no regressions):**

   ```bash
   npx vitest run packages/cli/tests/
   ```

4. **TypeScript compiles:**

   ```bash
   npx tsc --noEmit -p packages/cli/tsconfig.json
   ```

5. **Config round-trip — add design block to harness.config.json and validate:**
   ```bash
   node -e "
     const { HarnessConfigSchema } = require('./packages/cli/dist/config/schema.js');
     const config = require('./harness.config.json');
     config.design = { strictness: 'standard', platforms: ['web'], tokenPath: 'design-system/tokens.json' };
     const result = HarnessConfigSchema.safeParse(config);
     console.log('Config with design block:', result.success ? 'VALID' : 'INVALID');
     if (!result.success) { console.error(result.error); process.exit(1); }
   "
   ```
   Note: This step requires building first (`pnpm build` in packages/cli) if dist is stale. Alternatively, use the vitest-based tests which handle TS natively.

**Done when:** All 5 checks pass. 18 YAML files exist and parse. Schema tests pass. No test regressions. TypeScript compiles.

## Dependency Graph

```
Task 1 (TDD RED)  ──> Task 2 (TDD GREEN) ──┐
Task 3 (industries)   ─────────────────────────┤
Task 4 (anti-patterns) ────────────────────────┤──> Task 7 (validate all)
Task 5 (palettes + typography) ────────────────┤
Task 6 (platform rules)  ──────────────────────┘

Wave 1 (parallel): Tasks 1, 3, 4, 5, 6
Wave 2 (sequential): Task 2 (needs Task 1)
Wave 3 (sequential): Task 7 (needs all)
```

Tasks 3, 4, 5, 6 are fully independent and can run in parallel worktrees. Tasks 1-2 are a TDD pair (RED then GREEN). Task 7 is the final gate.

## Notes

- The YAML files are content-heavy but mechanical. A worktree agent can handle each batch (industries, anti-patterns, palettes+typography, platform-rules) independently.
- The config schema change is the only code-level change to the CLI package. It follows the exact same pattern as `SecurityConfigSchema` and `PerformanceConfigSchema`.
- The `shared/` directory under `agents/skills/` does not yet exist and must be created (along with the full `design-knowledge/` tree).
- Per learnings from previous sessions: use `tsc --noEmit` to verify TypeScript compilation, not just test passes.
