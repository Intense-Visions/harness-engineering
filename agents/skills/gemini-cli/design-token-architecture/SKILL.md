# Token Architecture

> Token taxonomy covering primitive, semantic, and component tokens with naming conventions, aliasing chains, theme switching, and the token-to-code pipeline.

## When to Use

- Establishing a design token structure for a new design system
- Migrating from hardcoded values (hex colors, pixel sizes) to a token-based architecture
- Adding theme support (light/dark, brand variants, high-contrast) to an existing system
- Resolving naming conflicts where the same token name means different things in different contexts
- Building the pipeline that transforms design tokens into platform-specific code (CSS, iOS, Android)

## Instructions

Design tokens are the atomic values of a design system -- colors, spacing, typography, elevation, motion -- stored as platform-agnostic data. A well-architected token system has exactly three tiers, each with a distinct purpose and naming convention. Every visual value in your codebase should resolve to a token; any hardcoded value is a system escape.

**The three-tier model:**

1. **Primitive tokens** (also called "global" or "reference" tokens): Raw values with no semantic meaning. `color.blue.500: #2563EB`. They answer "what values exist?"
2. **Semantic tokens** (also called "alias" or "decision" tokens): Purpose-driven aliases that reference primitives. `color.background.brand: {color.blue.500}`. They answer "what is this value for?"
3. **Component tokens**: Scoped to a specific component, referencing semantic tokens. `button.background.primary: {color.background.brand}`. They answer "how does this component use the system?"

Components consume component tokens. Component tokens alias semantic tokens. Semantic tokens alias primitives. This chain is the backbone of theme switching: swap the semantic-to-primitive mapping and every component updates.

## Details

### Primitive Token Layer

Primitives define the complete palette of available values. They are exhaustive (every possible value is listed), value-based (named after what they are, not what they do), and stable (they rarely change after initial definition).

**Color primitives** follow a numeric scale. Stripe uses 50-950 in 11 steps per hue:

```
color.blue.50:   #EFF6FF
color.blue.100:  #DBEAFE
color.blue.200:  #BFDBFE
color.blue.300:  #93C5FD
color.blue.400:  #60A5FA
color.blue.500:  #3B82F6
color.blue.600:  #2563EB
color.blue.700:  #1D4ED8
color.blue.800:  #1E40AF
color.blue.900:  #1E3A8A
color.blue.950:  #172554
```

**Spacing primitives** use a geometric or linear scale. Material Design 3 uses a 4px baseline:

```
spacing.0:    0px
spacing.1:    4px
spacing.2:    8px
spacing.3:    12px
spacing.4:    16px
spacing.6:    24px
spacing.8:    32px
spacing.10:   40px
spacing.12:   48px
spacing.16:   64px
```

**Typography primitives** define the raw font properties:

```
font.family.sans:       "Inter", system-ui, sans-serif
font.family.mono:       "JetBrains Mono", monospace
font.weight.regular:    400
font.weight.medium:     500
font.weight.semibold:   600
font.weight.bold:       700
font.size.xs:           12px
font.size.sm:           14px
font.size.md:           16px
font.size.lg:           18px
font.size.xl:           20px
font.size.2xl:          24px
```

Stripe uses `sohne-var` as their brand font primitive -- a single variable font token that enables weight and width modulation through font-variation-settings rather than multiple font-family tokens.

### Semantic Token Layer

Semantic tokens encode design decisions. They reference primitives but carry purpose in their names. The naming convention follows the CTI (Category-Type-Item) format, optionally extended with state and scale modifiers.

**CTI format:** `{category}.{type}.{item}.{state?}.{scale?}`

```
color.background.default:         {color.neutral.50}      /* page background */
color.background.subtle:          {color.neutral.100}     /* card background */
color.background.brand:           {color.blue.600}        /* primary action */
color.background.brand.hover:     {color.blue.700}        /* primary hover */
color.background.danger:          {color.red.600}         /* destructive action */
color.background.danger.hover:    {color.red.700}         /* destructive hover */
color.text.default:               {color.neutral.900}     /* body text */
color.text.subtle:                {color.neutral.500}     /* secondary text */
color.text.on-brand:              {color.white}           /* text on brand bg */
color.border.default:             {color.neutral.200}     /* standard border */
color.border.focus:               {color.blue.500}        /* focus ring */
```

**Theme switching** works by remapping semantic tokens to different primitives:

```
/* Light theme */
color.background.default: {color.neutral.50}
color.text.default:       {color.neutral.900}

/* Dark theme */
color.background.default: {color.neutral.900}
color.text.default:       {color.neutral.50}
```

GitHub Primer's token system uses this exact pattern. Their `--color-canvas-default` resolves to `#ffffff` in light mode and `#0d1117` in dark mode. They support 6 themes (light, light high contrast, light colorblind, dark, dark high contrast, dark dimmed) by maintaining 6 semantic-to-primitive mappings.

### Component Token Layer

Component tokens scope semantic decisions to individual components. They are optional for small systems (under 20 components) but essential for large ones.

