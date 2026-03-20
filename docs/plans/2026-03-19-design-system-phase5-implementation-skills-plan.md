# Plan: Design System Phase 5 — Implementation Skills

**Date:** 2026-03-19
**Spec:** docs/changes/design-system-skills/proposal.md
**Estimated tasks:** 6
**Estimated time:** 20 minutes

## Goal

The harness has two implementation-layer design skills (`harness-design-web` and `harness-design-mobile`) that guide token-bound component generation for web platforms (Tailwind/CSS, React/Vue/Svelte) and mobile platforms (React Native/SwiftUI/Flutter/Compose).

## Observable Truths (Acceptance Criteria)

1. `agents/skills/claude-code/harness-design-web/skill.yaml` exists and parses as valid YAML with `name: harness-design-web`, `cognitive_mode: meticulous-implementer`, `type: rigid`, three phases (scaffold, implement, verify), `depends_on: [harness-design-system, harness-design]`, `platforms: [claude-code, gemini-cli]`
2. `agents/skills/claude-code/harness-design-web/SKILL.md` exists with sections: When to Use, Process (scaffold/implement/verify phases), Harness Integration, Success Criteria, Examples, Gates, Escalation
3. `agents/skills/gemini-cli/harness-design-web/skill.yaml` and `SKILL.md` are byte-identical to the claude-code copies
4. `agents/skills/claude-code/harness-design-mobile/skill.yaml` exists and parses as valid YAML with `name: harness-design-mobile`, `cognitive_mode: meticulous-implementer`, `type: rigid`, three phases (scaffold, implement, verify), `depends_on: [harness-design-system, harness-design]`, `platforms: [claude-code, gemini-cli]`
5. `agents/skills/claude-code/harness-design-mobile/SKILL.md` exists with sections: When to Use, Process (scaffold/implement/verify phases), Harness Integration, Success Criteria, Examples, Gates, Escalation
6. `agents/skills/gemini-cli/harness-design-mobile/skill.yaml` and `SKILL.md` are byte-identical to the claude-code copies
7. `pnpm test` passes (all existing tests plus auto-discovered tests for the two new skills)
8. The web skill SKILL.md references Tailwind/CSS, React/Vue/Svelte, `design-system/tokens.json`, `harness-design-system`, `harness-design`, `DesignToken`, `USES_TOKEN`, and `PLATFORM_BINDING`
9. The mobile skill SKILL.md references React Native/SwiftUI/Flutter/Compose, platform-specific rules, `design-system/tokens.json`, `harness-design-system`, `harness-design`, `DesignToken`, `USES_TOKEN`, and `PLATFORM_BINDING`

## File Map

```
CREATE agents/skills/claude-code/harness-design-web/skill.yaml
CREATE agents/skills/claude-code/harness-design-web/SKILL.md
CREATE agents/skills/gemini-cli/harness-design-web/skill.yaml    (copy of claude-code)
CREATE agents/skills/gemini-cli/harness-design-web/SKILL.md      (copy of claude-code)
CREATE agents/skills/claude-code/harness-design-mobile/skill.yaml
CREATE agents/skills/claude-code/harness-design-mobile/SKILL.md
CREATE agents/skills/gemini-cli/harness-design-mobile/skill.yaml  (copy of claude-code)
CREATE agents/skills/gemini-cli/harness-design-mobile/SKILL.md    (copy of claude-code)
```

## Tasks

### Task 1: Create harness-design-web skill.yaml

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-design-web/skill.yaml`

1. Create directory `agents/skills/claude-code/harness-design-web/`
2. Create file `agents/skills/claude-code/harness-design-web/skill.yaml`:

```yaml
name: harness-design-web
version: '1.0.0'
description: Token-bound web component generation with Tailwind/CSS, React/Vue/Svelte patterns, and design constraint verification
cognitive_mode: meticulous-implementer
triggers:
  - manual
  - on_new_feature
  - on_commit
platforms:
  - claude-code
  - gemini-cli
tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
cli:
  command: harness skill run harness-design-web
  args:
    - name: path
      description: Project root path
      required: false
    - name: framework
      description: Target framework (react, vue, svelte, vanilla)
      required: false
    - name: cssStrategy
      description: CSS strategy (tailwind, css-modules, css-in-js, vanilla)
      required: false
mcp:
  tool: run_skill
  input:
    skill: harness-design-web
    path: string
type: rigid
phases:
  - name: scaffold
    description: Read tokens and design intent, detect framework and CSS strategy, plan component structure
    required: true
  - name: implement
    description: Generate token-bound components with framework-specific patterns
    required: true
  - name: verify
    description: Verify all values reference tokens, no hardcoded colors/fonts/spacing, run design constraints
    required: true
state:
  persistent: false
  files: []
depends_on:
  - harness-design-system
  - harness-design
```

3. Verify YAML is valid: `node -e "const yaml = require('yaml'); yaml.parse(require('fs').readFileSync('agents/skills/claude-code/harness-design-web/skill.yaml', 'utf-8'))"`
4. Commit: `feat(skills): add harness-design-web skill.yaml`

### Task 2: Create harness-design-web SKILL.md

**Depends on:** Task 1
**Files:** `agents/skills/claude-code/harness-design-web/SKILL.md`

1. Create file `agents/skills/claude-code/harness-design-web/SKILL.md` with full content (see below).

The SKILL.md must contain these sections with this content:

```markdown
# Harness Design Web

