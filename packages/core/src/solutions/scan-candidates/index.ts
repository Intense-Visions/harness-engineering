export { isoWeek, formatIsoWeek } from './iso-week';
export type { IsoWeek } from './iso-week';
export { gitScan } from './git-scan';
export type { ScannedCommit, GitScanOptions } from './git-scan';
export { computeHotspots } from './hotspot';
// Re-export hotspot types under a `Scan*`-prefixed name to avoid collision with
// the existing `Hotspot` type from `./blueprint/types` at the top-level core
// barrel (`packages/core/src/index.ts`). Plan deviation: documented in handoff.
export type { Hotspot as ScanHotspot, HotspotOptions as ScanHotspotOptions } from './hotspot';
export { crossReferenceUndocumentedFixes } from './cross-reference';
export { assembleCandidateReport, suggestCategory } from './assemble';
export type { AssembleInput } from './assemble';
