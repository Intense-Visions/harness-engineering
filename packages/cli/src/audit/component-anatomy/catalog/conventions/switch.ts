/**
 * Switch convention — Phase 2 catalog expansion (binary form-control
 * member of the Input / Select / Switch / Checkbox / Radio family).
 *
 * Source spec (Phase 0 paper artifact):
 *   docs/changes/design-pipeline/audit-component-anatomy/phase-0-schema-spike/conventions/switch.md
 *
 * Authoritative external source:
 *   - W3C ARIA Authoring Practices Guide — `switch` pattern
 *     https://www.w3.org/WAI/ARIA/apg/patterns/switch/
 *
 * Tier-1 (required) scope for v1:
 *   `label` slot — a Switch definition that exposes no labelling
 *   affordance (no `label`, `aria-label`, or `aria-labelledby` prop) is
 *   the canonical APG violation and the second catalogued component
 *   (after Input.label) to share the `A11Y-050`/`A11Y-010` deferral path
 *   with `harness-accessibility`. The three-satisfier shape mirrors
 *   `Input.label` (ANAT-D004), `Dialog.title` (ANAT-D005), and
 *   `Select.label` (ANAT-D006) exactly — same labelling vocabulary, same
 *   prop-name check, same a11y deferral profile.
 *
 * Tier-2 / Tier-3 anatomy (helper-text / error-text slots, recommended
 * states like checked / focus / disabled, sizes) is included on the rule
 * so the registry stays the single source of truth, but the convention
 * runner does not yet emit findings for those — the ANAT-D008-D009
 * Tier-1 form-field overflow band and the ANAT-D040-D049 Tier-2
 * form-field band are reserved for follow-up tasks per finding-codes.md.
 */

import type { ConventionRule } from '../../rules/convention-rule.js';

export const switchConvention: ConventionRule = {
  componentType: 'Switch',
  slots: [
    {
      name: 'label',
      required: true,
      fixHint:
        'Add a labelling affordance. Accept a `label` prop (string), an `aria-label` prop ' +
        '(string), or an `aria-labelledby` prop (id reference). A Switch without any ' +
        'labelling affordance is the canonical APG violation — assistive technology cannot ' +
        "announce the control's purpose.",
    },
    {
      name: 'helper-text',
      required: false,
      fixHint:
        'Optional `helperText` / `description` prop or slot for instructional copy adjacent ' +
        'to the control. Should be wired to the switch via `aria-describedby` when present.',
    },
    {
      name: 'error-text',
      required: false,
      fixHint:
        'Optional `errorText` / `errorMessage` prop or slot for validation copy. Should be ' +
        'wired to the switch via `aria-describedby` (or `aria-errormessage`) and ' +
        '`aria-invalid="true"` when an error is active.',
    },
  ],
  states: [
    {
      name: 'checked',
      required: false,
      exclusive: true,
      fixHint:
        "The Switch's 'on' state. Expose via a `checked` / `isChecked` controlled prop (or " +
        '`defaultChecked` for uncontrolled use). Exclusive with `unchecked` at runtime — ' +
        'the binary contract forbids both being true simultaneously.',
    },
    {
      name: 'unchecked',
      required: false,
      exclusive: true,
      fixHint:
        "Implicit 'off' state when `checked` is false. Usually does not need its own prop — " +
        'the renderer derives it from the `checked` value.',
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
    ref: 'APG/switch',
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/switch/',
  },
};