> Token-bound web component generation. Scaffold from design tokens and aesthetic intent, implement with Tailwind/CSS and React/Vue/Svelte patterns, and verify every value references the token set — no hardcoded colors, fonts, or spacing.

## When to Use

- Generating new web components that must conform to the project's design system tokens
- When `on_new_feature` triggers fire with web UI scope requiring token-bound component generation
- When `on_commit` triggers fire and new components contain hardcoded design values that should reference tokens
- Implementing design intent from `design-system/DESIGN.md` into concrete Tailwind classes, CSS custom properties, or CSS-in-JS theme values
- Converting mockups or wireframes into token-bound component code for React, Vue, or Svelte
- NOT for generating design tokens themselves (use harness-design-system)
- NOT for establishing aesthetic direction or anti-patterns (use harness-design)
- NOT for accessibility auditing (use harness-accessibility)
- NOT for mobile platform components (use harness-design-mobile)

## Process

### Phase 1: SCAFFOLD — Read Tokens, Detect Framework, Plan Structure

1. **Read design tokens.** Load `design-system/tokens.json` (W3C DTCG format). Extract:
   - Color tokens: primary, secondary, accent, neutral ramps, semantic colors (success, warning, error, info)
   - Typography tokens: heading and body font families, font weights, font sizes, line heights
   - Spacing tokens: spacing scale values (xs through 2xl or equivalent)
   - If `design-system/tokens.json` does not exist, stop and instruct the user to run `harness-design-system` first.

2. **Read design intent.** Load `design-system/DESIGN.md` for:
   - Aesthetic direction (style, tone, differentiator) from harness-design output
   - Anti-patterns to avoid (e.g., "no gradients on data elements," "no decorative borders")
   - Platform-specific web notes (CSS strategy preferences, animation guidelines, responsive behavior)
   - If `design-system/DESIGN.md` does not exist, warn the user and proceed with tokens only. Recommend running `harness-design` for richer output.

3. **Check harness configuration.** Read `harness.config.json` for:
   - `design.strictness` — enforcement level (`strict`, `standard`, `permissive`). Default to `standard`.
   - `design.platforms` — confirm `web` is in the platforms list.
   - `design.tokenPath` — custom token path (default: `design-system/tokens.json`).

4. **Detect web framework.** Scan the project for:
   - **React:** `package.json` contains `react` or `next` dependency, `.tsx`/`.jsx` files exist
   - **Vue:** `package.json` contains `vue` or `nuxt` dependency, `.vue` files exist
   - **Svelte:** `package.json` contains `svelte` or `@sveltejs/kit`, `.svelte` files exist
   - **Vanilla:** No framework detected, output plain HTML/CSS
   - If the user specified `--framework`, use that override.

5. **Detect CSS strategy.** Scan for:
   - **Tailwind:** `tailwind.config.*` exists, `@tailwind` directives in CSS, `class=` with Tailwind utility patterns
   - **CSS Modules:** `.module.css` or `.module.scss` files exist
   - **CSS-in-JS:** `styled-components`, `@emotion/styled`, `stitches` imports detected
   - **Vanilla CSS:** Global `.css`/`.scss` files with no module or utility pattern
   - If the user specified `--cssStrategy`, use that override.

6. **Build token-to-CSS mapping.** Create a lookup table that maps each token to its CSS representation based on the detected strategy:
   - **Tailwind:** `color.primary.500` maps to `text-primary-500` / `bg-primary-500` (requires `tailwind.config` theme extension)
   - **CSS custom properties:** `color.primary.500` maps to `var(--color-primary-500)`
   - **CSS-in-JS:** `color.primary.500` maps to `theme.color.primary[500]`

7. **Plan component structure.** For the requested component(s), define:
   - Component file path(s) following project conventions
   - Props interface / type definition
   - Which tokens will be consumed (colors, typography, spacing)
   - Responsive behavior (breakpoints, layout changes)
   - Present the scaffold plan to the user before proceeding.

### Phase 2: IMPLEMENT — Generate Token-Bound Components

1. **Generate framework-specific component code.** Based on detected framework:

   **React (TSX):**
   - Functional component with TypeScript props interface
   - All color values reference tokens (via Tailwind classes, CSS variables, or theme object)
   - All typography values reference tokens (font family, weight, size from token set)
   - All spacing values reference tokens (padding, margin, gap from spacing scale)
   - Export component with display name

   **Vue (SFC):**
   - Single File Component with `<script setup lang="ts">`
   - Props defined with `defineProps` and TypeScript interface
   - Scoped styles reference CSS custom properties mapped from tokens
   - Template uses token-derived classes or inline styles via CSS variables

   **Svelte:**
   - Component with TypeScript `<script lang="ts">`
   - Props exported with `export let` declarations
   - Styles reference CSS custom properties mapped from tokens
   - Reactive declarations for computed style values

   **Vanilla HTML/CSS:**
   - Semantic HTML structure
   - CSS custom properties for all design values
   - No inline styles with hardcoded values

2. **Generate CSS strategy artifacts.** Based on detected CSS strategy:

   **Tailwind:**
   - Extend `tailwind.config` theme with token values (if not already present)
   - Map tokens to Tailwind utility classes in components
   - Use `@apply` sparingly — prefer utility classes in markup
   - Generate token-to-Tailwind mapping comment block at top of component

   **CSS Custom Properties:**
   - Generate `:root` declarations for all consumed tokens
   - Components reference `var(--token-name)` exclusively
   - No hardcoded hex, rgb, hsl, or font values in component styles

   **CSS-in-JS:**
   - Generate theme object from tokens
   - Components consume theme via provider/hook pattern
   - All style values reference theme properties

