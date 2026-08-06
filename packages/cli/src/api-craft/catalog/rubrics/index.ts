/**
 * Living catalog (ADR 0020) — seed rubrics for api-craft v1.
 *
 * The ceiling counterpart to the rule-based API floor (harness-api-openapi-design
 * and harness-api-webhook-design, which are knowledge/rule skills about format
 * and OpenAPI compliance). A linter can confirm a path is documented and a
 * schema validates; only judgment can tell whether the endpoint sits at the
 * right abstraction, whether the HTTP verb is honest, whether a resource name
 * belongs in the URL or a query param, whether a stranger could predict the
 * response shape, whether the error code tells the consumer what to do, whether
 * the mutation is idempotency-honest, and whether the shape models the domain
 * or leaks the implementation.
 *
 * Each rubric declares `appliesTo` so per-surface critique skips rubrics that
 * cannot be honestly judged from a given surface kind — the analogue of
 * cli-ergonomics-craft's leaf/group filter. Idempotency (API-R008) is a
 * handler-behavior concern a declarative spec rarely captures, so it applies to
 * `route` surfaces only.
 *
 * Structural twin of cli-ergonomics-craft's rubric catalog.
 */

export type { ApiRubric, ApiSurfaceKind } from './types.js';

import type { ApiRubric, ApiSurfaceKind } from './types.js';
import { resourceModelsTheDomainRubric } from './resource-models-the-domain.js';
import { namingIsPredictableRubric } from './naming-is-predictable.js';
import { verbsAreHonestRubric } from './verbs-are-honest.js';
import { statusCodesAreCorrectRubric } from './status-codes-are-correct.js';
import { errorsAreActionableRubric } from './errors-are-actionable.js';
import { responseShapesArePredictableRubric } from './response-shapes-are-predictable.js';
import { collectionsPaginateAndFilterRubric } from './collections-paginate-and-filter.js';
import { mutationsAreIdempotencyHonestRubric } from './mutations-are-idempotency-honest.js';
import { evolvesWithoutBreakingRubric } from './evolves-without-breaking.js';

/**
 * v1 default rubric set — 9 seed entries for API quality.
 */
export const SEED_RUBRICS: ReadonlyArray<ApiRubric> = [
  resourceModelsTheDomainRubric,
  namingIsPredictableRubric,
  verbsAreHonestRubric,
  statusCodesAreCorrectRubric,
  errorsAreActionableRubric,
  responseShapesArePredictableRubric,
  collectionsPaginateAndFilterRubric,
  mutationsAreIdempotencyHonestRubric,
  evolvesWithoutBreakingRubric,
];

/**
 * Return the rubrics that apply to a given API-surface kind. A rubric with
 * `appliesTo: ['*']` applies to every surface; otherwise the surface kind must
 * be in the rubric's `appliesTo` list. Eight rubrics apply to both an OpenAPI
 * document and route code; API-R008 (idempotency) is handler-behavior only and
 * fires on `route` surfaces alone.
 */
export function rubricsForKind(kind: ApiSurfaceKind): ApiRubric[] {
  return SEED_RUBRICS.filter(
    (r) => r.appliesTo[0] === '*' || (r.appliesTo as ReadonlyArray<ApiSurfaceKind>).includes(kind)
  );
}
