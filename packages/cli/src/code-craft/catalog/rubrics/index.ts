/**
 * Living catalog (ADR 0020) — seed rubrics for code-craft v1.
 *
 * The ceiling counterpart to the rule-based code floor (harness-entropy-cleaner
 * for dead code / drift, harness-enforce-architecture for boundaries + deps,
 * complexity thresholds). These rubrics ask the ceiling questions the floor
 * cannot: does the code reveal intent and read in the domain’s language, is the
 * control flow honest, does the function tell one story at one altitude, does
 * each abstraction earn its keep, is this as simple as it could be, does the
 * signature keep its promise, would a senior nod or wince.
 *
 * Each rubric declares `appliesToKinds` so per-unit critique skips rubrics that
 * aren’t relevant to a unit kind — the analogue of security-craft's
 * appliesToSignals gate and docs-craft's rubricsForKind filter.
 *
 * Identifier-level naming is deliberately NOT re-authored here: it belongs to
 * naming-craft, which code-craft re-exports (`critiqueNamesInFile`). CODE-R006
 * fires only when a signature's SHAPE misrepresents behavior.
 *
 * Structural twin of security-craft's and docs-craft's rubric catalogs.
 */

export { rubricApplies } from './types.js';
export type { CodeRubric, UnitKind } from './types.js';

import type { CodeRubric } from './types.js';
import { revealsIntentRubric } from './reveals-intent.js';
import { controlFlowHonestRubric } from './control-flow-honest.js';
import { oneStoryOneAltitudeRubric } from './one-story-one-altitude.js';
import { abstractionEarnsKeepRubric } from './abstraction-earns-keep.js';
import { simplestItCouldBeRubric } from './simplest-it-could-be.js';
import { signatureKeepsPromiseRubric } from './signature-keeps-promise.js';
import { seniorNodsNotWincesRubric } from './senior-nods-not-winces.js';

/**
 * v1 default rubric set — 7 seed entries for code quality / readability.
 */
export const SEED_RUBRICS: ReadonlyArray<CodeRubric> = [
  revealsIntentRubric,
  controlFlowHonestRubric,
  oneStoryOneAltitudeRubric,
  abstractionEarnsKeepRubric,
  simplestItCouldBeRubric,
  signatureKeepsPromiseRubric,
  seniorNodsNotWincesRubric,
];