```
button.color.background.primary:          {color.background.brand}
button.color.background.primary.hover:    {color.background.brand.hover}
button.color.background.primary.active:   {color.background.brand.active}
button.color.background.secondary:        {color.background.subtle}
button.color.text.primary:                {color.text.on-brand}
button.color.text.secondary:              {color.text.default}
button.spacing.padding.sm:                {spacing.2} {spacing.3}
button.spacing.padding.md:                {spacing.2} {spacing.4}
button.spacing.padding.lg:                {spacing.3} {spacing.6}
button.border.radius:                     {border.radius.md}
```

Material Design 3 maps every component to semantic tokens. Their `FilledButton` uses `md.sys.color.primary` for background and `md.sys.color.on-primary` for text, creating a fully traceable chain from component surface to primitive value.

### Token-to-Code Pipeline

Tokens are authored in a format (JSON, YAML, or DTCG) and transformed into platform outputs.

**DTCG (Design Tokens Community Group) format** is the emerging W3C standard:

```json
{
  "color": {
    "brand": {
      "$type": "color",
      "$value": "#2563EB",
      "$description": "Primary brand color"
    }
  }
}
```

**Transformation pipeline** (using Style Dictionary, Cobalt UI, or Tokens Studio):

```
tokens.json -> Style Dictionary -> CSS custom properties
                                -> iOS Swift UIColor extensions
                                -> Android XML resources
                                -> Figma variables (via Tokens Studio)
```

IBM Carbon's token pipeline generates CSS custom properties, SCSS variables, and JavaScript objects from a single JSON source. Their `@carbon/colors` package exposes `$blue-60: #0f62fe` as SCSS and `--cds-blue-60: #0f62fe` as CSS.

### Aliasing Chains and Debugging

A token aliasing chain traces the resolution path: `component -> semantic -> primitive -> raw value`.

```
button.color.background.primary
  -> color.background.brand
    -> color.blue.600
      -> #2563EB
```

**Maximum chain depth: 3 hops.** More than 3 levels of aliasing creates debugging pain. If tracing a button's color requires traversing 5 files, the architecture is over-layered.

Salesforce Lightning provides a token resolution inspector in their developer tools that shows the full chain for any element, from component token to resolved CSS value.

### Anti-Patterns

**Semantic names that are actually descriptive.** Naming a token `color.background.blue` defeats the purpose of the semantic layer. "Blue" is a description of the value, not its purpose. When brand color changes from blue to purple, `color.background.blue` becomes a lie. Use `color.background.brand` instead.

**Skipping the semantic layer.** Component tokens that directly reference primitives (`button.background: {color.blue.600}`) bypass the theme-switching mechanism. Every component token must go through a semantic token. Direct primitive references in components mean theme changes require updating every component token file.

**Token explosion through over-specification.** Creating a unique token for every possible state combination: `button.primary.small.hover.disabled.background`. This produces thousands of tokens. Instead, compose from orthogonal dimensions: `button.background.primary.hover` + `button.size.sm.padding`. Shopify Polaris keeps their token count under 400 by using composable dimensions rather than combinatorial tokens.

**Inconsistent scale naming.** Mixing `sm/md/lg` with `small/medium/large` with `1/2/3` across different token categories. Pick one scale convention and use it everywhere. GitHub Primer uses numeric scales for colors (0-9) and t-shirt sizes (sm, md, lg) for spacing -- but this split is intentional and documented, not accidental.

**Orphaned primitives.** Primitive tokens that no semantic token references. If `color.orange.300` exists but nothing uses it, it adds cognitive load without value. Audit primitive usage quarterly. IBM Carbon's automated tooling flags primitives with zero semantic references.

### Real-World Examples

**Stripe** operates a 3-tier system where primitive tokens include their brand typeface `sohne-var` as a font primitive. Their semantic layer maps `--color-primary` through 6 themes including a high-contrast accessibility mode. Component tokens are generated per-component, keeping each component's token file under 30 lines.

**Material Design 3** introduced dynamic color tokens that generate an entire theme from a single seed color using the HCT (Hue, Chroma, Tone) color space. A seed of `#6750A4` generates 5 tonal palettes (Primary, Secondary, Tertiary, Neutral, Neutral Variant), each with 13 tones (0, 10, 20...100), producing 65 primitive tokens that map to 29 semantic color roles.

**GitHub Primer** maintains one of the most sophisticated token aliasing systems in production. Their `primer/primitives` package defines 6 complete theme mappings. Token values are authored in JSON, transformed via a custom build pipeline, and output as CSS custom properties and JavaScript objects. Their `color-contrast` checks run against every theme variant during CI.

**Apple** uses platform-specific token sets: `systemBackground` resolves to `#FFFFFF` on iOS light, `#000000` on iOS dark, `#ECECEC` on macOS light, and `#1E1E1E` on macOS dark. The semantic name is identical across platforms, but the primitive mapping differs per platform and appearance combination.

## Source

W3C Design Tokens Community Group, _Design Tokens Format Module_ (Editor's Draft, 2024). Jina Anne, "Design Tokens for Dummies" (2019). Nathan Curtis, "Naming Tokens in Design Systems" (2020). Salesforce Lightning Design System documentation on token architecture.

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.
