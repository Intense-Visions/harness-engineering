/**
 * Shared CLI helper: read advisory guardian diff-coverage records from a
 * project's `.harness/analyses/` archive and project them into a pre-rendered
 * advisory block for the code-review pipeline (#914, issue box 1 —
 * harness-code-review consumer).
 *
 * This lives at the CLI layer on purpose: the review pipeline in
 * `@harness-engineering/core` must not depend on `@harness-engineering/intelligence`
 * (core is the lower layer). Mirroring how `domainAccuracy` is derived
 * caller-side, the CLI reads + projects the guardian contract here and passes a
 * plain string into `runReviewPipeline({ guardianCoverage })`.
 *
 * Degrade-safe: an absent/empty/malformed archive yields `undefined`, so the
 * pipeline behaves byte-identically to today.
 */

import * as path from 'node:path';

/**
 * Read the project's guardian diff-coverage archive and render an advisory
 * markdown block, or `undefined` when there is nothing to surface.
 *
 * Never throws: any read/parse failure (and the common absent-archive case)
 * returns `undefined`.
 *
 * The intelligence package is imported dynamically (not statically) so pulling
 * this helper into a CLI command does not eagerly load intelligence's heavy
 * barrel — which transitively imports `child_process` for its CLI providers and
 * would otherwise break test suites that partially mock `child_process`.
 */
export async function loadGuardianCoverage(projectRoot: string): Promise<string | undefined> {
  try {
    const { readGuardianAnalyses, summarizeGuardian, guardianFileLines } =
      await import('@harness-engineering/intelligence');
    const analyses = await readGuardianAnalyses(path.join(projectRoot, '.harness', 'analyses'));
    const summary = summarizeGuardian(analyses);
    if (!summary) return undefined; // no records → no signal
    const fileLines = guardianFileLines(analyses);
    const lines = ['## Guardian diff-coverage (advisory)', '', summary];
    if (fileLines.length > 0) {
      lines.push('', 'Uncovered changed lines:', ...fileLines.map((l) => `- ${l}`));
    }
    return lines.join('\n');
  } catch {
    return undefined;
  }
}
