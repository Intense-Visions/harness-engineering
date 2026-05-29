/**
 * Public exports surface for `detect-design-drift`.
 *
 * This module is the stable contract consumed by sibling skills + the
 * (future) #5 design-pipeline orchestrator. Anything not re-exported
 * from here is internal — internal modules may move or change shape
 * between minor versions. Add exports here only when a contract is
 * intended to be stable across releases.
 *
 * Today's consumers:
 *  - `align-design-system` reads the finding type via the runtime
 *    re-export from `index.ts`; the catalog helpers below are
 *    forward-looking for the orchestrator and `harness check-design --fix`.
 *
 * Mirrors `packages/cli/src/audit/component-anatomy/exports.ts` — the
 * floor-raising design-pipeline sub-projects share this convention so
 * the orchestrator can pattern-match across them.
 *
 * Reference:
 *  - docs/changes/design-pipeline/detect-design-drift/proposal.md
 *    § Technical Design → File layout
 *  - docs/changes/design-pipeline/align-design-system/proposal.md
 *    § Pipeline handoff
 */

export { getDriftCodes, lookupDriftCode, listDriftCodes } from './catalog/index.js';
export type { DriftCodeEntry } from './catalog/index.js';
export type {
  DriftFinding,
  DriftFindingCode,
  DriftSeverity,
  DriftStrictness,
} from './findings/finding.js';
