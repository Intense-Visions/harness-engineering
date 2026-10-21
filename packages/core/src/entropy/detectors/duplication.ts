import type { Result } from '../../shared/result';
import { Ok, Err } from '../../shared/result';
import { createEntropyError } from '../../shared/errors';
import { buildCloneIndex } from '../../duplication';
import type { CloneIndex, DuplicationConfig, FileSkipReason, SkippedFile } from '../../duplication';
import type { CodebaseSnapshot, DuplicationReport, EntropyError } from '../types';

/**
 * Remediation advice keyed to the reason, not a fixed list.
 *
 * The first three reasons blame the FILE; `internal-error` blames our own
 * normalization or digest stage (or the runtime — a FIPS-mode Node where
 * `createHash('sha1')` throws). Advising "check file permissions" for that
 * last one is actively misleading, which is why the reason exists.
 */
const SKIP_ADVICE: Record<FileSkipReason, string> = {
  unreadable: 'Check the file still exists and is readable by this process',
  unparseable: 'Check the file is valid TypeScript/JavaScript for its extension',
  unextractable: 'Report the AST shape: the file parsed but unit extraction failed on it',
  'internal-error':
    'Check the runtime rather than the file: normalization or the sha1 digest failed (e.g. FIPS-mode Node)',
};

/**
 * Convert one skipped file into an `EntropyError`.
 *
 * `details.reason` carries the `FileSkipReason` and is THE discriminator —
 * `code` is `PARSE_ERROR` for all four reasons and is also raised by
 * unrelated entropy modules, so no consumer may switch on it.
 */
function skipToError(skipped: SkippedFile): EntropyError {
  return createEntropyError(
    'PARSE_ERROR',
    `Skipped ${skipped.file} during duplication analysis (${skipped.reason}: ${skipped.errorName}): ${skipped.message}`,
    { reason: skipped.reason, file: skipped.file, originalError: skipped.originalError },
    [SKIP_ADVICE[skipped.reason]]
  );
}

/**
 * One extra error when the index's skip evidence hit `MAX_EVIDENCE_ENTRIES`.
 *
 * `CloneIndex.skipped` is a capped SAMPLE while `stats.filesSkipped` is
 * exact, so emitting one `AnalysisError` per sampled entry and stopping would
 * under-report the damage by exactly `skippedTruncated` files. The counts stay
 * honest because this says so out loud.
 */
function truncationToError(stats: CloneIndex['stats']): EntropyError {
  const reported = stats.filesSkipped - stats.skippedTruncated;
  return createEntropyError(
    'PARSE_ERROR',
    `${stats.filesSkipped} file(s) were skipped during duplication analysis; only the first ${reported} are reported individually and ${stats.skippedTruncated} are not.`,
    { reason: 'skips-truncated' },
    ['Fix the reported files and re-run to surface the remainder']
  );
}

/**
 * Detect duplicated whole units (functions, methods, classes) across the
 * snapshot's source files.
 *
 * Discovery is the snapshot's: `snapshot.files` IS the set
 * `EntropyConfig.include` / `exclude` resolved to, so this detector contains
 * no glob, no second discovery path, and no assumption about any
 * repository's layout (spec criterion 15). It re-parses each file itself via
 * `buildCloneIndex` rather than reading `snapshot.files[].ast`, because that
 * `AST` is a lossy `{ type, body: unknown, language }` wrapper and the parser
 * registry defaults to tree-sitter, so estree tokens would not survive the
 * snapshot (spec decision D7).
 *
 * One consequence of consuming `snapshot.files` is recorded rather than
 * hidden: it holds only the files the snapshot's OWN parser accepted, so a
 * file that parser rejected never reaches this detector and cannot produce an
 * `unparseable` skip by that route. The per-file skip contract below is
 * nonetheless unconditional — anything that does arrive and fails here is
 * skipped and reported — and it is proven at this level, where it can be
 * forced, rather than through the analyzer.
 *
 * A partial skip returns `Ok` with the skips on `skipErrors` — that is a scan
 * that happened with gaps. Zero eligible files, or a run where EVERY eligible
 * file was skipped, returns `Err`: at 100% skip the result is
 * indistinguishable from a clean scan, and reporting a pass over it is the
 * failure class the whole guard exists for.
 *
 * Severity is advisory only (spec decision D4) — see `DuplicationReport.stats`.
 */
export async function detectDuplication(
  snapshot: CodebaseSnapshot,
  config: Partial<DuplicationConfig> = {}
): Promise<Result<DuplicationReport, EntropyError>> {
  const result = await buildCloneIndex(
    snapshot.files.map((file) => file.path),
    { ...config, rootDir: snapshot.rootDir }
  );
  if (!result.ok) return Err(result.error);

  const index = result.value;
  const skipErrors = index.skipped.map(skipToError);
  if (index.stats.skippedTruncated > 0) {
    skipErrors.push(truncationToError(index.stats));
  }

  return Ok({
    classes: index.classes,
    byMember: index.byMember,
    collisions: index.collisions,
    skipErrors,
    stats: {
      ...index.stats,
      violationCount: index.stats.classesReported,
      infoCount: index.stats.classesReported,
    },
  });
}
