/**
 * Living catalog (ADR 0020) — seed rubrics for docs-craft v1.
 *
 * The ceiling counterpart to the rule-based documentation floor
 * (harness-detect-doc-drift / harness-check-docs / harness-docs-pipeline,
 * which enforce existence, link freshness, and coverage). These rubrics ask
 * the ceiling questions the floor cannot: does this doc teach, does the order
 * match the reader's mental model, do the examples earn their place, is the
 * prose alive, does the API doc predict the response shape, would a stranger
 * walk away with the same understanding, can a reader find the answer fast.
 *
 * Structural twin of harness-design-craft's rubric catalog.
 */

export type { DocsRubric, DocKind } from './types.js';

import type { DocsRubric, DocKind } from './types.js';
import { teachesNotDescribesRubric } from './teaches-not-describes.js';
import { orderMatchesMentalModelRubric } from './order-matches-mental-model.js';
import { examplesEarnTheirPlaceRubric } from './examples-earn-their-place.js';
import { proseIsAliveRubric } from './prose-is-alive.js';
import { apiDocPredictsResponseRubric } from './api-doc-predicts-response.js';
import { strangerSameUnderstandingRubric } from './stranger-same-understanding.js';
import { scannableAndNavigableRubric } from './scannable-and-navigable.js';

/**
 * v1 default rubric set — 7 seed entries for documentation quality.
 */
export const SEED_RUBRICS: ReadonlyArray<DocsRubric> = [
  teachesNotDescribesRubric,
  orderMatchesMentalModelRubric,
  examplesEarnTheirPlaceRubric,
  proseIsAliveRubric,
  apiDocPredictsResponseRubric,
  strangerSameUnderstandingRubric,
  scannableAndNavigableRubric,
];

/**
 * Return the rubrics that apply to a given doc kind. A rubric with
 * `appliesTo: ['*']` applies to every doc; otherwise the doc kind must be in
 * the rubric's `appliesTo` list.
 */
export function rubricsForKind(kind: DocKind): DocsRubric[] {
  return SEED_RUBRICS.filter(
    (r) => r.appliesTo[0] === '*' || (r.appliesTo as ReadonlyArray<DocKind>).includes(kind)
  );
}
