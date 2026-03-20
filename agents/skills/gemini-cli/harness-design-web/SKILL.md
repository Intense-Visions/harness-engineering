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

6. **Load platform-specific web rules.** Read `agents/skills/shared/design-knowledge/platform-rules/web.yaml` for web-specific design rules including responsive breakpoints, browser compatibility considerations, and CSS best practices.

7. **Load anti-pattern definitions.** Read anti-pattern files from `agents/skills/shared/design-knowledge/anti-patterns/`:
   - `typography.yaml` — typographic anti-patterns (too many fonts, inconsistent scales)
   - `color.yaml` — color anti-patterns (hardcoded hex, insufficient contrast)
   - `layout.yaml` — layout anti-patterns (magic numbers, inconsistent spacing)
   - `motion.yaml` — motion anti-patterns (excessive animation, missing reduced-motion)

8. **Build token-to-CSS mapping.** Create a lookup table that maps each token to its CSS representation based on the detected strategy:
   - **Tailwind:** `color.primary.500` maps to `text-primary-500` / `bg-primary-500` (requires `tailwind.config` theme extension)
   - **CSS custom properties:** `color.primary.500` maps to `var(--color-primary-500)`
   - **CSS-in-JS:** `color.primary.500` maps to `theme.color.primary[500]`

9. **Plan component structure.** For the requested component(s), define:
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
   - Check against anti-patterns from `design-system/DESIGN.md` and `agents/skills/shared/design-knowledge/anti-patterns/`
   - Enforce style guidelines (e.g., minimal style means no decorative effects)
   - Apply tone-appropriate color usage (e.g., cool tone means no warm accents in neutral UI)
   - Respect platform-specific web notes (animation preferences, responsive behavior)

4. **Add USES_TOKEN annotations.** Insert comments in generated code documenting which tokens are consumed:
   ```
   /* @design-token color.primary.500 — primary action background */
   /* @design-token typography.heading.fontFamily — section heading */
   /* @design-token spacing.md — card internal padding */
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

3. **Check anti-pattern compliance.** Cross-reference generated code against anti-patterns declared in `design-system/DESIGN.md` and the anti-pattern definitions in `agents/skills/shared/design-knowledge/anti-patterns/`:
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
Framework detected:   React (Next.js)
CSS strategy:         Tailwind CSS (tailwind.config.ts)
Tokens loaded:        42 tokens from design-system/tokens.json
Design intent:        Minimal, cool professional (from DESIGN.md)
Component plan:       Button with primary/secondary/ghost variants
Token consumption:    color.primary.*, color.neutral.*, typography.body, spacing.sm/md
```

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

import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonProps) {
  const baseClasses =
    'inline-flex items-center justify-center font-body font-medium rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500';

  const variantClasses = {
    primary: 'bg-primary-500 text-white hover:bg-primary-700',
    secondary: 'border border-primary-500 text-primary-700 hover:bg-primary-50',
    ghost: 'text-neutral-900 hover:bg-neutral-100',
  };

  const sizeClasses = {
    sm: 'px-spacing-sm py-spacing-xs text-sm',
    md: 'px-spacing-md py-spacing-sm text-base',
    lg: 'px-spacing-lg py-spacing-md text-lg',
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
```

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
