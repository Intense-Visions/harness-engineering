// packages/cli/src/design-craft/catalog/exemplars/linear-empty-list.ts
//
// First Phase 2 catalog exemplar — ported from the Phase 0 paper spike:
//   docs/changes/design-pipeline/design-craft-elevator/phase-0-schema-spike/
//   exemplars/linear-empty-list.md
//
// Anchors the EmptyState component type for BENCHMARK scoring. The exemplar
// carries `radarReference` scores (5-dim radar baseline) so BENCHMARK can
// compute proximity-to-exemplar deltas.
//
// Honors ADR 0020 (living catalog H pattern): provenance + contributors +
// versioning are required so usage signal + growth work.

import type { Confidence } from '../../findings/schema.js';
import type { CatalogStatus, CatalogSource } from '../rubrics/hierarchy-clarity.js';

/**
 * Reference 5-dim radar score for the exemplar. BENCHMARK uses these as
 * the comparison baseline — a target component's radar is scored against
 * the exemplar's, with `gaps` narrating where the target falls short.
 *
 * Scores are 0–100 per the spec section "Data structures". Authoring
 * guidance: an exemplar should rarely score below 70 on its principal
 * dimensions; if it does, it probably should not be an exemplar.
 */
export interface RadarReference {
  philosophicalCoherence: number;
  hierarchy: number;
  craftExecution: number;
  function: number;
  innovation: number;
}

/**
 * Component-type taxonomy. Phase 1 covers five canonical types per the
 * spec's "10 exemplars per type × 5 types = 50 exemplars" plan, but the
 * type is intentionally widened to `string` so callers can introduce new
 * types (Toast, Banner, Card, ...) without a schema bump. The canonical
 * five are listed below for discoverability.
 *
 * Canonical types: EmptyState | LoadingState | ErrorState | Modal | Button
 *
 * Page-scoped types (marketing tier, ADR 0082): MarketingPage — a whole
 * marketing/demo page scored against page-level exemplars and the
 * page-scoped rubrics (CRAFT-C011..C013) rather than component polish.
 */
export type ComponentType = string;

export interface ExemplarDefinition {
  id: string;
  name: string;
  componentType: ComponentType;
  version: number;
  status: CatalogStatus;
  url: string;
  authoredAt: string;
  contributors: string[];
  source: CatalogSource;
  /** Why this exemplar represents the bar — anchor for BENCHMARK narrative. */
  whyExemplar: string;
  /** Reference 5-dim radar scores. BENCHMARK targets are compared against these. */
  radarReference: RadarReference;
  /**
   * Per-rubric LLM-friendly critique notes. The BENCHMARK phase forwards
   * these into the prompt so the LLM can compare structurally rather than
   * from scratch.
   */
  critique: string;
  /** Incremented at run-time by measurement/usage.ts when cited (ADR 0020). */
  citationCount: number;
}

export const linearEmptyListExemplar: ExemplarDefinition = {
  id: 'exemplar-linear-empty-list',
  name: 'Linear Empty List State',
  componentType: 'EmptyState',
  version: 1,
  status: 'stable',
  url: 'https://linear.app/method',
  authoredAt: '2026-05-23',
  contributors: ['@chadjw'],
  source: {
    ref: 'linear-app',
    url: 'https://linear.app/method',
  },
  critique: [
    'Hierarchy: concise verb-led heading ("Inbox zero" / "No active issues")',
    'reads first; eye then drops to a single sentence of body guidance,',
    'then to a single primary CTA. No competing for attention.',
    'Typography: tight pairing — heading set in display weight, body in',
    'reading weight, generous leading on the body line. Tracked tight on',
    'the heading.',
    'Visual: subtle monochromatic line illustration sits left or above the',
    "text, matching Linear's overall monochromatic aesthetic. The",
    'illustration does not compete; it accents.',
    'Density: generous whitespace between heading and body, tighter',
    'pairing between body and CTA — creates a clear focal cluster',
    'centered in the available space.',
    'Motion: gentle entrance (fade + slight upward translate) on first',
    'paint, no looping animation.',
  ].join('\n'),
  whyExemplar: [
    'Demonstrates the 4-part anatomy (heading + body + visual + action)',
    'with restraint. Visual does not compete with the message. Single CTA',
    "respects the user's decision budget. The component teaches that",
    '"empty" should feel calm and resolved, not anxious or busy. Most',
    'competing empty-state designs over-illustrate or stack two CTAs;',
    "Linear's restraint is the lesson.",
  ].join('\n'),
  radarReference: {
    philosophicalCoherence: 90,
    hierarchy: 95,
    craftExecution: 92,
    function: 95,
    innovation: 70,
  },
  citationCount: 0,
};

export type { Confidence };
