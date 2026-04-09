import { Ok, Err } from '../../shared/result';
import type { Result } from '../../shared/result';
import type {
  CodeChanges,
  ChangedFile,
  ReviewItem,
  SelfReviewConfig,
  FeedbackError,
  GraphImpactData,
} from '../types';

function detectFileStatus(part: string): ChangedFile['status'] {
  if (/new file mode/.test(part)) return 'added';
  if (/deleted file mode/.test(part)) return 'deleted';
  if (part.includes('rename from')) return 'renamed';
  return 'modified';
}

function parseDiffHeader(part: string): string | null {
  if (!part.trim()) return null;
  const headerMatch = /diff --git a\/(.+?) b\/(.+?)(?:\n|$)/.exec(part);
  if (!headerMatch || !headerMatch[2]) return null;
  return headerMatch[2];
}

function parseDiffPart(part: string): ChangedFile | null {
  const path = parseDiffHeader(part);
  if (!path) return null;

  const additionRegex = /^\+(?!\+\+)/gm;
  const deletionRegex = /^-(?!--)/gm;

  return {
    path,
    status: detectFileStatus(part),
    additions: (part.match(additionRegex) || []).length,
    deletions: (part.match(deletionRegex) || []).length,
  };
}

export function parseDiff(diff: string): Result<CodeChanges, FeedbackError> {
  try {
    if (!diff.trim()) {
      return Ok({ diff, files: [] });
    }

    const files = diff
      .split(/(?=diff --git)/)
      .map(parseDiffPart)
      .filter((f): f is ChangedFile => f !== null);

    return Ok({ diff, files });
  } catch (error) {
    return Err({
      code: 'DIFF_PARSE_ERROR',
      message: 'Failed to parse git diff',
      details: { reason: String(error) },
      suggestions: ['Ensure diff is in valid git diff format'],
    });
  }
}

function checkForbiddenPatterns(
  diff: string,
  forbiddenPatterns: NonNullable<SelfReviewConfig['diffAnalysis']>['forbiddenPatterns'],
  nextId: () => string
): ReviewItem[] {
  const items: ReviewItem[] = [];
  if (!forbiddenPatterns) return items;

  for (const forbidden of forbiddenPatterns) {
    const pattern =
      typeof forbidden.pattern === 'string'
        ? new RegExp(forbidden.pattern, 'g')
        : forbidden.pattern;

    if (!pattern.test(diff)) continue;

    items.push({
      id: nextId(),
      category: 'diff',
      check: `Forbidden pattern: ${forbidden.pattern}`,
      passed: false,
      severity: forbidden.severity,
      details: forbidden.message,
      suggestion: `Remove occurrences of ${forbidden.pattern}`,
    });
  }

  return items;
}

function checkMaxChangedFiles(
  files: ChangedFile[],
  maxChangedFiles: number | undefined,
  nextId: () => string
): ReviewItem[] {
  if (!maxChangedFiles || files.length <= maxChangedFiles) return [];

  return [
    {
      id: nextId(),
      category: 'diff',
      check: `PR size: ${files.length} files changed`,
      passed: false,
      severity: 'warning',
      details: `This PR changes ${files.length} files, which exceeds the recommended maximum of ${maxChangedFiles}`,
      suggestion: 'Consider breaking this into smaller PRs',
    },
  ];
}

function checkFileSizes(
  files: ChangedFile[],
  maxFileSize: number | undefined,
  nextId: () => string
): ReviewItem[] {
  const items: ReviewItem[] = [];
  if (!maxFileSize) return items;

  for (const file of files) {
    const totalLines = file.additions + file.deletions;
    if (totalLines <= maxFileSize) continue;

    items.push({
      id: nextId(),
      category: 'diff',
      check: `File size: ${file.path}`,
      passed: false,
      severity: 'warning',
      details: `File has ${totalLines} lines changed, exceeding limit of ${maxFileSize}`,
      file: file.path,
      suggestion: 'Consider splitting this file into smaller modules',
    });
  }

  return items;
}

