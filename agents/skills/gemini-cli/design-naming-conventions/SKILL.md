# Naming Conventions

> Design system nomenclature for semantic and descriptive names, color naming, size naming, and maintaining consistent vocabulary across design and code.

## When to Use

- Establishing naming patterns for a new design system's tokens, components, or variants
- Resolving naming inconsistencies between design files (Figma) and code (React/CSS)
- Renaming tokens or components during a system refactor without breaking consumers
- Debating whether a color should be called "blue-500" or "brand-primary" (the answer is both, at different layers)
- Writing a naming convention guide for contributors to follow

## Instructions

Names are the primary interface of a design system. A developer reads a name and must immediately understand what the thing does, where it belongs, and how it relates to other things. Bad names create ambiguity that compounds across hundreds of components and thousands of tokens.

**The naming decision procedure:**

1. **Determine the layer.** Is this a primitive (named by what it IS), a semantic token (named by what it DOES), or a component (named by what it RENDERS)?
2. **Apply the layer's convention.** Primitives use descriptive names. Semantic tokens use purpose names. Components use noun-based names.
3. **Check for collisions.** Does this name conflict with or shadow an existing name in the system? Search the token and component registries.
4. **Check for lies.** Will this name become inaccurate if the underlying value changes? If `color-blue-primary` is renamed when the brand shifts to purple, it was a bad name from the start.
5. **Check for ambiguity.** Can two reasonable people disagree about what this name refers to? If yes, the name is too vague.

## Details

### Descriptive vs Semantic Naming

The core distinction in design system naming is between descriptive names (what something IS) and semantic names (what something is FOR).

**Descriptive names** state the literal value or appearance:

```
color.blue.500          /* describes the hue and lightness */
font.size.16            /* describes the pixel value */
spacing.8               /* describes the pixel value */
border.radius.4         /* describes the pixel value */
```

**Semantic names** state the purpose or role:

```
color.background.brand       /* describes the role in the interface */
font.size.body              /* describes where it is used */
spacing.inline.md           /* describes the spatial relationship */
border.radius.control       /* describes what it rounds */
```

Both are necessary. Primitives use descriptive names because their purpose is to catalog available values. Semantic tokens use purpose names because their purpose is to encode decisions. A system with only descriptive names cannot theme. A system with only semantic names cannot be audited for palette coverage.

**IBM Carbon** maintains both layers explicitly. Their SCSS exposes `$blue-60: #0f62fe` (descriptive primitive) and `$interactive-01: $blue-60` (semantic alias). Developers use `$interactive-01`; the descriptive name exists only in the token definition file.

### Color Naming

Color naming is the most contentious area of design system nomenclature. The decision tree:

**Primitive color names** use hue + numeric scale:

```
red.50, red.100, red.200 ... red.900, red.950
blue.50, blue.100, blue.200 ... blue.900, blue.950
neutral.50, neutral.100 ... neutral.950
```

The numeric scale represents lightness, not importance. 50 is lightest, 950 is darkest. This convention (used by Tailwind, Radix, Stripe, GitHub Primer) is the de facto standard. Avoid inventing custom scales (1-10, light/medium/dark) unless your system has a documented reason.

**Semantic color names** use role-based categories:

| Category       | Examples                                                          | Purpose         |
| -------------- | ----------------------------------------------------------------- | --------------- |
| `background.*` | `background.default`, `background.subtle`, `background.brand`     | Surface colors  |
| `text.*`       | `text.default`, `text.subtle`, `text.disabled`, `text.on-brand`   | Text foreground |
| `border.*`     | `border.default`, `border.focus`, `border.error`                  | Edge colors     |
| `icon.*`       | `icon.default`, `icon.subtle`, `icon.brand`                       | Icon foreground |
| `status.*`     | `status.success`, `status.warning`, `status.error`, `status.info` | Feedback colors |

