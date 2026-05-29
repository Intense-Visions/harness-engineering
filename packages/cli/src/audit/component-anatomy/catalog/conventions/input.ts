/**
 * Input convention — Phase 2 catalog expansion (component #2 of 20).
 *
 * Anatomy sourced from:
 *   - ARIA Authoring Practices Guide — text-input form patterns
 *     https://www.w3.org/WAI/ARIA/apg/patterns/
 *   - Open UI — `input` anatomy notes
 *   - design-component-anatomy knowledge skill — the form-field
 *     headline / helper-text / error-text trio of Tier-2 recommended
 *     slots is sourced here (the APG entry covers only labelling).
 *
 * Tier-1 (required) scope for v1:
 *   `label` slot — an Input definition that exposes no labelling
 *   affordance (no `label`, `aria-label`, or `aria-labelledby` prop)
 *   is the canonical APG violation and the primary overlap point with
 *   `harness-accessibility` A11Y-050 (which defers to ANAT-D004 when
 *   the deferral pattern is active).
 *
 * Tier-2 / Tier-3 anatomy (helper-text, error-text, recommended states
 * like focus / disabled / loading, variants, sizes) is included on the
 * rule so the registry stays the single source of truth, but the
 * convention runner does not yet emit findings for those — the
 * D040-D049 Tier-2 band is reserved for follow-up tasks per
 * finding-codes.md § Tier-2 bucket allocation.
 */

import type { ConventionRule } from '../../rules/convention-rule.js';

export const inputConvention: ConventionRule = {
  componentType: 'Input',
  slots: [
    {
      name: 'label',
      required: true,
      fixHint:
        'Add a labelling affordance. Accept a `label` prop (string), an `aria-label` prop ' +
        '(string), or an `aria-labelledby` prop (id reference). An Input without any ' +
        'labelling affordance is the canonical APG violation — assistive technology cannot ' +
        "announce the field's purpose.",
    },
    {
      name: 'helper-text',
      required: false,
      fixHint:
        'Optional `helperText` / `hint` prop or slot for instructional copy below the ' +
        'control. Should be wired to the input via `aria-describedby` when present.',
    },
    {
      name: 'error-text',
      required: false,
      fixHint:
        'Optional `errorText` / `errorMessage` prop or slot. Should be wired to the input ' +
        'via `aria-describedby` (or `aria-errormessage`) and `aria-invalid="true"` when ' +
        'an error is active.',
    },
  ],
  states: [
    {
      name: 'default',
      required: false,
      exclusive: false,
      fixHint:
        'Default (idle) render state. Usually implicit for inputs — flagged only if the ' +
        'component is gated such that no unconditional render path exists.',
    },
    {
      name: 'focus',
      required: false,
      exclusive: false,
      fixHint:
        'Provide a `:focus-visible` style. Recommended for keyboard navigation; promoted ' +
        'to required by strictness=strict.',
    },
    {
      name: 'disabled',
      required: false,
      exclusive: true,
      fixHint:
        'Accept a `disabled` prop. When disabled, the underlying control must not be ' +
        'interactive and the styling must convey the inactive state.',
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
    {
      name: 'loading',
      required: false,
      exclusive: true,
      fixHint:
        'Optional `loading` / `isPending` state for async-validated inputs. Should disable ' +
        'submission until the async check resolves.',
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
    ref: 'APG/textbox',
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/',
  },
};
