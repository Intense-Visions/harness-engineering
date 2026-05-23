# Convention spec — Button (simple)

> Phase 0 paper artifact. Validates that the `ConventionRule` schema (see proposal.md "Data structures") cleanly expresses a simple, single-element interactive component sourced from the ARIA Authoring Practices Guide.

## Intent

A `Button` is the canonical primary action affordance. It is a leaf-level interactive element (no compound child API), takes user-visible content (label / icon / both), exposes a small set of mutually-exclusive interaction states (default, disabled, loading), and offers visual variants (primary, secondary, ghost, danger) and sizing tokens (sm, md, lg). The convention here mirrors the ARIA APG `button` pattern, the Open UI `button` anatomy proposal, and the Radix Primitives `Button` surface.

## ConventionRule

```yaml
componentType: Button

slots:
  - name: content
    required: true
    fixHint: 'Add visible label content as children or via a `label` / `aria-label` prop. A Button without accessible content is the canonical APG violation.'
  - name: icon-leading
    required: false
    fixHint: 'Optional `iconLeading` / `startIcon` prop or slot. When present, ensure it is decorative (`aria-hidden`) if `content` is also present.'
  - name: icon-trailing
    required: false
    fixHint: 'Optional `iconTrailing` / `endIcon` prop or slot. Same decorative rules as `icon-leading`.'

states:
  - name: default
    required: true
    exclusive: false
    fixHint: 'Every Button must render a default (idle, enabled) state. Usually implicit — flagged only if all renderable states are themselves conditional.'
  - name: hover
    required: false
    exclusive: false
    fixHint: 'Provide a `:hover` style or stateful class. Optional but conventional; flagged only at strictness=strict.'
  - name: focus
    required: true
    exclusive: false
    fixHint: 'Provide a `:focus-visible` style. Required by APG keyboard-navigation contract.'
  - name: disabled
    required: false
    exclusive: true
    fixHint: 'Either accept a `disabled` prop OR provide an `aria-disabled` style hook. Exclusive with `loading` — both cannot apply simultaneously.'
  - name: loading
    required: false
    exclusive: true
    fixHint: 'Accept a `loading` / `isPending` prop and disable activation while pending. Exclusive with `disabled`.'

variants:
  - name: primary
    required: false
    fixHint: 'Convention: at least one of {primary, secondary, ghost, danger} should be representable via a `variant` prop or class hook.'
  - name: secondary
    required: false
    fixHint: 'Provide via the `variant` prop.'
  - name: ghost
    required: false
    fixHint: 'Provide via the `variant` prop. Common in design systems with surface-aware buttons.'
  - name: danger
    required: false
    fixHint: 'Provide via the `variant` prop. Carries semantic weight — `aria-describedby` recommended for destructive actions.'

sizes:
  - name: sm
    required: false
    fixHint: 'Provide via a `size` prop with a token (sm/md/lg) — do not encode size by `className`-only convention.'
  - name: md
    required: false
    fixHint: 'Default size; usually implicit when `size` prop is absent.'
  - name: lg
    required: false
    fixHint: 'Provide via the `size` prop.'

source:
  ref: 'APG/button'
  url: 'https://www.w3.org/WAI/ARIA/apg/patterns/button/'
```

## Notes on schema fit

- The schema's `AnatomyPart` shape (`name`, `required`, `exclusive`, `fixHint`) absorbs the entire Button surface with no extension.
- `exclusive: true` correctly captures the disabled/loading mutual exclusion.
- The `slots[]` / `states[]` / `variants[]` / `sizes[]` arrays cleanly partition the four orthogonal axes of variation. No overlap or ambiguity.
- `source.ref = "APG/button"` is a stable citation key the catalog can dereference.
