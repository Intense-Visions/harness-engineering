// packages/cli/src/design-craft/measurement/index.ts
//
// Public surface of the design-craft measurement subsystem — the growth-
// infrastructure half of ADR 0020 (living-catalog H pattern). Stable
// across minor versions; dashboards and the design-pipeline orchestrator
// import from this barrel rather than reaching into siblings.

export {
  recordTrigger,
  recordApply,
  recordCite,
  getCatalogStats,
  resetCatalogStats,
} from './usage.js';
export type { CatalogStats, CatalogUsageCounters } from './usage.js';

export { recordSignalEvent, proposeFromRecurringFindings, resetSignalStore } from './signal.js';
export type { SignalEvent, ProposalCandidate } from './signal.js';
