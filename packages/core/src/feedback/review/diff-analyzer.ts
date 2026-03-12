import { Ok, Err } from '../../shared/result';
import type { Result } from '../../shared/result';
import type {
  CodeChanges,
  ChangedFile,
  ReviewItem,
  SelfReviewConfig,
  FeedbackError,
} from '../types';

export function parseDiff(diff: string): Result<CodeChanges, FeedbackError> {
  try {
    if (!diff.trim()) {
      return Ok({ diff, files: [] });
    }

    const files: ChangedFile[] = [];
    const newFileRegex = /new file mode/;
    const deletedFileRegex = /deleted file mode/;
    const additionRegex = /^\+(?!\+\+)/gm;
    const deletionRegex = /^-(?!--)/gm;

    const diffParts = diff.split(/(?=diff --git)/);

    for (const part of diffParts) {
      if (!part.trim()) continue;

      const headerMatch = /diff --git a\/(.+?) b\/(.+?)(?:\n|$)/.exec(part);
      if (!headerMatch || !headerMatch[2]) continue;

      const filePath = headerMatch[2];

      let status: ChangedFile['status'] = 'modified';
      if (newFileRegex.test(part)) {
        status = 'added';
      } else if (deletedFileRegex.test(part)) {
        status = 'deleted';
      } else if (part.includes('rename from')) {
        status = 'renamed';
      }

      const additions = (part.match(additionRegex) || []).length;
      const deletions = (part.match(deletionRegex) || []).length;

      files.push({
        path: filePath,
        status,
        additions,
        deletions,
      });
    }

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

export async function analyzeDiff(
  changes: CodeChanges,
  options: SelfReviewConfig['diffAnalysis']
): Promise<Result<ReviewItem[], FeedbackError>> {
  if (!options?.enabled) {
    return Ok([]);
  }

  const items: ReviewItem[] = [];
  let itemId = 0;

  // Check forbidden patterns
  if (options.forbiddenPatterns) {
    for (const forbidden of options.forbiddenPatterns) {
      const pattern = typeof forbidden.pattern === 'string'
        ? new RegExp(forbidden.pattern, 'g')
        : forbidden.pattern;

      if (pattern.test(changes.diff)) {
        items.push({
          id: `diff-${++itemId}`,
          category: 'diff',
          check: `Forbidden pattern: ${forbidden.pattern}`,
          passed: false,
          severity: forbidden.severity,
          details: forbidden.message,
          suggestion: `Remove occurrences of ${forbidden.pattern}`,
        });
      }
    }
  }

  // Check max changed files
  if (options.maxChangedFiles && changes.files.length > options.maxChangedFiles) {
    items.push({
      id: `diff-${++itemId}`,
      category: 'diff',
      check: `PR size: ${changes.files.length} files changed`,
      passed: false,
      severity: 'warning',
      details: `This PR changes ${changes.files.length} files, which exceeds the recommended maximum of ${options.maxChangedFiles}`,
      suggestion: 'Consider breaking this into smaller PRs',
    });
  }

  // Check max file size
  if (options.maxFileSize) {
    for (const file of changes.files) {
      const totalLines = file.additions + file.deletions;
      if (totalLines > options.maxFileSize) {
        items.push({
          id: `diff-${++itemId}`,
          category: 'diff',
          check: `File size: ${file.path}`,
          passed: false,
          severity: 'warning',
          details: `File has ${totalLines} lines changed, exceeding limit of ${options.maxFileSize}`,
          file: file.path,
          suggestion: 'Consider splitting this file into smaller modules',
        });
      }
    }
  }

  // Check for test coverage (new .ts files without corresponding .test.ts)
  if (options.checkTestCoverage) {
    const addedSourceFiles = changes.files
      .filter(f => f.status === 'added' && f.path.endsWith('.ts') && !f.path.includes('.test.'));

    const testFiles = changes.files
      .filter(f => f.path.includes('.test.'));

    for (const sourceFile of addedSourceFiles) {
      const expectedTestPath = sourceFile.path.replace('.ts', '.test.ts');
      const hasTest = testFiles.some(t =>
        t.path.includes(expectedTestPath) ||
        t.path.includes(sourceFile.path.replace('.ts', ''))
      );

      if (!hasTest) {
        items.push({
          id: `diff-${++itemId}`,
          category: 'diff',
          check: `Test coverage: ${sourceFile.path}`,
          passed: false,
          severity: 'warning',
          details: 'New source file added without corresponding test file',
          file: sourceFile.path,
          suggestion: `Add tests in ${expectedTestPath}`,
        });
      }
    }
  }

  return Ok(items);
}
