# Convention spec — Checkbox (tri-state form control)

> Phase 0 paper artifact (filed during Phase 2 catalog expansion). Sourced from the ARIA APG `checkbox` (dual-state and tri-state) patterns and the Open UI `checkbox` proposal. Stress-tests `ConventionRule` against a tri-state form-field whose required anatomy mirrors `Input.label` (ANAT-D004), `Dialog.title` (ANAT-D005), `Select.label` (ANAT-D006), and `Switch.label` (ANAT-D007) — the three-satisfier accessible-name shape recurs for the fifth time, locking the labelling vocabulary across the entire form-control family (Input / Select / Switch / Checkbox; Radio is the sixth) without per-component duplication.

## Intent

A `Checkbox` exposes a labelled control whose state represents one of two (`checked` / `unchecked`) or three (`checked` / `unchecked` / `indeterminate`) values. Per APG `checkbox`, the **labelling affordance is non-negotiable** — a checkbox without a `label`, `aria-label`, or `aria-labelledby` is the canonical violation: assistive technology cannot announce the control's purpose, so the user cannot know what the checkbox represents. Unlike Switch (a true binary toggle) and Radio (a single choice in a named group), the Checkbox is structurally tri-state — the `indeterminate` value sits orthogonal to `checked` and is exposed through the imperative DOM property `HTMLInputElement.indeterminate` (not as a boolean attribute). This convention treats `label` as the only Tier-1 required slot for v1 and reserves the rest of the anatomy (helper text, error text, recommended states including `indeterminate`, sizes) for follow-up tier expansion.

The `checked` and `indeterminate` states are the canonical Checkbox states, but their absence is structurally caught elsewhere (a Checkbox with no controlled state is broken before any audit runs) — labelling is the unique Tier-1 contribution this convention makes.

## ConventionRule

```yaml
componentType: Checkbox

slots:
  - name: label
    required: true
    fixHint: |
      Add a labelling affordance. Accept a `label` prop (string), an `aria-label` prop
      (string), or an `aria-labelledby` prop (id reference). A Checkbox without any
      labelling affordance is the canonical APG violation — assistive technology cannot
      announce the control's purpose.
  - name: helper-text
    required: false
    fixHint: |
      Optional `helperText` / `description` prop or slot for instructional copy
      adjacent to the control. Should be wired to the checkbox via `aria-describedby`
      when present.
  - name: error-text
    required: false
    fixHint: |
      Optional `errorText` / `errorMessage` prop or slot for validation copy. Common
      on Checkbox when used as a required form-acceptance gate (terms-of-service,
      consent). When present, wire via `aria-describedby` (or `aria-errormessage`)
      and set `aria-invalid="true"` on the control.

states:
  - name: checked
    required: false
    exclusive: true
    fixHint: |
      The Checkbox's "on" state. Expose via a `checked` / `isChecked` controlled prop
      (or `defaultChecked` for uncontrolled use). Exclusive with `unchecked` and
      `indeterminate` at runtime — a single Checkbox carries exactly one of the
      three values on a given render.
  - name: unchecked
    required: false
    exclusive: true
    fixHint: |
      Implicit "off" state when `checked` is false and `indeterminate` is not set.
      Usually does not need its own prop — the renderer derives it from the other
      two state inputs.
  - name: indeterminate
    required: false
    exclusive: true
    fixHint: |
      Tri-state "mixed" state, conventionally used for parent checkboxes whose
      descendants are partially selected. Expose via an `indeterminate` prop and
      assign to the underlying `HTMLInputElement.indeterminate` DOM property in a
      ref or effect (HTML has no `indeterminate` attribute — only the DOM property).
      The accessible mapping is `aria-checked="mixed"`.
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
  ref: 'APG/checkbox'
  url: 'https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/'
```

## Notes on schema fit

- The schema cleanly absorbs Checkbox with no additions. The three-satisfier accessible-name shape (`label` / `aria-label` / `aria-labelledby`) is now the fifth repetition (Input.label, Dialog.title, Select.label, Switch.label, Checkbox.label) — this is the point at which the satisfier set crosses from "recurring coincidence" to "established invariant" for form-control labelling. The remaining form-control (Radio) inherits it directly.
- `states.indeterminate` is new vocabulary — neither Switch nor Input carries it. The schema absorbs it under the existing `state.exclusive: true` flag because tri-state exclusivity is still per-instance (a Checkbox is exactly one of checked / unchecked / indeterminate on a render). The convention is intentionally not gating on `indeterminate` in v1 — the audit treats it as Tier-2 recommended and the convention runner won't emit a finding for its absence. Promotion to Tier-1 is a v1.1 decision once the broader form-control catalogue lands.
- `states.checked` carries `exclusive: true` against `unchecked` and `indeterminate`. The exclusivity is per-instance (a single Checkbox cannot be both checked and indeterminate on the same render) — matches the per-instance scope established by Switch.checked and avoids the per-sibling-set overloading Tabs introduced (review.md §Tabs).
- `variants` is empty. Checkbox has no canonical stylistic variants in APG / Open UI; brand-specific variants (primary/danger) belong to the brand audit, not the anatomy audit. Catalogued as an empty array (matching Switch / Input / Dialog) so the convention's surface stays uniform.
- Source citation `APG/checkbox` is preferred over `OpenUI/checkbox` because APG carries the normative accessibility contract; Open UI is descriptive. Matches the Input / Dialog / Select / Switch precedent of APG-over-OpenUI for normative slots.
