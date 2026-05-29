/**
 * Dialog convention — Phase 2 catalog expansion (component #4 of 20).
 *
 * Source spec (Phase 0 paper artifact):
 *   docs/changes/design-pipeline/audit-component-anatomy/phase-0-schema-spike/conventions/dialog.md
 *
 * Authoritative external source:
 *   - W3C ARIA Authoring Practices Guide — `dialog (modal)` pattern
 *     https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
 *
 * Tier-1 (required) scope for v1:
 *   `title` slot — a Dialog definition that exposes no accessible-name
 *   affordance (no `title`, `aria-label`, or `aria-labelledby` prop) is
 *   the canonical APG violation and the primary overlap point with
 *   `harness-accessibility` A11Y-010 (which defers to ANAT-D005 when the
 *   deferral pattern is active). The three-satisfier shape mirrors
 *   `Input.label` (ANAT-D004) exactly — same labelling vocabulary, same
 *   prop-name check, same a11y deferral profile.
 *
 * Tier-2 / Tier-3 anatomy (description / close-action / footer slots,
 * `open` / `closed` states, `alert` / `standard` variants, and sizes)
 * is included on the rule so the registry stays the single source of
 * truth, but the convention runner does not yet emit findings for those
 * — the D006-D009 Tier-1 overflow band and the D030+ Tier-2 bucket are
 * reserved for follow-up tasks per finding-codes.md.
 */

import type { ConventionRule } from '../../rules/convention-rule.js';

export const dialogConvention: ConventionRule = {
  componentType: 'Dialog',
  slots: [
    {
      name: 'title',
      required: true,
      fixHint:
        'Add an accessible-name affordance. Accept a `title` prop (string), an `aria-label` ' +
        'prop (string), or an `aria-labelledby` prop (id reference). A Dialog without an ' +
        'accessible name is the canonical APG violation — screen readers announce it as an ' +
        'unnamed modal on open.',
    },
    {
      name: 'description',
      required: false,
      fixHint:
        'Optional `description` / `aria-describedby` surface for the supporting copy below ' +
        'the title. When present, wire to the dialog via `aria-describedby`.',
    },
    {
      name: 'close-action',
      required: false,
      fixHint:
        'Optional explicit close affordance (`Dialog.Close`, `closeButton`, or a passed-in ' +
        'callback). Strongly recommended — APG requires Escape close anyway, but a visible ' +
        'button is the ergonomic default.',
    },
    {
      name: 'footer',
      required: false,
      fixHint:
        'Optional action region for primary/secondary CTAs. Accept as `footer` prop or as a ' +
        '`Dialog.Footer` child slot. APG does not mandate footer placement, but the Tier-2 ' +
        'anatomy entry tracks it for catalog completeness.',
    },
  ],
  states: [
    {
      name: 'open',
      required: true,
      exclusive: true,
      fixHint:
        'A Dialog must expose an `open` / `isOpen` controlled state (boolean) — APG requires ' +
        'the modal lifecycle to be observable by the consumer. Exclusive with `closed` at ' +
        'runtime (a dialog cannot be both open and closed on the same render).',
    },
    {
      name: 'closed',
      required: false,
      exclusive: true,
      fixHint:
        'Implicit closed state when `open` is false. Usually does not need its own prop — ' +
        'the runner verifies the conditional render branch exists.',
    },
  ],
  variants: [
    {
      name: 'alert',
      required: false,
      fixHint:
        'Variant for confirmation / destructive prompts. APG `alertdialog` pattern: expose ' +
        'via a `variant` or `role="alertdialog"` switch. The alert variant constrains the ' +
        'footer to a destructive CTA + cancel pair.',
    },
    {
      name: 'standard',
      required: false,
      fixHint: 'Default variant. Usually implicit when `variant` prop is absent.',
    },
  ],
  sizes: [
    {
      name: 'sm',
      required: false,
      fixHint: 'Optional sizing token via `size` prop — used for compact confirmation dialogs.',
    },
    {
      name: 'md',
      required: false,
      fixHint: 'Default size; usually implicit when `size` prop is absent.',
    },
    {
      name: 'lg',
      required: false,
      fixHint: 'Optional sizing token via `size` prop — used for full-page form dialogs.',
    },
  ],
  source: {
    ref: 'APG/dialog-modal',
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/',
  },
};