function checkTestCoverageGraph(
  files: ChangedFile[],
  graphImpactData: GraphImpactData
): ReviewItem[] {
  const items: ReviewItem[] = [];

  for (const file of files) {
    if (file.status !== 'added' || !file.path.endsWith('.ts') || file.path.includes('.test.')) {
      continue;
    }

    const hasGraphTest = graphImpactData.affectedTests.some((t) => t.coversFile === file.path);
    if (hasGraphTest) continue;

    items.push({
      id: `test-coverage-${file.path}`,
      category: 'diff' as const,
      check: 'Test coverage (graph)',
      passed: false,
      severity: 'warning' as const,
      details: `New file ${file.path} has no test file linked in the graph`,
      file: file.path,
    });
  }

  return items;
}

function checkTestCoverageFilename(files: ChangedFile[], nextId: () => string): ReviewItem[] {
  const items: ReviewItem[] = [];

  const addedSourceFiles = files.filter(
    (f) => f.status === 'added' && f.path.endsWith('.ts') && !f.path.includes('.test.')
  );
  const testFiles = files.filter((f) => f.path.includes('.test.'));

  for (const sourceFile of addedSourceFiles) {
    const expectedTestPath = sourceFile.path.replace('.ts', '.test.ts');
    const hasTest = testFiles.some(
      (t) =>
        t.path.includes(expectedTestPath) || t.path.includes(sourceFile.path.replace('.ts', ''))
    );

    if (hasTest) continue;

    items.push({
      id: nextId(),
      category: 'diff',
      check: `Test coverage: ${sourceFile.path}`,
      passed: false,
      severity: 'warning',
      details: 'New source file added without corresponding test file',
      file: sourceFile.path,
      suggestion: `Add tests in ${expectedTestPath}`,
    });
  }

  return items;
}

function checkDocCoverage(files: ChangedFile[], graphImpactData: GraphImpactData): ReviewItem[] {
  const items: ReviewItem[] = [];

  for (const file of files) {
    if (file.status !== 'modified' || !file.path.endsWith('.ts') || file.path.includes('.test.')) {
      continue;
    }

    const hasDoc = graphImpactData.affectedDocs.some((d) => d.documentsFile === file.path);
    if (hasDoc) continue;

    items.push({
      id: `doc-coverage-${file.path}`,
      category: 'diff' as const,
      check: 'Documentation coverage (graph)',
      passed: true,
      severity: 'info' as const,
      details: `Modified file ${file.path} has no documentation linked in the graph`,
      file: file.path,
    });
  }

  return items;
}

export async function analyzeDiff(
  changes: CodeChanges,
  options: SelfReviewConfig['diffAnalysis'],
  graphImpactData?: GraphImpactData
): Promise<Result<ReviewItem[], FeedbackError>> {
  if (!options?.enabled) {
    return Ok([]);
  }

  let itemId = 0;
  const nextId = () => `diff-${++itemId}`;

  const items: ReviewItem[] = [
    ...checkForbiddenPatterns(changes.diff, options.forbiddenPatterns, nextId),
    ...checkMaxChangedFiles(changes.files, options.maxChangedFiles, nextId),
    ...checkFileSizes(changes.files, options.maxFileSize, nextId),
  ];

  if (options.checkTestCoverage) {
    const coverageItems = graphImpactData
      ? checkTestCoverageGraph(changes.files, graphImpactData)
      : checkTestCoverageFilename(changes.files, nextId);
    items.push(...coverageItems);
  }

  if (graphImpactData && graphImpactData.impactScope > 20) {
    items.push({
      id: 'impact-scope',
      category: 'diff' as const,
      check: 'Impact scope',
      passed: false,
      severity: 'warning' as const,
      details: `Changes affect ${graphImpactData.impactScope} downstream dependents — consider a thorough review`,
    });
  }

  if (graphImpactData) {
    items.push(...checkDocCoverage(changes.files, graphImpactData));
  }

  return Ok(items);
}
