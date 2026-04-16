import type { ContextBundle, ContextFile, ReviewDomain, ReviewStage, Rubric } from './types';

/**
 * Which review domains belong to each isolation stage.
 *
 * Spec-compliance: reviewers that check the change against the spec,
 * conventions, and layer boundaries. These reviewers see the spec file
 * and spec-category rubric items.
 *
 * Code-quality: reviewers that check bugs and security risks. These
 * reviewers do NOT see the spec file — their judgment is based on the
 * code alone plus quality/risk rubric items.
 */
export const STAGE_DOMAINS: Record<ReviewStage, readonly ReviewDomain[]> = {
  'spec-compliance': ['compliance', 'architecture'],
  'code-quality': ['bug', 'security'],
};

/**
 * Return the domain list for the given stage.
 */
export function stageDomains(stage: ReviewStage): readonly ReviewDomain[] {
  return STAGE_DOMAINS[stage];
}

/**
 * Filter a list of context bundles down to a single stage, stripping
 * stage-inappropriate content.
 *
 * For `spec-compliance`:
 *   - Keeps bundles whose domain is in STAGE_DOMAINS['spec-compliance'].
 *   - Keeps only rubric items in `spec` category.
 *   - Leaves context files untouched (spec-compliance needs them).
 *
 * For `code-quality`:
 *   - Keeps bundles whose domain is in STAGE_DOMAINS['code-quality'].
 *   - Keeps only rubric items in `quality` or `risk` categories.
 *   - Drops context files whose `reason === 'spec'` so code-quality
 *     reviewers are not biased by spec content.
 *
 * Pure function — does not mutate the input bundles.
 */
export function splitBundlesByStage(
  bundles: readonly ContextBundle[],
  stage: ReviewStage
): ContextBundle[] {
  const domains = new Set(STAGE_DOMAINS[stage]);
  return bundles.filter((b) => domains.has(b.domain)).map((b) => applyStageIsolation(b, stage));
}

function applyStageIsolation(bundle: ContextBundle, stage: ReviewStage): ContextBundle {
  const filteredRubric = filterRubricByStage(bundle.rubric, stage);
  const filteredContextFiles =
    stage === 'code-quality'
      ? bundle.contextFiles.filter((f) => !isSpecReason(f))
      : bundle.contextFiles;

  const contextLines = filteredContextFiles.reduce((sum, f) => sum + f.lines, 0);

  return {
    ...bundle,
    stage,
    contextFiles: filteredContextFiles,
    contextLines,
    ...(filteredRubric ? { rubric: filteredRubric } : {}),
  };
}

function isSpecReason(file: ContextFile): boolean {
  return file.reason === 'spec';
}

function filterRubricByStage(rubric: Rubric | undefined, stage: ReviewStage): Rubric | undefined {
  if (!rubric) return undefined;
  const allowedCategories =
    stage === 'spec-compliance'
      ? new Set<Rubric['items'][number]['category']>(['spec'])
      : new Set<Rubric['items'][number]['category']>(['quality', 'risk']);
  const items = rubric.items.filter((item) => allowedCategories.has(item.category));
  return { ...rubric, items };
}
