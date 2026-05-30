# Convention spec — Select

> Phase 0 paper artifact. Sourced from the ARIA APG `listbox` pattern and the Open UI `select` proposal. Stress-tests `ConventionRule` against a form-field component whose required anatomy mirrors `Input.label` (ANAT-D004) and `Dialog.title` (ANAT-D005) — the three-satisfier accessible-name shape recurs for the third time, which validates that the convention schema scales without per-component duplication of labelling vocabulary.

## Intent

A `Select` exposes a labelled control that lets the user pick one (or, in multi-select mode, several) values from a closed list of options. Per APG `listbox`, the **labelling affordance is non-negotiable** — a select without a `label`, `aria-label`, or `aria-labelledby` is the canonical violation: assistive technology cannot announce the field's purpose. This convention treats `label` as the only Tier-1 required slot for v1 and reserves the rest of the anatomy (helper text, error text, recommended states, variants, sizes) for follow-up tier expansion.

## ConventionRule

```yaml
componentType: Select

slots:
  - name: label
    required: true
    fixHint: |
      Add a labelling affordance. Accept a `label` prop (string), an `aria-label` prop
      (string), or an `aria-labelledby` prop (id reference). A Select without any
      labelling affordance is the canonical APG violation — assistive technology cannot
      announce the field's purpose.
  - name: helper-text
    required: false
    fixHint: |
      Optional `helperText` / `hint` prop or slot for instructional copy below the
      control. Should be wired to the select via `aria-describedby` when present.
  - name: error-text
    required: false
    fixHint: |
      Optional `errorText` / `errorMessage` prop or slot. Should be wired to the select
      via `aria-describedby` (or `aria-errormessage`) and `aria-invalid="true"` when an
      error is active.
  - name: placeholder
    required: false
    fixHint: |
      Optional `placeholder` prop rendered when no value is selected. Should not be
      used as a substitute for the `label` slot — APG explicitly warns that placeholder
      text disappears on selection and is not announced as the field's label.

states:
  - name: default
    required: false
    exclusive: false
    fixHint: |
      Default (idle, closed) render state. Usually implicit for selects — flagged only
      if the component is gated such that no unconditional render path exists.
  - name: open
    required: false
    exclusive: true
    fixHint: |
      Listbox-open state. Exposed via the `open` / `isOpen` controlled prop or an
      internal `useState` flag bound to the trigger. Exclusive with `closed` at
      runtime (a select cannot be both open and closed on the same render).
  - name: focus
    required: false
    exclusive: false
    fixHint: |
      Provide a `:focus-visible` style on the trigger. Recommended for keyboard
      navigation; promoted to required by strictness=strict.
  - name: disabled
    required: false
    exclusive: true
    fixHint: |
      Accept a `disabled` prop. When disabled, the trigger must not open the listbox
      and the styling must convey the inactive state.
  - name: invalid
    required: false
    exclusive: true
    fixHint: |
      Surface validation failure via an `invalid` / `error` prop. When invalid the
      control should set `aria-invalid="true"` and (when an error message is present)
      `aria-describedby` pointing at the message.

variants:
  - name: single
    required: false
    fixHint: |
      Default single-select mode. Usually implicit when no `multiple` prop is exposed.
  - name: multiple
    required: false
    fixHint: |
      Multi-select mode exposed via a `multiple` boolean prop. APG `listbox` requires
      `aria-multiselectable="true"` on the listbox container and per-option
      `aria-selected` semantics.

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
  ref: 'APG/listbox'
  url: 'https://www.w3.org/WAI/ARIA/apg/patterns/listbox/'
```

## Notes on schema fit

- The schema cleanly absorbs Select with no additions. The three-satisfier accessible-name shape (`label` / `aria-label` / `aria-labelledby`) is now the third repetition (Input.label, Dialog.title, Select.label) — strong evidence the existing `isSlotSatisfied` runner helper is the right abstraction; further form-control conventions (Checkbox, Radio, Switch) will inherit it once their slots land.
- `variants.multiple` represents a runtime modality (single vs. multi-select), not a stylistic variant. The schema does not encode this distinction; for v1 the audit treats it as a stylistic variant which is harmless (the runner does not yet emit findings for variants). Flag for Tier-3 variant expansion if the distinction matters at finding time.
- `states.open` carries `exclusive: true` against an implicit `closed` state, matching the Dialog convention's `open`/`closed` modelling. Runner does not yet enforce the structural exclusion — same caveat as Dialog.
- Source citation `APG/listbox` is preferred over `OpenUI/select` because APG carries the normative accessibility contract; Open UI is descriptive. This matches the Dialog choice of `APG/dialog-modal` over `OpenUI/dialog`.
