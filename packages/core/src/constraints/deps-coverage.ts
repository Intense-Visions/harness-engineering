import * as path from 'node:path';
import type { DependencyValidation, UnparsedFile } from './types';
import type { DepsSettings } from './layer-config';

/**
 * Why part (or all) of a dependency analysis did not happen.
 *
 * - `engine-unavailable` — the parser reported itself unavailable and the
 *   engine abstained (#2098).
 * - `unparsed-file` — one source file could not be parsed, so its imports were
 *   not checked (#2073).
 * - `no-source-modules` — layers are configured but contain no source module,
 *   so there was nothing to check (#1188, #2671).
 */
export type DepsCoverageGapKind = 'engine-unavailable' | 'unparsed-file' | 'no-source-modules';

/**
 * One thing the dependency analysis could not cover.
 *
 * `check`, `file`, `reason` and `suggestion` are exactly the `unavailableChecks`
 * entry every surface renders; {@link toUnavailableCheck} strips the rest.
 */
export interface DepsCoverageGap {
  kind: DepsCoverageGapKind;
  /** The analysis that did not run. */
  check: string;
  /** Posix-relative path, when the gap is about one file. */
  file?: string;
  /** Why it did not run. */
  reason: string;
  /** What the operator should do about it. */
  suggestion: string;
  /**
   * Whether `deps.fallbackBehavior: 'warn'` may downgrade this gap to a
   * non-blocking warning. An unavailable engine or an unparseable file can be;
   * an empty layer set cannot — that escape hatch is for a broken engine, not
   * for a check with nothing to examine.
   */
  downgradable: boolean;
}

/**
 * The single verdict on what a dependency analysis could not cover.
 *
 * `harness check-deps`, the `harness ci check` deps step and the
 * `check_dependencies` MCP tool used to each re-derive this from the engine
 * result, and they disagreed: on a freshly scaffolded project (layers holding
 * only `.gitkeep`) check-deps refused to report clean while the other two
 * reported a pass over zero modules (#2671). All three now read it from here.
 */
export interface DepsCoverage {
  gaps: DepsCoverageGap[];
  /**
   * True when `deps.fallbackBehavior: 'warn'` downgraded at least one gap. The
   * gap is still reported; only its effect on the verdict is removed.
   */
  downgraded: boolean;
  /**
   * Gaps that still block a clean verdict after any downgrade. A surface must
   * not report clean while this is non-zero: it abstains (exit 3 /
   * `status: 'skip'` / `valid: false`).
   */
  fatal: number;
}

/** The `unavailableChecks` entry a surface renders for a gap. */
export interface DepsUnavailableCheck {
  check: string;
  file?: string;
  reason: string;
  suggestion?: string;
}

const WARN_SUGGESTION =
  'To keep exiting 0 meanwhile, set `deps.fallbackBehavior: "warn"` in harness.config.json.';

/**
 * One gap per source file the analysis could not parse (#2073), with a
 * posix-relative path.
 *
 * @param unparsed - Files the engine could not read imports from.
 * @param rootDir - Root that paths are rendered relative to.
 */
export function unparsedFileGaps(
  unparsed: readonly UnparsedFile[],
  rootDir: string
): DepsCoverageGap[] {
  return unparsed.map(({ file, reason }) => {
    const relative = path.relative(rootDir, file).replaceAll('\\', '/');
    return {
      kind: 'unparsed-file',
      check: 'dependency analysis',
      file: relative,
      reason: `${relative} could not be parsed, so its imports were not checked: ${reason}`,
      suggestion: `Fix the file so it parses, or exclude it via \`deps.exclude\`. ${WARN_SUGGESTION}`,
      downgradable: true,
    };
  });
}

/**
 * The zero-module abstention (#1188), worded for its two causes (#2671).
 *
 * Paths matched but none was source: the layer directories exist and hold only
 * placeholders such as `.gitkeep` — every fresh scaffold. Nothing matched at
 * all: the patterns (or `deps.exclude`) point nowhere. Either way nothing was
 * examined, which is an abstention and never a pass.
 */
function noSourceModulesGap(layerCount: number, matchedPaths: number | undefined): DepsCoverageGap {
  const layers = `${layerCount} configured layer(s)`;
  const reason =
    matchedPaths !== undefined && matchedPaths > 0
      ? `No source modules yet — the ${layers} contain no TypeScript/JavaScript source ` +
        '(only placeholders such as .gitkeep), so there was nothing to check.'
      : `No source modules — the ${layers} matched no files, so there was nothing to check.`;
  return {
    kind: 'no-source-modules',
    check: 'layer validation',
    reason,
    suggestion:
      'Add source under a configured layer, or correct the layer patterns / `deps.exclude` ' +
      'if source should already match. This is an abstention (nothing was examined), not a ' +
      'pass and not a violation.',
    downgradable: false,
  };
}

/**
 * Decide what a `validateDependencies` run did not cover.
 *
 * Only reads what the engine reported: `skipped` (engine abstained), the
 * `unparsedFiles` list, and the `analyzedFiles` denominator. A result without
 * an `analyzedFiles` count (precomputed graph data, or a stub) carries no
 * denominator to judge, so it produces no zero-module gap.
 *
 * @param validation - The engine result.
 * @param settings - The resolved deps settings the run used.
 */
export function assessDepsCoverage(
  validation: DependencyValidation,
  settings: Pick<DepsSettings, 'layers' | 'rootDir' | 'fallbackBehavior'>
): DepsCoverage {
  const gaps: DepsCoverageGap[] = [];
  if (validation.skipped) {
    gaps.push({
      kind: 'engine-unavailable',
      check: 'layer validation',
      reason: `Layer validation did not run: ${validation.reason ?? 'the analysis engine abstained'}`,
      suggestion: `Restore the analysis engine (the parser reported itself unavailable). ${WARN_SUGGESTION}`,
      downgradable: true,
    });
  }
  gaps.push(...unparsedFileGaps(validation.unparsedFiles ?? [], settings.rootDir));
  if (
    gaps.length === 0 &&
    settings.layers.length > 0 &&
    validation.analyzedFiles === 0 &&
    validation.violations.length === 0
  ) {
    gaps.push(noSourceModulesGap(settings.layers.length, validation.matchedPaths));
  }
  const warn = settings.fallbackBehavior === 'warn';
  const downgraded = warn && gaps.some((g) => g.downgradable);
  const fatal = gaps.filter((g) => !(warn && g.downgradable)).length;
  return { gaps, downgraded, fatal };
}

/** Strip a gap to the `unavailableChecks` entry every surface renders. */
export function toUnavailableCheck(gap: DepsCoverageGap): DepsUnavailableCheck {
  return {
    check: gap.check,
    ...(gap.file !== undefined ? { file: gap.file } : {}),
    reason: gap.reason,
    suggestion: gap.suggestion,
  };
}