GitHub Primer uses `--color-fg-default` (foreground/text), `--color-canvas-default` (background), `--color-border-default`. The `fg`/`canvas`/`border` prefix groups by surface type, and `default`/`subtle`/`muted`/`emphasis` suffix indicates prominence.

**What NOT to name colors:**

- Avoid emotion words: `color.happy`, `color.calm`. These are subjective and culture-dependent.
- Avoid use-case specifics at the semantic layer: `color.sidebar-background`. This belongs in component tokens.
- Avoid compound descriptors: `color.light-blue-ish`. If it does not fit a hue name, define a new hue.

### Size Naming

Size naming must be consistent across all dimensions: component sizes, spacing, typography, and icon sizes.

**T-shirt sizes** are the most common convention:

```
xs, sm, md, lg, xl, 2xl, 3xl
```

**Rules for t-shirt size scales:**

- `md` is always the default. If a component has a `size` prop, omitting it should give `md`.
- Never go below `xs` or above `3xl`. If you need more, your scale is too granular.
- The scale must be arithmetic or geometric, not arbitrary. Atlassian uses: xs=24, sm=32, md=40, lg=48 (linear +8). Material uses: sm=36, md=40, lg=56 (non-linear, justified by touch target research).

**Numeric scales** are used when t-shirt sizes are insufficient:

```
spacing.0, spacing.1, spacing.2, spacing.3, spacing.4, spacing.6, spacing.8
```

These reference a base unit. If `spacing.1 = 4px`, then `spacing.4 = 16px`. The convention: the number IS the multiplier, not the pixel value. Tailwind uses `p-4` = `16px` (4 \* 4px base). Material uses `dp` units directly.

**Never mix conventions within a category.** If component sizes use t-shirt sizes, all components use t-shirt sizes. If spacing uses numeric scales, all spacing uses numeric scales. Shopify Polaris uses t-shirt sizes for components and numeric tokens for spacing -- this is a clean split across categories, not mixing within one.

### Cross-Discipline Vocabulary

Design systems span design tools (Figma), code (React/CSS), and documentation. Names must survive the translation across all three.

**The vocabulary alignment checklist:**

1. **Figma component name = Code component name.** If Figma calls it "Action Card" and code calls it `InteractiveCard`, contributors will use the wrong name in discussions. Shopify Polaris enforces 1:1 Figma-to-code naming: `Button/Primary/Medium` in Figma maps to `<Button variant="primary" size="medium">`.
2. **Figma variant properties = Code props.** Figma's variant axis "Type: Primary | Secondary | Ghost" must map to the code prop `variant: 'primary' | 'secondary' | 'ghost'`, not `type` or `appearance` or `kind`.
3. **Token names are identical in Figma and code.** If Figma uses `color/background/brand` and code uses `--color-bg-brand`, the abbreviation `bg` vs `background` creates confusion. Pick one and enforce it everywhere.

**Vocabulary register (maintain in your documentation):**

| Concept          | Accepted Term | Rejected Alternatives                 | Rationale                                                     |
| ---------------- | ------------- | ------------------------------------- | ------------------------------------------------------------- |
| Visual form      | `variant`     | `type`, `kind`, `appearance`, `style` | `type` conflicts with HTML `type`; `style` conflicts with CSS |
| Prominence level | `emphasis`    | `priority`, `weight`, `level`         | Aligns with Material Design terminology                       |
| Size             | `size`        | `dimension`, `scale`                  | Most universally understood                                   |
| Disabled state   | `disabled`    | `inactive`, `locked`, `frozen`        | HTML native attribute name                                    |
| Loading state    | `loading`     | `pending`, `busy`, `processing`       | Most common in design system literature                       |

Atlassian maintains a public glossary of over 60 terms that all contributors must use. Their glossary explicitly lists rejected synonyms for each term.

### Component Naming

Component names should be nouns that describe what the component renders, not what it does.

**Good names:** `Button`, `Card`, `Dialog`, `Avatar`, `Badge`, `Tooltip`, `DataTable`
**Bad names:** `Clickable`, `Displayable`, `Openable`, `Toggleable`

