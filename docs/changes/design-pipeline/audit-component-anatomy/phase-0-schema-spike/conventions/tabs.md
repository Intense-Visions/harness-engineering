# Convention spec — Tabs (compound component)

> Phase 0 paper artifact. Stress-tests `ConventionRule` against a compound component whose anatomy is composed of multiple named child parts with structural rules (tablist owns triggers; triggers are paired with panels by id). Sourced from the ARIA APG tabs pattern and Radix Primitives `Tabs`.

## Intent

A `Tabs` compound exposes the root container, an ordered list of triggers (the tablist), and a set of panels — one panel per trigger, paired by id. Unlike Button, the anatomy is _structural_: the absence of any one part (tablist, trigger, panel) breaks the component, and the parts must coexist. This convention treats each child part as a `slot` with `required: true` so the audit flags definitions that omit any of them.

## ConventionRule

```yaml
componentType: Tabs

slots:
  - name: root
    required: true
    fixHint: 'Export a root container (`Tabs` or `Tabs.Root`) that owns the `value`/`onValueChange` state and renders an element with `role` implied via children.'
  - name: tablist
    required: true
    fixHint: 'Provide a `Tabs.List` (or equivalent) subcomponent that renders `role="tablist"` and contains the trigger children. Required by APG keyboard model.'
  - name: trigger
    required: true
    fixHint: 'Provide a `Tabs.Trigger` subcomponent that renders `role="tab"`, accepts a `value` prop, and exposes `aria-selected` + `aria-controls` automatically. At least one trigger must be representable.'
  - name: panel
    required: true
    fixHint: 'Provide a `Tabs.Panel` subcomponent that renders `role="tabpanel"`, accepts a `value` prop matching its paired trigger, and sets `aria-labelledby` to the trigger''s id. One panel per trigger.'
  - name: indicator
    required: false
    fixHint: 'Optional `Tabs.Indicator` element for visual selection underline / pill. Decorative — must be `aria-hidden`.'

states:
  - name: selected
    required: true
    exclusive: true
    fixHint: 'Exactly one trigger is `selected` at any time. Exclusivity is structural — the audit checks that the trigger surfaces `aria-selected` and that selection state is single-valued.'
  - name: focused
    required: true
    exclusive: true
    fixHint: 'Roving tabindex per APG: exactly one trigger has `tabindex=0`, the rest `-1`. Focus is exclusive across the tablist.'
  - name: disabled
    required: false
    exclusive: false
    fixHint: 'Per-trigger `disabled` prop. Not exclusive across the tablist — multiple triggers may be disabled simultaneously.'

variants:
  - name: horizontal
    required: false
    fixHint: "Default orientation. Expose via `orientation` prop on the root (`'horizontal' | 'vertical'`)."
  - name: vertical
    required: false
    fixHint: 'Expose via `orientation` prop. When vertical, ArrowUp/ArrowDown navigate triggers per APG.'

sizes:
  - name: sm
    required: false
    fixHint: 'Optional sizing token via `size` prop on the root.'
  - name: md
    required: false
    fixHint: 'Default size; usually implicit when `size` prop is absent.'
  - name: lg
    required: false
    fixHint: 'Optional sizing token via `size` prop on the root.'

source:
  ref: 'APG/tabs'
  url: 'https://www.w3.org/WAI/ARIA/apg/patterns/tabs/'
```

## Notes on schema fit

- The schema permits a compound component to be specified by treating each child sub-component as a named `slot` with `required: true`. This is the right _representation_ but the schema does not explicitly model the _pairing relationship_ between `trigger` and `panel` (one panel per trigger, matched by id). The audit can detect the slots exist but cannot detect mismatched counts without an extension. See `review.md` for the gap discussion.
- `states.selected` and `states.focused` both carry `exclusive: true`. The schema's `exclusive` flag was originally framed as "cannot combine with other states on the same instance" — here we are extending its meaning to "exactly-one across the sibling set." Reuse is reasonable but the semantics differ subtly. Flagged in `review.md`.
- `slots[]` cleanly absorbs five child parts. No structural change needed.
- `source.ref = "APG/tabs"` is sufficient for citation; the trigger/panel pairing rule is implicit in the cited spec.
