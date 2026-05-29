/**
 * Public exports surface for `align-design-system`.
 *
 * This module is the stable contract consumed by sibling skills + the
 * (future) #5 design-pipeline orchestrator. Anything not re-exported
 * from here is internal — internal modules (codemods/, suggestions/,
 * classifier/, revert/) may move or change shape between minor
 * versions. Add exports here only when a contract is intended to be
 * stable across releases.
 *
 * Mirrors `packages/cli/src/audit/component-anatomy/exports.ts` and
 * `packages/cli/src/drift/exports.ts` — the floor-raising
 * design-pipeline sub-projects share this convention so the
 * orchestrator can pattern-match across them.
 *
 * Reference:
 *  - docs/changes/design-pipeline/align-design-system/proposal.md
 *    § Pipeline handoff
 *  - docs/changes/design-pipeline/orchestrator/proposal.md
 */

export {
  getAlignCodes,
  lookupAlignCode,
  listAlignCodes,
  getCodemodCapableCodes,
} from './catalog/index.js';
export type { AlignCodeEntry, AlignHandlingMode } from './catalog/index.js';
export type {
  FixOutcome,
  FixDiff,
  FixSuggestion,
  AlignDesignSystemOutput,
  AlignSummary,
  AlignCatalog,
  AlignMeta,
  AlignMode,
} from './findings/outcome.js';
