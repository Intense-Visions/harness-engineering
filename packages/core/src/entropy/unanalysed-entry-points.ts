import { createEntropyError } from '../shared/errors';
import { relativePosix } from '../shared/fs-utils';
import type { EntropyError } from './types';

/** How many unanalysed entries `error.message` names before summarising the rest. */
const MAX_NAMED_IN_MESSAGE = 3;

/** Separator-insensitive key: `resolve` and `glob` may disagree on win32. */
const pathKey = (p: string): string => p.replaceAll('\\', '/');

/**
 * Find resolved entry points that are not in the analysed file set (#2296).
 *
 * `resolveEntryPoints` checks the filesystem; the analysed set comes from file
 * discovery, which drops a path through an exclude pattern, an extension
 * outside `include`, or a directory the walker ignores unconditionally (`dist`,
 * `build`, …). An entry point dropped that way still exists, so it passes the
 * #2275 existence check, but as a reachability root it matches nothing and
 * contributes nothing — every export only it reaches reports dead.
 *
 * Returns the entries to name in the error: the string the author wrote for a
 * configured entry (what they will search their config for), the root-relative
 * POSIX path for an auto-detected one.
 */
export function findUnanalysedEntryPoints(
  rootDir: string,
  entryPoints: readonly string[],
  configuredEntries: readonly string[] | undefined,
  analysedPaths: readonly string[]
): string[] {
  const analysed = new Set(analysedPaths.map(pathKey));
  const configured = configuredEntries && configuredEntries.length > 0 ? configuredEntries : null;
  const unanalysed: string[] = [];
  entryPoints.forEach((entry, i) => {
    if (analysed.has(pathKey(entry))) return;
    unanalysed.push(configured?.[i] ?? relativePosix(rootDir, entry));
  });
  return unanalysed;
}

function nameUnanalysed(unanalysed: readonly string[]): string {
  const named = unanalysed.slice(0, MAX_NAMED_IN_MESSAGE).join(', ');
  const rest = unanalysed.length - MAX_NAMED_IN_MESSAGE;
  return rest > 0 ? `${named} and ${rest} more` : named;
}

/**
 * The error for entry points that exist but are never analysed.
 *
 * Strict on ANY such entry, matching #2275's unresolvable-entry error: a root
 * that reaches nothing silently turns the code only it reaches into dead-code
 * findings, and the author's intent for it — keeping that code reachable —
 * never happened. `buildSnapshot` applies the same gating as #2275: fatal on a
 * run that requests dead-code analysis (the only reader of entry points),
 * carried as `snapshot.entryPointsError` otherwise.
 */
export function reportUnanalysedEntries(
  unanalysed: readonly string[],
  entryPointCount: number,
  configured: boolean
): EntropyError {
  const suggestions = [
    `Stop excluding these files, or remove them from entryPoints: ${unanalysed.join(', ')}`,
    'An entry point must be a source file matched by the include patterns and not by the exclude patterns',
  ];
  if (!configured) {
    suggestions.push(
      'Auto-detection read these from package.json (main/exports/bin); a build artifact under dist/ or build/ is never analysed. Set entryPoints to the source files instead (e.g. src/index.ts)'
    );
  }

  return createEntropyError(
    'ENTRY_POINT_NOT_ANALYSED',
    `${unanalysed.length} of ${entryPointCount} ${configured ? 'configured' : 'auto-detected'} ` +
      `entryPoints exist but are never analysed: ${nameUnanalysed(unanalysed)}`,
    {
      reason:
        `Entry points exist on disk but are not in the analysed file set: ${unanalysed.join(', ')}. ` +
        `They are excluded, outside the include patterns, under a directory the file walker ` +
        `always skips, or failed to parse. Reachability analysis walks outward from entry points, so a root that is ` +
        `never analysed reaches no code: every export only it reaches looks dead.`,
      issues: [...unanalysed],
    },
    suggestions
  );
}
