/**
 * Living catalog (ADR 0020) — seed rubrics for test-craft v1.
 * Each rubric is a separate file under ./rubrics/.
 *
 * Source: docs/changes/craft-pipeline/test-craft/proposal.md
 *   (Scope → 8 seed rubrics).
 */

export interface TestRubric {
  id: string;
  title: string;
  description: string;
  source: string;
  /** ADR 0020 — catalog growth metadata (reserved). */
  contribution: { addedAt: string; addedBy: string };
  signal: { invocations: number; suppressedAt: string[] };
  version: number;
}

import { contractNotNarrativeNameRubric } from './contract-not-narrative-name.js';
import { meaningfulAssertionRubric } from './meaningful-assertion.js';
import { arrangeActAssertRubric } from './arrange-act-assert.js';
import { fixtureEarnsSetupCostRubric } from './fixture-earns-setup-cost.js';
import { singleResponsibilityRubric } from './single-responsibility.js';
import { deletingLosesSomethingRubric } from './deleting-loses-something.js';
import { contractNotImplementationRubric } from './contract-not-implementation.js';
import { explicitFailureModeRubric } from './explicit-failure-mode.js';

/**
 * v1 default rubric set — 8 seed entries from the test-quality canon
 * (Beck, Fowler, Kent C. Dodds).
 */
export const SEED_RUBRICS: ReadonlyArray<TestRubric> = [
  contractNotNarrativeNameRubric,
  meaningfulAssertionRubric,
  arrangeActAssertRubric,
  fixtureEarnsSetupCostRubric,
  singleResponsibilityRubric,
  deletingLosesSomethingRubric,
  contractNotImplementationRubric,
  explicitFailureModeRubric,
];
