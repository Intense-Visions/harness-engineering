// packages/core/src/entropy/types/duplication.ts
import type { CloneClass, CloneIndex, FingerprintCollision } from '../../duplication';
import type { EntropyError } from '../../shared/errors';

/**
 * The duplication detector's report, published as `EntropyReport.duplication`.
 *
 * This module deliberately re-exports NOTHING. The core barrel already does
 * `export * from './duplication'` (`src/index.ts:89`), so re-exporting
 * `CloneClass` or `DuplicationConfig` here would put two star-exports of one
 * name on the barrel — and TypeScript resolves an ambiguous star-export by
 * SILENTLY DROPPING the name, which would break spec criterion 11 without an
 * error anywhere. The clone types are `import type`-only on purpose.
 */
export interface DuplicationReport {
  /** Clone classes, rank-descending, capped at `maxClasses`. */
  classes: CloneClass[];
  /**
   * The O(1) `${file}:${startLine}` -> owning-class seam (spec goal 3).
   * Carried on the report rather than recomputed so Phase 5's `code-craft`
   * sibling lookup has somewhere to read it from.
   */
  byMember: Map<string, CloneClass>;
  /**
   * Length-differing digest collisions observed during the scan. A PARTIAL
   * record by construction: two colliding streams of EQUAL length agree on
   * `tokenCount`, group normally, and are invisible here.
   */
  collisions: FingerprintCollision[];
  /**
   * One `EntropyError` per `CloneIndex.skipped` entry, plus one summary entry
   * when `stats.skippedTruncated > 0`. The ANALYZER wraps each as an
   * `AnalysisError` with `analyzer: 'duplication'` — carrying bare errors here
   * keeps the `analyzer` tag in one place and avoids a type cycle with
   * `report.ts`.
   *
   * Every entry's `code` is `PARSE_ERROR`, which is NOT a discriminator:
   * switch on `details.reason` (a `FileSkipReason`, or `'skips-truncated'`).
   */
  skipErrors: EntropyError[];
  /**
   * `CloneIndex.stats` verbatim, plus the two advisory tallies every sibling
   * report carries.
   *
   * There is deliberately NO `errorCount` and NO `warningCount`: the
   * detector is advisory-first (spec decision D4, never fail-closed), and
   * their ABSENCE is the mechanism that keeps duplication out of
   * `EntropyReport.summary.errors` and `.warnings` — not a convention a
   * future edit can forget.
   */
  stats: CloneIndex['stats'] & {
    /** Always `classesReported`. The field siblings expose under this name. */
    violationCount: number;
    /** Always `classesReported`. Every class is advisory (D4). */
    infoCount: number;
  };
}
