/**
 * Button convention — port of the Phase 0 schema-spike paper spec.
 *
 * Source spec (paper artifact):
 *   docs/changes/design-pipeline/audit-component-anatomy/phase-0-schema-spike/conventions/button.md
 *
 * Authoritative external sources (per Phase 0 review § Button — clean fit):
 *   - W3C ARIA Authoring Practices Guide — `button` pattern
 *     https://www.w3.org/WAI/ARIA/apg/patterns/button/
 *   - Open UI — `button` anatomy proposal
 *   - Radix Primitives — Button surface
 *
 * Phase 1 vertical-slice scope (proposal.md "Implementation Order"):
 *   This is the ONE convention exercised end-to-end through the parser,
 *   resolver, runner, and MCP tool. The remaining 19 conventions land
 *   in Phase 2 catalog expansion.
 */

import type { ConventionRule } from '../../rules/convention-rule.js';

export const buttonConvention: ConventionRule = {
  componentType: 'Button',
  slots: [
    {
      name: 'content',
      required: true,
      fixHint:
        'Add visible label content as children or via a `label` / `aria-label` prop. ' +
        'A Button without accessible content is the canonical APG violation.',
    },
    {
      name: 'icon-leading',
      required: false,
      fixHint:
        'Optional `iconLeading` / `startIcon` prop or slot. When present, ensure it is ' +
        'decorative (`aria-hidden`) if `content` is also present.',
    },
    {
      name: 'icon-trailing',
      required: false,
      fixHint:
        'Optional `iconTrailing` / `endIcon` prop or slot. Same decorative rules as ' +
        '`icon-leading`.',
    },
  ],
  states: [
    {
      name: 'default',
      required: true,
      exclusive: false,
      fixHint:
        'Every Button must render a default (idle, enabled) state. Usually implicit — ' +
        'flagged only if all renderable states are themselves conditional.',
    },
    {
      name: 'hover',
      required: false,
      exclusive: false,
      fixHint:
        'Provide a `:hover` style or stateful class. Optional but conventional; flagged ' +
        'only at strictness=strict.',
    },
    {
      name: 'focus',
      required: true,
      exclusive: false,
      fixHint: 'Provide a `:focus-visible` style. Required by APG keyboard-navigation contract.',
    },
    {
      name: 'disabled',
      required: false,
      exclusive: true,
      fixHint:
        'Either accept a `disabled` prop OR provide an `aria-disabled` style hook. ' +
        'Exclusive with `loading` — both cannot apply simultaneously.',
    },
    {
      name: 'loading',
      required: false,
      exclusive: true,
      fixHint:
        'Accept a `loading` / `isPending` prop and disable activation while pending. ' +
        'Exclusive with `disabled`.',
    },
  ],
  variants: [
    {
      name: 'primary',
      required: false,
      fixHint:
        'Convention: at least one of {primary, secondary, ghost, danger} should be ' +
        'representable via a `variant` prop or class hook.',
    },
    {
      name: 'secondary',
      required: false,
      fixHint: 'Provide via the `variant` prop.',
    },
    {
      name: 'ghost',
      required: false,
      fixHint:
        'Provide via the `variant` prop. Common in design systems with surface-aware buttons.',
    },
    {
      name: 'danger',
      required: false,
      fixHint:
        'Provide via the `variant` prop. Carries semantic weight — `aria-describedby` ' +
        'recommended for destructive actions.',
    },
  ],
  sizes: [
    {
      name: 'sm',
      required: false,
      fixHint:
        'Provide via a `size` prop with a token (sm/md/lg) — do not encode size by ' +
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
    ref: 'APG/button',
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/button/',
  },
};
