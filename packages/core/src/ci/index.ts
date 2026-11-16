export { runCIChecks } from './check-orchestrator';
export type { RunCIChecksInput } from './check-orchestrator';
export { formatCIReportAsMarkdown } from './report-formatter';
export { CINotifier } from './notifier';
export { classifyBaseFreshness } from './base-freshness';
export type {
  BaseFreshnessInput,
  BaseFreshnessVerdict,
  BaseFreshnessTrust,
} from './base-freshness';
export {
  parseVerdictCacheConfig,
  VerdictCache,
  VerdictCacheStatsCollector,
  computeConfigHash,
  computeProjectInputHash,
  computeVerdictKey,
  shouldCacheResult,
  GATE_VERSIONS,
  MEMOIZABLE_CHECKS,
  DEFAULT_VERDICT_CACHE_DIR,
} from './verdict-cache';
export type { VerdictCacheConfig } from './verdict-cache';
export {
  attributeFailure,
  parseFailingTests,
  matchDiff,
  pairedSourceCandidates,
  cleanLogLine,
  testKey,
  MIN_INDEPENDENT_FAILURES_FLOOR,
} from './flake-attribution';
export type {
  FailingTest,
  FlakeVerdict,
  RunObservation,
  RunOrigin,
  CorrelatedRun,
  AttributionInput,
  TestAttribution,
  AttributionResult,
} from './flake-attribution';