**Compound component naming** uses dot notation or directory nesting:

```
/* Dot notation (React) */
Dialog.Header, Dialog.Body, Dialog.Footer

/* Directory nesting (file system) */
Dialog/
  DialogHeader.tsx
  DialogBody.tsx
  DialogFooter.tsx
  index.tsx        /* exports Dialog with sub-components attached */
```

**Prefix conventions for sub-components:**

- Same-component children: `Dialog.Header` (parent name as namespace)
- Shared utility components: `VisuallyHidden`, `Portal`, `FocusTrap` (descriptive, no namespace)
- Layout components: `Stack`, `Inline`, `Grid`, `Box` (abstract spatial nouns)

### Anti-Patterns

**Abbreviation inconsistency.** Using `bg` in some tokens and `background` in others, `sm` in some contexts and `small` in others. Every abbreviation must be listed in the vocabulary register and used uniformly. GitHub Primer uses `fg` (foreground) consistently across 200+ tokens -- it appears abbreviated everywhere or nowhere.

**Semantic names that encode visual properties.** Naming a token `color.text.bold` (a visual treatment) instead of `color.text.emphasis` (a semantic role). When the emphasis style changes from bold to a different color, the name `bold` becomes misleading. Semantic names must survive implementation changes.

**Platform-specific naming in shared tokens.** Naming a token `ios-blue` or `android-elevation` in the shared token file. Platform-specific mappings belong in the transform layer, not the token definition. The token is `color.background.brand`; the iOS-specific hex value is a build artifact.

**Verb-based component names.** `ShowDetails`, `ToggleMenu`, `LoadData`. Components are things (nouns), not actions (verbs). The action is what the component enables; the name is what it is. `ToggleMenu` should be `Menu` with an `open` state. `ShowDetails` should be `Disclosure` or `Accordion`.

**Numbered variants without meaning.** `button-1`, `button-2`, `button-3` in Figma or `CardV2`, `NewCard`, `CardFinal` in code. These names carry no information about what differs between them. If the distinction is not worth naming, it is not worth having.

### Real-World Examples

**Salesforce Lightning** maintains a naming matrix that maps every concept to four representations: Figma layer name, CSS class, design token, and documentation label. Their `SLDS` prefix (`slds-button`, `slds-card`) acts as a namespace to avoid collisions with consumer code. Component variants use BEM-like modifiers: `slds-button_brand`, `slds-button_neutral`, `slds-button_destructive`.

**IBM Carbon** uses a strict CTI (Category-Type-Item) convention across all tokens. Colors follow `$carbon--{category}-{usage}-{property}-{variant}`: `$carbon--interactive-01` (primary interactive color), `$carbon--ui-background` (page background), `$carbon--text-01` (primary text). The numbered suffix (01, 02, 03) indicates prominence hierarchy within a category.

**Shopify Polaris** aligns Figma and code naming with a published 1:1 mapping table. Their component names are plain English nouns: `Button`, `Card`, `Modal`, `Banner`, `Badge`. Variant names are adjective-like: `primary`, `critical`, `warning`, `success`. Size names use t-shirt convention without exception: `slim`, `medium`, `large` (they use `slim` instead of `small` to avoid confusion with type sizes).

**Material Design 3** prefixes all tokens with `md.sys.` (system-level) or `md.comp.` (component-level), creating an unambiguous namespace. Color roles use a `on-` prefix for foreground-on-surface pairs: `md.sys.color.primary` (surface) and `md.sys.color.on-primary` (content on that surface). This pairing convention eliminates guesswork about which text color goes on which background.

## Source

Nathan Curtis, "Naming Tokens in Design Systems" (2020). Jina Anne, "Design Tokens W3C Community Group" naming guidelines. Brad Frost, "Naming Design System Components" (2019). Ethan Marcotte, "Naming Things" (A List Apart, 2013). Salesforce Lightning Design System Naming Conventions documentation.

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
