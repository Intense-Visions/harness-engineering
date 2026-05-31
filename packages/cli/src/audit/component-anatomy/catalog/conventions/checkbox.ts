/**
 * Checkbox convention — Phase 2 catalog expansion (tri-state form-control
 * member of the Input / Select / Switch / Checkbox / Radio family).
 *
 * Source spec (Phase 0 paper artifact):
 *   docs/changes/design-pipeline/audit-component-anatomy/phase-0-schema-spike/conventions/checkbox.md
 *
 * Authoritative external source:
 *   - W3C ARIA Authoring Practices Guide — `checkbox` pattern
 *     https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/
 *
 * Tier-1 (required) scope for v1:
 *   `label` slot — a Checkbox definition that exposes no labelling
 *   affordance (no `label`, `aria-label`, or `aria-labelledby` prop) is
 *   the canonical APG violation and the fifth catalogued component to
 *   share the `A11Y-050` / `A11Y-010` deferral path with
 *   `harness-accessibility`. The three-satisfier shape mirrors
 *   `Input.label` (ANAT-D004), `Dialog.title` (ANAT-D005),
 *   `Select.label` (ANAT-D006), and `Switch.label` (ANAT-D007) exactly —
 *   same labelling vocabulary, same prop-name check, same a11y deferral
 *   profile. This is the fifth repetition: the satisfier set is now an
 *   established invariant for the form-control family.
 *
 * Tier-2 / Tier-3 anatomy (helper-text / error-text slots, recommended
 * states like checked / unchecked / indeterminate / focus / disabled,
 * sizes) is included on the rule so the registry stays the single source
 * of truth, but the convention runner does not yet emit findings for
 * those — the ANAT-D009 Tier-1 form-field overflow slot (Radio) and the
 * ANAT-D040-D049 Tier-2 form-field band are reserved for follow-up tasks
 * per finding-codes.md.
 *
 * The `indeterminate` state vocabulary is new to the form-control family
 * (neither Switch nor Input carries it). It is intentionally Tier-2 in
 * v1 — the convention runner does not gate on its presence. Promotion
 * to Tier-1 is a v1.1 decision per the Phase 0 spike notes.
 */

import type { ConventionRule } from '../../rules/convention-rule.js';

export const checkboxConvention: ConventionRule = {
  componentType: 'Checkbox',
  slots: [
    {
      name: 'label',
      required: true,
      fixHint:
        'Add a labelling affordance. Accept a `label` prop (string), an `aria-label` prop ' +
        '(string), or an `aria-labelledby` prop (id reference). A Checkbox without any ' +
        'labelling affordance is the canonical APG violation — assistive technology cannot ' +
        "announce the control's purpose.",
    },
    {
      name: 'helper-text',
      required: false,
      fixHint:
        'Optional `helperText` / `description` prop or slot for instructional copy adjacent ' +
        'to the control. Should be wired to the checkbox via `aria-describedby` when present.',
    },
    {
      name: 'error-text',
      required: false,
      fixHint:
        'Optional `errorText` / `errorMessage` prop or slot for validation copy. Common on ' +
        'Checkbox when used as a required form-acceptance gate (terms-of-service, consent). ' +
        'Wire via `aria-describedby` (or `aria-errormessage`) and set `aria-invalid="true"` ' +
        'when an error is active.',
    },
  ],
  states: [
    {
      name: 'checked',
      required: false,
      exclusive: true,
      fixHint:
        "The Checkbox's 'on' state. Expose via a `checked` / `isChecked` controlled prop " +
        '(or `defaultChecked` for uncontrolled use). Exclusive with `unchecked` and ' +
        '`indeterminate` at runtime — a single Checkbox carries exactly one of the three ' +
        'values on a given render.',
    },
    {
      name: 'unchecked',
      required: false,
      exclusive: true,
      fixHint:
        "Implicit 'off' state when `checked` is false and `indeterminate` is not set. " +
        'Usually does not need its own prop — the renderer derives it from the other two ' +
        'state inputs.',
    },
    {
      name: 'indeterminate',
      required: false,
      exclusive: true,
      fixHint:
        "Tri-state 'mixed' state, conventionally used for parent checkboxes whose " +
        'descendants are partially selected. Expose via an `indeterminate` prop and assign ' +
        'to the underlying `HTMLInputElement.indeterminate` DOM property in a ref or ' +
        'effect (HTML has no `indeterminate` attribute — only the DOM property). The ' +
        'accessible mapping is `aria-checked="mixed"`.',
    },
    {
      name: 'focus',
      required: false,
      exclusive: false,
      fixHint:
        'Provide a `:focus-visible` style on the control. Recommended for keyboard ' +
        'navigation; promoted to required by strictness=strict.',
    },
    {
      name: 'disabled',
      required: false,
      exclusive: true,
      fixHint:
        'Accept a `disabled` prop. When disabled, the control must not change state on ' +
        'activation and the styling must convey the inactive state.',
    },
  ],
  variants: [],
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
    ref: 'APG/checkbox',
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/',
  },
};
