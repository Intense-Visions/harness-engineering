/**
 * EmptyState convention — Phase 2 catalog expansion (component #3 of 20).
 *
 * Source spec (Phase 0 paper artifact):
 *   docs/changes/design-pipeline/audit-component-anatomy/phase-0-schema-spike/conventions/empty-state.md
 *
 * Authoritative external source (per Phase 0 review):
 *   - Open UI — empty-state research entry
 *     https://open-ui.org/components/empty-state.research/
 *
 * APG does not catalog EmptyState (it is not an interactive ARIA pattern),
 * so Open UI is the most authoritative public reference per the source
 * hierarchy in Decision #5.
 *
 * Tier-1 (required) scope for v1:
 *   `headline` slot — an EmptyState definition that exposes no headline
 *   affordance (no `title` prop, no `headline` prop, no children typed
 *   as the headline) cannot communicate its purpose. An EmptyState
 *   without a message is indistinguishable from a layout bug — this is
 *   the canonical Open-UI violation and the ANAT-D020 finding code.
 *
 * EmptyState is the canonical empty-data affordance: shown when a list,
 * table, search result, or dashboard has nothing to render. As a
 * component, it has its own anatomy (icon, headline, description, primary
 * action, secondary action). The schema fits cleanly — see Phase 0
 * review.md §EmptyState for the cross-reference with pattern findings
 * (ANAT-P001 et al.) that name EmptyState as their fix target.
 *
 * Tier-2 / Tier-3 anatomy (description, primary/secondary action,
 * default state, variants like zero-data/no-results/error, and sizes)
 * is included on the rule so the registry stays the single source of
 * truth, but the convention runner does not yet emit findings for those
 * — the D021-D029 Tier-1 overflow band and the D030+ Tier-2 bucket are
 * reserved for follow-up tasks per finding-codes.md.
 */

import type { ConventionRule } from '../../rules/convention-rule.js';

export const emptyStateConvention: ConventionRule = {
  componentType: 'EmptyState',
  slots: [
    {
      name: 'icon',
      required: false,
      fixHint:
        'Optional decorative icon (`aria-hidden`). Conventional — Open UI proposal lists it ' +
        'as part of the canonical EmptyState anatomy.',
    },
    {
      name: 'headline',
      required: true,
      fixHint:
        'Required short message (one sentence) explaining the empty condition. Accept as a ' +
        '`title` / `headline` prop (string) or as the first text child. Without a headline ' +
        'the component cannot communicate its purpose — an EmptyState without a message is ' +
        'indistinguishable from a layout bug.',
    },
    {
      name: 'description',
      required: false,
      fixHint:
        'Optional longer message giving context or next-step guidance. Accept as ' +
        '`description` prop or as additional text children.',
    },
    {
      name: 'primary-action',
      required: false,
      fixHint:
        "Optional CTA (e.g., 'Create your first project'). Accept as `action` prop or as a " +
        '`<Button>` child slot. Strongly recommended when the empty state is recoverable.',
    },
    {
      name: 'secondary-action',
      required: false,
      fixHint:
        "Optional secondary CTA (e.g., 'Import from CSV'). Same prop/slot shape as " +
        '`primary-action`.',
    },
  ],
  states: [
    {
      name: 'default',
      required: true,
      exclusive: false,
      fixHint:
        'EmptyState renders one visual state. Required-by-default; flagged only if the ' +
        'component conditionally returns null on its own props. ANAT-D021 covers this case ' +
        'once the runner extends to control-flow analysis.',
    },
  ],
  variants: [
    {
      name: 'zero-data',
      required: false,
      fixHint:
        "Variant for 'no items have ever existed' (e.g., empty inbox on day one). Expose via " +
        '`variant` prop. The headline/icon usually skew encouraging.',
    },
    {
      name: 'no-results',
      required: false,
      fixHint:
        "Variant for 'filter or search returned nothing' (data exists but is filtered out). " +
        'Expose via `variant` prop. The action usually offers to clear filters.',
    },
    {
      name: 'error',
      required: false,
      fixHint:
        "Variant for 'failed to load.' Often a separate component, but EmptyState may " +
        'absorb it; expose via `variant` prop and ensure the icon/headline communicate ' +
        'failure rather than emptiness.',
    },
  ],
  sizes: [
    {
      name: 'sm',
      required: false,
      fixHint:
        'Optional sizing token via `size` prop — used when EmptyState appears inside a ' +
        'small panel rather than as a full-page state.',
    },
    {
      name: 'md',
      required: false,
      fixHint: 'Default size; usually implicit when `size` prop is absent.',
    },
    {
      name: 'lg',
      required: false,
      fixHint:
        'Full-page empty state; usually implicit when EmptyState is the only child of the ' +
        'route container.',
    },
  ],
  source: {
    ref: 'OpenUI/empty-state',
    url: 'https://open-ui.org/components/empty-state.research/',
  },
};
