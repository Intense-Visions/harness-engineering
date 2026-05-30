/**
 * Select convention — Phase 2 catalog expansion (component #5 of 20).
 *
 * Source spec (Phase 0 paper artifact):
 *   docs/changes/design-pipeline/audit-component-anatomy/phase-0-schema-spike/conventions/select.md
 *
 * Authoritative external source:
 *   - W3C ARIA Authoring Practices Guide — `listbox` pattern
 *     https://www.w3.org/WAI/ARIA/apg/patterns/listbox/
 *
 * Tier-1 (required) scope for v1:
 *   `label` slot — a Select definition that exposes no labelling
 *   affordance (no `label`, `aria-label`, or `aria-labelledby` prop) is
 *   the canonical APG violation. Same three-satisfier shape as
 *   `Input.label` (ANAT-D004) and `Dialog.title` (ANAT-D005). Select
 *   joins the `A11Y-050` deferral path with `harness-accessibility`.
 *
 * Tier-2 / Tier-3 anatomy (helper-text / error-text / placeholder slots,
 * `open` / `disabled` / `invalid` / `focus` states, `single` / `multiple`
 * variants, and sizes) is included on the rule so the registry stays the
 * single source of truth, but the convention runner does not yet emit
 * findings for those — the D007–D009 Tier-1 overflow band and the
 * D040–D049 Tier-2 form-field band are reserved for follow-up tasks per
 * finding-codes.md.
 */

import type { ConventionRule } from '../../rules/convention-rule.js';

export const selectConvention: ConventionRule = {
  componentType: 'Select',
  slots: [
    {
      name: 'label',
      required: true,
      fixHint:
        'Add a labelling affordance. Accept a `label` prop (string), an `aria-label` prop ' +
        '(string), or an `aria-labelledby` prop (id reference). A Select without any ' +
        'labelling affordance is the canonical APG violation — assistive technology cannot ' +
        "announce the field's purpose.",
    },
    {
      name: 'helper-text',
      required: false,
      fixHint:
        'Optional `helperText` / `hint` prop or slot for instructional copy below the ' +
        'control. Should be wired to the select via `aria-describedby` when present.',
    },
    {
      name: 'error-text',
      required: false,
      fixHint:
        'Optional `errorText` / `errorMessage` prop or slot. Should be wired to the select ' +
        'via `aria-describedby` (or `aria-errormessage`) and `aria-invalid="true"` when ' +
        'an error is active.',
    },
    {
      name: 'placeholder',
      required: false,
      fixHint:
        'Optional `placeholder` prop rendered when no value is selected. Should not be ' +
        'used as a substitute for the `label` slot — APG explicitly warns that placeholder ' +
        "text disappears on selection and is not announced as the field's label.",
    },
  ],
  states: [
    {
      name: 'default',
      required: false,
      exclusive: false,
      fixHint:
        'Default (idle, closed) render state. Usually implicit for selects — flagged only ' +
        'if the component is gated such that no unconditional render path exists.',
    },
    {
      name: 'open',
      required: false,
      exclusive: true,
      fixHint:
        'Listbox-open state. Exposed via the `open` / `isOpen` controlled prop or an ' +
        'internal `useState` flag bound to the trigger. Exclusive with `closed` at ' +
        'runtime (a select cannot be both open and closed on the same render).',
    },
    {
      name: 'focus',
      required: false,
      exclusive: false,
      fixHint:
        'Provide a `:focus-visible` style on the trigger. Recommended for keyboard ' +
        'navigation; promoted to required by strictness=strict.',
    },
    {
      name: 'disabled',
      required: false,
      exclusive: true,
      fixHint:
        'Accept a `disabled` prop. When disabled, the trigger must not open the listbox ' +
        'and the styling must convey the inactive state.',
    },
    {
      name: 'invalid',
      required: false,
      exclusive: true,
      fixHint:
        'Surface validation failure via an `invalid` / `error` prop. When invalid the ' +
        'control should set `aria-invalid="true"` and (when an error message is present) ' +
        '`aria-describedby` pointing at the message.',
    },
  ],
  variants: [
    {
      name: 'single',
      required: false,
      fixHint: 'Default single-select mode. Usually implicit when no `multiple` prop is exposed.',
    },
    {
      name: 'multiple',
      required: false,
      fixHint:
        'Multi-select mode exposed via a `multiple` boolean prop. APG `listbox` requires ' +
        '`aria-multiselectable="true"` on the listbox container and per-option ' +
        '`aria-selected` semantics.',
    },
  ],
  sizes: [
    {
      name: 'sm',
      required: false,
      fixHint:
        'Provide via a `size` prop with a token (sm/md/lg). Do not encode size by ' +
        '`className`-only convention.',
    },
    {
      name: 'md',
      required: false,
      fixHint: 'Default size; usually implicit when `size` prop is absent.',
    },
    {
      name: 'lg',
      required: false,
      fixHint: 'Provide via the `size` prop.',
    },
  ],
  source: {
    ref: 'APG/listbox',
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/listbox/',
  },
};
