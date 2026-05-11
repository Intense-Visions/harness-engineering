/**
 * Shared configuration for the Phase 7 conflict-row pulse UX.
 *
 * The pulse appears on the contested FeatureRow when a TRACKER_CONFLICT toast
 * is shown: a 2s outline animation (`@keyframes harness-conflict-pulse` in
 * `packages/dashboard/src/client/index.css`) plus a timed
 * `data-conflict-highlight` attribute toggle in
 * `packages/dashboard/src/client/utils/scrollToFeatureRow.ts`.
 *
 * The TS side and the CSS side MUST agree on the duration so the attribute
 * is removed at the same time the animation completes. CSS cannot import
 * from TS at runtime; the two values are coupled by convention.
 *
 * If you change `CONFLICT_PULSE_MS`, you MUST also update the
 * `@keyframes harness-conflict-pulse` duration and the matching
 * `prefers-reduced-motion` block in
 * `packages/dashboard/src/client/index.css` to match (both currently `2s`).
 * The outline color in `CONFLICT_PULSE_OUTLINE_COLOR` mirrors the CSS
 * `rgb(251 191 36 / 0.9)` and is exported for any future TS-driven inline
 * style or SVG variant that needs to match the CSS rule.
 */
export const CONFLICT_PULSE_MS = 2000;

export const CONFLICT_PULSE_OUTLINE_COLOR = 'rgb(251 191 36 / 0.9)';
