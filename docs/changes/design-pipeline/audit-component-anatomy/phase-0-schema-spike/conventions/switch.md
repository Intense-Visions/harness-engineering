# Convention spec — Switch (binary form control)

> Phase 0 paper artifact (filed during Phase 2 catalog expansion). Sourced from the ARIA APG `switch` pattern and the Open UI `switch` proposal. Stress-tests `ConventionRule` against a binary form-field whose required anatomy mirrors `Input.label` (ANAT-D004), `Dialog.title` (ANAT-D005), and `Select.label` (ANAT-D006) — the three-satisfier accessible-name shape recurs for the fourth time, confirming the convention schema scales to the broader form-control family (Switch / Checkbox / Radio) without per-component duplication of labelling vocabulary.

## Intent

A `Switch` exposes a labelled binary control whose two states represent "on" and "off". Per APG `switch`, the **labelling affordance is non-negotiable** — a switch without a `label`, `aria-label`, or `aria-labelledby` is the canonical violation: assistive technology cannot announce the control's purpose. Unlike Checkbox (a tri-state form control) and Radio (a single choice in a named group), the Switch is a true binary toggle and the APG mandate is identical: the control MUST be programmatically named. This convention treats `label` as the only Tier-1 required slot for v1 and reserves the rest of the anatomy (helper text, error text, recommended states, sizes) for follow-up tier expansion.

The `checked` state is the canonical Switch state, but its absence is structurally caught by other tools (a Switch with no controlled state is broken before any audit runs) — labelling is the unique Tier-1 contribution this convention makes.

## ConventionRule

```yaml
componentType: Switch

slots:
  - name: label
    required: true
    fixHint: |
      Add a labelling affordance. Accept a `label` prop (string), an `aria-label` prop
      (string), or an `aria-labelledby` prop (id reference). A Switch without any
      labelling affordance is the canonical APG violation — assistive technology cannot
      announce the control's purpose.
  - name: helper-text
    required: false
    fixHint: |
      Optional `helperText` / `description` prop or slot for instructional copy
      adjacent to the control. Should be wired to the switch via `aria-describedby`
      when present.
  - name: error-text
    required: false
    fixHint: |
      Optional `errorText` / `errorMessage` prop or slot for validation copy. Less
      common on Switch than on Input/Select (a binary toggle rarely has free-form
      validation), but supported for forms that surface server-side validation
      errors against a Switch. When present, wire via `aria-describedby` (or
      `aria-errormessage`) and set `aria-invalid="true"` on the control.

states:
  - name: checked
    required: false
    exclusive: true
    fixHint: |
      The Switch's "on" state. Expose via a `checked` / `isChecked` controlled prop
      (or `defaultChecked` for uncontrolled use). Exclusive with `unchecked` at
      runtime — the binary contract forbids both being true simultaneously.
  - name: unchecked
    required: false
    exclusive: true
    fixHint: |
      Implicit "off" state when `checked` is false. Usually does not need its own
      prop — the renderer derives it from the `checked` value.
  - name: focus
    required: false
    exclusive: false
    fixHint: |
      Provide a `:focus-visible` style on the control. Recommended for keyboard
      navigation; promoted to required by strictness=strict.
  - name: disabled
    required: false
    exclusive: true
    fixHint: |
      Accept a `disabled` prop. When disabled, the control must not change state on
      activation and the styling must convey the inactive state.

variants: []

sizes:
  - name: sm
    required: false
    fixHint: |
      Provide via a `size` prop with a token (sm/md/lg). Do not encode size by
      `className`-only convention.
  - name: md
    required: false
    fixHint: |
      Default size; usually implicit when `size` prop is absent.
  - name: lg
    required: false
    fixHint: |
      Provide via the `size` prop.

source:
  ref: 'APG/switch'
  url: 'https://www.w3.org/WAI/ARIA/apg/patterns/switch/'
```

## Notes on schema fit

- The schema cleanly absorbs Switch with no additions. The three-satisfier accessible-name shape (`label` / `aria-label` / `aria-labelledby`) is now the fourth repetition (Input.label, Dialog.title, Select.label, Switch.label) — strong evidence the `isSlotSatisfied` runner helper is the right abstraction. The remaining binary/multi-choice form controls (Checkbox, Radio) will inherit the same satisfier set once their conventions land.
- `states.checked` carries `exclusive: true` against the implicit `unchecked` state. The exclusivity is per-instance (a single Switch cannot be both checked and unchecked on the same render) — matches the original `exclusive` semantic without the per-sibling-set overloading that Tabs introduced (review.md §Tabs). Radio, when it lands, will reuse the per-sibling-set scope (exactly one Radio in a group is checked) — the schema accommodates both via the same flag, with scope inferred from the component family.
- `variants` is empty. Switch has no canonical stylistic variants in APG / Open UI; some libraries layer "primary/danger" on top, but those belong to the brand audit, not the anatomy audit. Catalogued as an empty array rather than omitted so the convention's surface stays uniform with Input / Dialog / Select.
- Source citation `APG/switch` is preferred over `OpenUI/switch` because APG carries the normative accessibility contract; Open UI is descriptive. This matches the Input / Dialog / Select choices of APG-over-OpenUI for normative slots.