3. **Apply design intent constraints.** For each generated component:
   - Check against anti-patterns from `design-system/DESIGN.md`
   - Enforce style guidelines (e.g., minimal style means no decorative effects)
   - Apply tone-appropriate color usage (e.g., cool tone means no warm accents in neutral UI)
   - Respect platform-specific web notes (animation preferences, responsive behavior)

4. **Add USES_TOKEN annotations.** Insert comments in generated code documenting which tokens are consumed:
```

/_ @design-token color.primary.500 — primary action background _/
/_ @design-token typography.heading.fontFamily — section heading _/
/_ @design-token spacing.md — card internal padding _/

```
These annotations enable the knowledge graph to create `USES_TOKEN` edges from this component to the consumed `DesignToken` nodes.

### Phase 3: VERIFY — Check Token Binding and Design Constraints

1. **Scan for hardcoded values.** Use Grep to search generated files for:
- Hardcoded color values: hex (`#[0-9a-fA-F]{3,8}`), `rgb()`, `hsl()`, named colors
- Hardcoded font families: `font-family:` declarations not referencing tokens
- Hardcoded spacing: pixel/rem values in margin/padding/gap not from the token scale
- Each finding is a violation: the component uses a value not bound to a token.

2. **Verify token coverage.** For every design value in the generated component:
- Confirm it resolves to a token in `design-system/tokens.json`
- Confirm the token path is valid (e.g., `color.primary.500` exists in the token tree)
- Report orphan references (token annotations pointing to non-existent tokens)

3. **Check anti-pattern compliance.** Cross-reference generated code against anti-patterns declared in `design-system/DESIGN.md`:
- Grep for patterns matching each declared anti-pattern
- Flag violations with file path, line number, and the specific anti-pattern violated

4. **Query the knowledge graph.** If a graph exists at `.harness/graph/`:
- Use `DesignIngestor` to verify `DesignToken` nodes exist for all referenced tokens
- Verify `PLATFORM_BINDING` edges exist for web platform tokens
- Use `DesignConstraintAdapter` to check for `VIOLATES_DESIGN` edges
- Report any constraint violations with severity based on `design.strictness`

5. **Assign severity based on `designStrictness`:**
- `permissive` — all findings are `info`
- `standard` — hardcoded values and anti-pattern violations are `warn`, accessibility violations are `error`
- `strict` — hardcoded values are `error` (blocks), anti-pattern violations are `warn`, accessibility violations are `error`

6. **Report verification results.** Present:
```

WEB-001 [warn] Hardcoded color #3b82f6 — should reference token "color.primary.500"
File: src/components/Button.tsx:12
Fix: Replace with Tailwind class "bg-primary-500" or var(--color-primary-500)

WEB-002 [info] Anti-pattern: gradient on card background
File: src/components/MetricCard.tsx:28
Fix: Use solid background from token "color.neutral.50"

```

7. **Run `harness validate`.** After verification, run project-level validation to confirm the new components integrate cleanly.

## Harness Integration

- **`harness validate`** — Run after generating components to verify project health. New files must not break existing constraints.
- **`harness scan`** — Run after component generation to update the knowledge graph with new `USES_TOKEN` edges from generated components to consumed tokens.
- **`DesignIngestor`** (`packages/graph/src/ingest/DesignIngestor.ts`) — Verifies that `DesignToken` nodes exist for all tokens referenced by generated components. If tokens are missing from the graph, run `harness scan` to re-ingest.
- **`DesignConstraintAdapter`** (`packages/graph/src/constraints/DesignConstraintAdapter.ts`) — Checks for `VIOLATES_DESIGN` edges during the VERIFY phase. Reports constraint violations at the configured strictness level.
- **`harness-design-system`** — Dependency. This skill reads tokens generated by harness-design-system. If tokens do not exist, instruct the user to run harness-design-system first.
- **`harness-design`** — Dependency. This skill reads aesthetic intent from harness-design output (`design-system/DESIGN.md`). Anti-pattern enforcement and style constraints come from the design intent document.
- **`harness-impact-analysis`** — When tokens change, impact analysis traces which components consume affected tokens via `USES_TOKEN` edges. Use this to identify components that need regeneration after token updates.

## Success Criteria

- Generated components reference design tokens exclusively — no hardcoded color, font, or spacing values
- Framework detection correctly identifies React, Vue, Svelte, or vanilla projects
- CSS strategy detection correctly identifies Tailwind, CSS Modules, CSS-in-JS, or vanilla CSS
- Token-to-CSS mapping produces correct output for each CSS strategy (Tailwind classes, CSS custom properties, theme object references)
- `@design-token` annotations are present for every consumed token
- Anti-pattern compliance check catches violations declared in `design-system/DESIGN.md`
- Verification report uses severity levels matching `design.strictness` configuration
- `harness validate` passes after component generation

## Examples

### Example: React + Tailwind Button Component

**Context:** SaaS dashboard project. React with Tailwind CSS. Tokens generated by harness-design-system. Design intent established by harness-design (minimal style, cool professional tone).

**SCAFFOLD output:**

```

Framework detected: React (Next.js)
CSS strategy: Tailwind CSS (tailwind.config.ts)
Tokens loaded: 42 tokens from design-system/tokens.json
Design intent: Minimal, cool professional (from DESIGN.md)
Component plan: Button with primary/secondary/ghost variants
Token consumption: color.primary._, color.neutral._, typography.body, spacing.sm/md

````

**IMPLEMENT output (Button.tsx):**

```tsx
/* @design-token color.primary.500 — primary variant background */
/* @design-token color.primary.700 — primary variant hover */
/* @design-token color.neutral.50 — ghost variant background */
/* @design-token color.neutral.900 — ghost variant text */
/* @design-token typography.body.fontFamily — button label */
/* @design-token typography.body.fontWeight — button label weight */
/* @design-token spacing.sm — button horizontal padding */
/* @design-token spacing.xs — button vertical padding */

import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonProps) {
  const baseClasses =
    "inline-flex items-center justify-center font-body font-medium rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500";

  const variantClasses = {
    primary: "bg-primary-500 text-white hover:bg-primary-700",
    secondary:
      "border border-primary-500 text-primary-700 hover:bg-primary-50",
    ghost: "text-neutral-900 hover:bg-neutral-100",
  };

  const sizeClasses = {
    sm: "px-spacing-sm py-spacing-xs text-sm",
    md: "px-spacing-md py-spacing-sm text-base",
    lg: "px-spacing-lg py-spacing-md text-lg",
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
````

**VERIFY output:**

```
Verification Results
--------------------
Hardcoded values:    PASS (0 hardcoded colors, fonts, or spacing)
Token coverage:      PASS (8/8 referenced tokens exist in tokens.json)
Anti-pattern check:  PASS (no gradients, no decorative borders)
Design constraints:  PASS (no VIOLATES_DESIGN edges)
Harness validate:    PASS
```

### Example: Vue + CSS Custom Properties Card Component

**Context:** E-commerce project. Vue 3 with CSS custom properties. Tokens from harness-design-system.

**IMPLEMENT output (ProductCard.vue):**

```vue
<!-- @design-token color.neutral.50 — card background -->
<!-- @design-token color.neutral.200 — card border -->
<!-- @design-token color.neutral.900 — card text -->
<!-- @design-token typography.heading.fontFamily — product title -->
<!-- @design-token typography.body.fontFamily — product description -->
<!-- @design-token spacing.md — card padding -->
<!-- @design-token spacing.sm — content gap -->

<script setup lang="ts">
interface Props {
  title: string;
  description: string;
  price: string;
  imageUrl: string;
  imageAlt: string;
}

defineProps<Props>();
</script>

<template>
  <article class="product-card">
    <img :src="imageUrl" :alt="imageAlt" class="product-card__image" />
    <div class="product-card__content">
      <h3 class="product-card__title">{{ title }}</h3>
      <p class="product-card__description">{{ description }}</p>
      <span class="product-card__price">{{ price }}</span>
    </div>
  </article>
</template>

<style scoped>
.product-card {
  background: var(--color-neutral-50);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.product-card__content {
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.product-card__title {
  font-family: var(--typography-heading-fontFamily);
  font-weight: var(--typography-heading-fontWeight);
  color: var(--color-neutral-900);
}

.product-card__description {
  font-family: var(--typography-body-fontFamily);
  color: var(--color-neutral-700);
}
</style>
```

## Gates

These are hard stops. Violating any gate means the process has broken down.

- **No component generation without reading tokens from harness-design-system.** The SCAFFOLD phase requires `design-system/tokens.json` to exist. If tokens have not been generated, instruct the user to run harness-design-system first. Do not generate components with hardcoded values as a fallback.
- **No hardcoded design values in generated output.** Every color, font, and spacing value must reference a token. If a needed token does not exist, instruct the user to add it via harness-design-system rather than hardcoding the value.
- **No framework-specific code without framework detection.** The SCAFFOLD phase must detect or receive the target framework before generating components. Do not guess or default to React.
- **No generation without scaffold plan confirmation.** The SCAFFOLD phase must present a component plan to the user. Do not generate code without the user confirming the structure and token consumption plan.
- **No graph mutations without validating node types.** When creating `USES_TOKEN` or `PLATFORM_BINDING` edges, verify the node and edge types are registered in the graph schema before writing.

## Escalation

- **When `design-system/tokens.json` does not exist:** Instruct the user: "Design tokens have not been generated. Run `harness-design-system` first to create `design-system/tokens.json`, then re-run `harness-design-web` for token-bound component generation."
- **When the project uses an undetected framework:** Ask the user to specify via the `--framework` CLI argument. Log: "Could not auto-detect web framework. Please specify: `harness skill run harness-design-web --framework react|vue|svelte|vanilla`."
- **When tokens are insufficient for the requested component:** Report which tokens are missing: "Component requires a `color.accent.500` token but it does not exist in `tokens.json`. Run `harness-design-system` to add the missing token, or choose an existing alternative." Do not hardcode a fallback.
- **When anti-patterns conflict with the requested design:** Present the conflict: "The requested gradient background violates the 'no gradients on data elements' anti-pattern from DESIGN.md. Options: (1) Remove the gradient and use a solid token color, (2) Update the anti-pattern list via `harness-design` if the intent has changed."
- **When the knowledge graph is unavailable:** Skip graph operations in SCAFFOLD and VERIFY phases. Log: "Graph not available at `.harness/graph/` — skipping token node verification and USES_TOKEN edge creation. Run `harness scan` later to populate." Continue with file-based operations.

````

2. Run: `harness validate`
3. Commit: `feat(skills): add harness-design-web SKILL.md`

**Important note from Phase 3 learning:** Do NOT commit SKILL.md before Task 3 (platform copy). Stage both platform copies together to preserve Prettier parity.

### Task 3: Copy harness-design-web to gemini-cli platform and commit together

**Depends on:** Task 2
**Files:** `agents/skills/gemini-cli/harness-design-web/skill.yaml`, `agents/skills/gemini-cli/harness-design-web/SKILL.md`

1. Create directory: `mkdir -p agents/skills/gemini-cli/harness-design-web`
2. Copy skill.yaml: `cp agents/skills/claude-code/harness-design-web/skill.yaml agents/skills/gemini-cli/harness-design-web/skill.yaml`
3. Copy SKILL.md: `cp agents/skills/claude-code/harness-design-web/SKILL.md agents/skills/gemini-cli/harness-design-web/SKILL.md`
4. Verify byte-identical: `diff agents/skills/claude-code/harness-design-web/skill.yaml agents/skills/gemini-cli/harness-design-web/skill.yaml && diff agents/skills/claude-code/harness-design-web/SKILL.md agents/skills/gemini-cli/harness-design-web/SKILL.md`
5. Stage ALL four harness-design-web files (both platforms) together: `git add agents/skills/claude-code/harness-design-web/ agents/skills/gemini-cli/harness-design-web/`
6. Run: `pnpm test` — observe all tests pass
7. Commit: `feat(skills): add harness-design-web skill (both platforms)`

### Task 4: Create harness-design-mobile skill.yaml

**Depends on:** none (parallel with Tasks 1-3)
**Files:** `agents/skills/claude-code/harness-design-mobile/skill.yaml`

1. Create directory `agents/skills/claude-code/harness-design-mobile/`
2. Create file `agents/skills/claude-code/harness-design-mobile/skill.yaml`:

```yaml
name: harness-design-mobile
version: "1.0.0"
description: Token-bound mobile component generation with React Native, SwiftUI, Flutter, and Compose patterns and platform-specific design rules
cognitive_mode: meticulous-implementer
triggers:
  - manual
  - on_new_feature
  - on_commit
platforms:
  - claude-code
  - gemini-cli
tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
cli:
  command: harness skill run harness-design-mobile
  args:
    - name: path
      description: Project root path
      required: false
    - name: platform
      description: Target mobile platform (react-native, swiftui, flutter, compose)
      required: false
mcp:
  tool: run_skill
  input:
    skill: harness-design-mobile
    path: string
type: rigid
phases:
  - name: scaffold
    description: Read tokens and design intent, detect mobile platform, plan component structure with platform-specific rules
    required: true
  - name: implement
    description: Generate token-bound components with platform-specific patterns and native conventions
    required: true
  - name: verify
    description: Verify token binding, platform guideline compliance, and design constraints
    required: true
state:
  persistent: false
  files: []
depends_on:
  - harness-design-system
  - harness-design
````

3. Verify YAML is valid: `node -e "const yaml = require('yaml'); yaml.parse(require('fs').readFileSync('agents/skills/claude-code/harness-design-mobile/skill.yaml', 'utf-8'))"`
4. Commit: `feat(skills): add harness-design-mobile skill.yaml`

### Task 5: Create harness-design-mobile SKILL.md

**Depends on:** Task 4
**Files:** `agents/skills/claude-code/harness-design-mobile/SKILL.md`

1. Create file `agents/skills/claude-code/harness-design-mobile/SKILL.md` with full content (see below).

The SKILL.md must contain these sections:

```markdown
# Harness Design Mobile

> Token-bound mobile component generation. Scaffold from design tokens and aesthetic intent, implement with React Native, SwiftUI, Flutter, or Compose patterns following platform-specific design rules, and verify every value references the token set with native convention compliance.

## When to Use

- Generating new mobile components that must conform to the project's design system tokens
- When `on_new_feature` triggers fire with mobile UI scope requiring token-bound component generation
- When `on_commit` triggers fire and new mobile components contain hardcoded design values that should reference tokens
- Implementing design intent from `design-system/DESIGN.md` into platform-native styling (StyleSheet, SwiftUI modifiers, Flutter ThemeData, Compose MaterialTheme)
- Ensuring components follow platform-specific guidelines (iOS Human Interface Guidelines, Material Design 3, Flutter design patterns)
- NOT for generating design tokens themselves (use harness-design-system)
- NOT for establishing aesthetic direction or anti-patterns (use harness-design)
- NOT for accessibility auditing (use harness-accessibility)
- NOT for web platform components (use harness-design-web)

## Process

### Phase 1: SCAFFOLD — Read Tokens, Detect Platform, Plan Structure

1. **Read design tokens.** Load `design-system/tokens.json` (W3C DTCG format). Extract:
   - Color tokens: primary, secondary, accent, neutral ramps, semantic colors
   - Typography tokens: heading and body font families, font weights, font sizes, line heights
   - Spacing tokens: spacing scale values
   - If `design-system/tokens.json` does not exist, stop and instruct the user to run `harness-design-system` first.

2. **Read design intent.** Load `design-system/DESIGN.md` for:
   - Aesthetic direction (style, tone, differentiator)
   - Anti-patterns to avoid
   - Platform-specific mobile notes (touch targets, native component usage, platform conventions)
   - If `design-system/DESIGN.md` does not exist, warn the user and proceed with tokens only.

3. **Check harness configuration.** Read `harness.config.json` for:
   - `design.strictness` — enforcement level. Default to `standard`.
   - `design.platforms` — confirm `mobile` is in the platforms list.

4. **Detect mobile platform.** Scan the project for:
   - **React Native:** `package.json` contains `react-native` or `expo`, `.tsx` files with `StyleSheet` or `react-native` imports
   - **SwiftUI:** `.swift` files with `import SwiftUI`, `Package.swift` or `.xcodeproj` exists
   - **Flutter:** `pubspec.yaml` exists, `.dart` files with `import 'package:flutter/`
   - **Compose:** `build.gradle.kts` with `compose` dependencies, `.kt` files with `@Composable`
   - If the user specified `--platform`, use that override.

5. **Load platform-specific rules.** Based on detected platform, reference platform design guidelines:
   - **iOS (SwiftUI/React Native on iOS):** Human Interface Guidelines — safe area insets, navigation bar patterns, tab bar conventions, dynamic type support, SF Symbols integration
   - **Android (Compose/React Native on Android):** Material Design 3 — elevation system, shape system, dynamic color, navigation patterns, edge-to-edge layout
   - **Flutter:** Flutter design patterns — ThemeData structure, widget composition, adaptive layouts, platform channel considerations
   - **React Native cross-platform:** Platform-specific overrides via `Platform.select`, safe area handling, navigation library patterns

6. **Build token-to-platform mapping.** Create a lookup table mapping tokens to platform-native representations:
   - **React Native:** `color.primary.500` maps to `StyleSheet` value or themed constant
   - **SwiftUI:** `color.primary.500` maps to `Color("primary500")` in asset catalog or `Color(hex:)` extension
   - **Flutter:** `color.primary.500` maps to `Theme.of(context).colorScheme.primary` or custom `AppColors.primary500`
   - **Compose:** `color.primary.500` maps to `MaterialTheme.colorScheme.primary` or custom `AppTheme.colors.primary500`

7. **Plan component structure.** Define:
   - Component file path(s) following platform conventions
   - Props/parameters interface
   - Which tokens will be consumed
   - Platform-specific considerations (safe areas, touch targets, dynamic type)
   - Present plan to user before proceeding.

### Phase 2: IMPLEMENT — Generate Token-Bound Mobile Components

1. **Generate platform-specific component code.** Based on detected platform:

   **React Native (TypeScript):**
   - Functional component with TypeScript props interface
   - All colors via themed StyleSheet or token constants (no hardcoded hex values)
   - Typography via scaled text styles referencing token font families and sizes
   - Spacing via token-derived constants in StyleSheet
   - Platform-specific overrides via `Platform.select` where iOS and Android differ
   - Safe area handling via `useSafeAreaInsets` for edge-to-edge content

   **SwiftUI:**
   - View struct with typed properties
   - Colors from asset catalog or Color extension referencing tokens
   - Typography via custom `Font` extensions mapping to token values
   - Spacing via token-derived constants
   - Dynamic Type support via `.font(.body)` or custom scaled fonts
   - Safe area respect via `.safeAreaInset` modifiers
   - iOS Human Interface Guidelines compliance (44pt minimum touch targets)

   **Flutter (Dart):**
   - StatelessWidget or StatefulWidget with typed constructor parameters
   - Colors via `Theme.of(context)` or custom `AppColors` class referencing tokens
   - Typography via `Theme.of(context).textTheme` or custom `AppTypography`
   - Spacing via token-derived constants class
   - Material Design 3 compliance (elevation, shape, dynamic color)
   - Adaptive layout via `LayoutBuilder` or `MediaQuery` for responsive behavior

   **Compose (Kotlin):**
   - `@Composable` function with typed parameters
   - Colors via `MaterialTheme.colorScheme` or custom theme referencing tokens
   - Typography via `MaterialTheme.typography` or custom type scale
   - Spacing via token-derived `Dp` constants
   - Material Design 3 compliance (Surface, ElevatedCard, shape system)
   - Modifier chains for layout following Compose conventions

2. **Apply platform-specific rules:**
   - **Touch targets:** Minimum 44x44pt (iOS) or 48x48dp (Android/Material)
   - **Safe areas:** All platforms handle notch/status bar/navigation bar correctly
   - **Typography scaling:** Support dynamic type (iOS), font scale (Android), and text scale factor (Flutter)
   - **Elevation/shadows:** Platform-appropriate (iOS shadow, Material elevation, Flutter elevation)
   - **Navigation patterns:** Platform-native navigation (UINavigationController, NavHost, Navigator)

3. **Add USES_TOKEN annotations.** Insert platform-appropriate comments documenting token consumption:
```

// @design-token color.primary.500 — primary action background
// @design-token typography.heading.fontFamily — section heading
// @design-token spacing.md — card internal padding

```

### Phase 3: VERIFY — Check Token Binding and Platform Compliance

1. **Scan for hardcoded values.** Search generated files for:
- Hardcoded color values: hex codes, `UIColor(red:green:blue:)`, `Color(0xFF...)`, `Color(red:green:blue:)`
- Hardcoded font families: string literals for font names not referencing tokens
- Hardcoded spacing: raw numeric values in padding/margin not from the token scale

2. **Verify token coverage.** For every design value in generated components:
- Confirm it resolves to a token in `design-system/tokens.json`
- Confirm the token path is valid
- Report orphan references

3. **Check platform guideline compliance:**
- **iOS:** Touch targets >= 44pt, safe area respected, dynamic type supported
- **Android/Material:** Touch targets >= 48dp, edge-to-edge layout, Material 3 components used
- **Flutter:** ThemeData used consistently, no hardcoded Material values
- **React Native:** Platform.select used for iOS/Android differences, safe area handled

4. **Check anti-pattern compliance.** Cross-reference against `design-system/DESIGN.md` anti-patterns.

5. **Query the knowledge graph.** If available at `.harness/graph/`:
- Verify `DesignToken` nodes exist for all referenced tokens
- Verify `PLATFORM_BINDING` edges exist for the target mobile platform
- Check `VIOLATES_DESIGN` edges via `DesignConstraintAdapter`

6. **Assign severity based on `designStrictness`:**
- `permissive` — all findings are `info`
- `standard` — hardcoded values are `warn`, platform guideline violations are `warn`, accessibility violations are `error`
- `strict` — hardcoded values are `error` (blocks), platform violations are `warn`, accessibility violations are `error`

7. **Report verification results:**
```

MOBILE-001 [warn] Hardcoded color Color(0xFF3B82F6) — should reference token
File: lib/widgets/action_button.dart:15
Fix: Use Theme.of(context).colorScheme.primary or AppColors.primary500

MOBILE-002 [warn] Touch target 32dp below minimum 48dp (Material Design 3)
File: lib/widgets/icon_action.dart:22
Fix: Set minimumSize to Size(48, 48) in ButtonStyle

MOBILE-003 [info] Missing dynamic type support
File: Sources/Views/ProductCard.swift:18
Fix: Use .font(.body) instead of .font(.system(size: 16))

```

8. **Run `harness validate`.** Confirm new components integrate cleanly.

## Harness Integration

- **`harness validate`** — Run after generating components to verify project health.
- **`harness scan`** — Run after component generation to update the knowledge graph with `USES_TOKEN` and `PLATFORM_BINDING` edges.
- **`DesignIngestor`** (`packages/graph/src/ingest/DesignIngestor.ts`) — Verifies `DesignToken` nodes exist for all tokens referenced by generated components.
- **`DesignConstraintAdapter`** (`packages/graph/src/constraints/DesignConstraintAdapter.ts`) — Checks for `VIOLATES_DESIGN` edges during VERIFY phase. Reports constraint violations at configured strictness.
- **`harness-design-system`** — Dependency. Provides `design-system/tokens.json`. If tokens do not exist, instruct user to run harness-design-system first.
- **`harness-design`** — Dependency. Provides `design-system/DESIGN.md` with aesthetic intent and anti-patterns.
- **`harness-impact-analysis`** — Traces token changes to affected mobile components via `USES_TOKEN` edges.

## Success Criteria

- Generated mobile components reference design tokens exclusively — no hardcoded color, font, or spacing values
- Platform detection correctly identifies React Native, SwiftUI, Flutter, or Compose projects
- Token-to-platform mapping produces correct output for each mobile platform
- Platform-specific rules are enforced (touch targets, safe areas, dynamic type, Material 3 compliance)
- `@design-token` annotations are present for every consumed token
- Anti-pattern compliance check catches violations from `design-system/DESIGN.md`
- Verification report uses severity levels matching `design.strictness` configuration
- `harness validate` passes after component generation

## Examples

### Example: React Native Card Component

**Context:** Fitness app. React Native with Expo. Tokens from harness-design-system. Design intent: expressive, warm tone.

**SCAFFOLD output:**

```

Platform detected: React Native (Expo)
Tokens loaded: 38 tokens from design-system/tokens.json
Design intent: Expressive, warm (from DESIGN.md)
Component plan: WorkoutCard with progress indicator
Token consumption: color.primary._, color.accent._, typography.heading, spacing.md/lg
Platform rules: iOS 44pt touch targets, Android 48dp touch targets, safe area insets

````

**IMPLEMENT output (WorkoutCard.tsx):**

```tsx
// @design-token color.primary.500 — card accent
// @design-token color.neutral.50 — card background
// @design-token color.neutral.900 — primary text
// @design-token typography.heading.fontFamily — workout title
// @design-token typography.body.fontFamily — workout details
// @design-token spacing.md — card padding
// @design-token spacing.sm — content gap

import { View, Text, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tokens } from "@/theme/tokens";

interface WorkoutCardProps {
  title: string;
  duration: string;
  progress: number;
}

export function WorkoutCard({ title, duration, progress }: WorkoutCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.detail}>{duration}</Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.neutral[50],
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
    ...Platform.select({
      ios: {
        shadowColor: tokens.color.neutral[900],
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  title: {
    fontFamily: tokens.typography.heading.fontFamily,
    fontWeight: tokens.typography.heading.fontWeight,
    fontSize: 18,
    color: tokens.color.neutral[900],
  },
  detail: {
    fontFamily: tokens.typography.body.fontFamily,
    fontSize: 14,
    color: tokens.color.neutral[600],
  },
  progressTrack: {
    height: 6,
    backgroundColor: tokens.color.neutral[200],
    borderRadius: 3,
  },
  progressFill: {
    height: 6,
    backgroundColor: tokens.color.primary[500],
    borderRadius: 3,
  },
});
````

### Example: SwiftUI List Item

**IMPLEMENT output (WorkoutRow.swift):**

```swift
// @design-token color.primary.500 — accent color
// @design-token color.neutral.900 — primary text
// @design-token color.neutral.600 — secondary text
// @design-token typography.heading.fontWeight — title weight
// @design-token spacing.sm — content spacing

import SwiftUI

struct WorkoutRow: View {
    let title: String
    let duration: String
    let progress: Double

    var body: some View {
        VStack(alignment: .leading, spacing: AppSpacing.sm) {
            Text(title)
                .font(.headline)
                .foregroundColor(AppColors.neutral900)

            Text(duration)
                .font(.subheadline)
                .foregroundColor(AppColors.neutral600)

            ProgressView(value: progress)
                .tint(AppColors.primary500)
        }
        .padding(AppSpacing.md)
        .accessibilityElement(children: .combine)
    }
}
```

## Gates

- **No component generation without reading tokens from harness-design-system.** The SCAFFOLD phase requires `design-system/tokens.json`. Do not generate components with hardcoded values as a fallback.
- **No hardcoded design values in generated output.** Every color, font, and spacing value must reference a token.
- **No platform-specific code without platform detection.** The SCAFFOLD phase must detect or receive the target mobile platform before generating components.
- **No generation without scaffold plan confirmation.** Present the component plan to the user first.
- **No iOS components without 44pt minimum touch targets.** Touch target violations are `error` severity regardless of strictness level.
- **No Android/Material components without 48dp minimum touch targets.** Same as iOS — touch targets are non-negotiable.
- **No graph mutations without validating node types.** Verify edge types are registered before writing.

## Escalation

- **When `design-system/tokens.json` does not exist:** Instruct the user: "Design tokens have not been generated. Run `harness-design-system` first, then re-run `harness-design-mobile`."
- **When the project targets multiple mobile platforms:** Generate for the primary platform first, then offer to generate platform-adapted variants. React Native projects get both iOS and Android considerations in a single pass.
- **When tokens are insufficient for the requested component:** Report missing tokens and instruct the user to add them via harness-design-system.
- **When platform guidelines conflict with design intent:** Present the conflict: "Material Design 3 recommends rounded corners for cards, but your design intent declares 'sharp edges only.' Options: (1) Follow platform guidelines for native feel, (2) Override with design intent for brand consistency."
- **When the knowledge graph is unavailable:** Skip graph operations. Log: "Graph not available — skipping token node verification and PLATFORM_BINDING edge creation. Run `harness scan` later to populate."

```

2. Run: `harness validate`
3. Commit: `feat(skills): add harness-design-mobile SKILL.md`

**Important note from Phase 3 learning:** Do NOT commit SKILL.md before Task 6 (platform copy). Stage both platform copies together.

### Task 6: Copy harness-design-mobile to gemini-cli platform, run tests, commit all

**Depends on:** Task 5
**Files:** `agents/skills/gemini-cli/harness-design-mobile/skill.yaml`, `agents/skills/gemini-cli/harness-design-mobile/SKILL.md`

1. Create directory: `mkdir -p agents/skills/gemini-cli/harness-design-mobile`
2. Copy skill.yaml: `cp agents/skills/claude-code/harness-design-mobile/skill.yaml agents/skills/gemini-cli/harness-design-mobile/skill.yaml`
3. Copy SKILL.md: `cp agents/skills/claude-code/harness-design-mobile/SKILL.md agents/skills/gemini-cli/harness-design-mobile/SKILL.md`
4. Verify byte-identical: `diff agents/skills/claude-code/harness-design-mobile/skill.yaml agents/skills/gemini-cli/harness-design-mobile/skill.yaml && diff agents/skills/claude-code/harness-design-mobile/SKILL.md agents/skills/gemini-cli/harness-design-mobile/SKILL.md`
5. Stage ALL four harness-design-mobile files (both platforms) together: `git add agents/skills/claude-code/harness-design-mobile/ agents/skills/gemini-cli/harness-design-mobile/`
6. Run: `pnpm test` — observe all tests pass (expect ~14 new auto-discovered tests per skill)
7. Commit: `feat(skills): add harness-design-mobile skill (both platforms)`

## Sequence and Dependencies

```

Task 1 (web skill.yaml) ──┐
├── Task 2 (web SKILL.md) ── Task 3 (web gemini-cli copy + commit)
│
Task 4 (mobile skill.yaml)┤
├── Task 5 (mobile SKILL.md) ── Task 6 (mobile gemini-cli copy + commit)

```

Tasks 1 and 4 are independent and can run in parallel.
Tasks 2-3 depend on Task 1. Tasks 5-6 depend on Task 4.
The web chain (1-2-3) and mobile chain (4-5-6) are independent of each other.

**Recommended execution waves:**
- Wave 1: Tasks 1 + 4 (parallel — create skill.yaml files)
- Wave 2: Tasks 2 + 5 (parallel — create SKILL.md files)
- Wave 3: Tasks 3 + 6 (parallel — platform copies and test verification)

**Estimated time:** 6 tasks x ~3 minutes = ~18 minutes

## Traceability

| Observable Truth | Delivered by Task(s) |
|---|---|
| OT-1: web skill.yaml exists with correct fields | Task 1 |
| OT-2: web SKILL.md exists with all sections | Task 2 |
| OT-3: web gemini-cli copies byte-identical | Task 3 |
| OT-4: mobile skill.yaml exists with correct fields | Task 4 |
| OT-5: mobile SKILL.md exists with all sections | Task 5 |
| OT-6: mobile gemini-cli copies byte-identical | Task 6 |
| OT-7: pnpm test passes | Task 3, Task 6 |
| OT-8: web SKILL.md references correct dependencies | Task 2 |
| OT-9: mobile SKILL.md references correct dependencies | Task 5 |
```
