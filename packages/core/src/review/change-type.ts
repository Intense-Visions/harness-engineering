import type { ChangeType, DiffInfo } from './types';

/**
 * Regex patterns for conventional commit prefixes.
 * Matches: prefix:, prefix(scope):
 */
const PREFIX_PATTERNS: Array<{ pattern: RegExp; type: ChangeType }> = [
  { pattern: /^(feat|feature)(\([^)]*\))?:/i, type: 'feature' },
  { pattern: /^(fix|bugfix)(\([^)]*\))?:/i, type: 'bugfix' },
  { pattern: /^refactor(\([^)]*\))?:/i, type: 'refactor' },
  { pattern: /^docs?(\([^)]*\))?:/i, type: 'docs' },
];

const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|tsx|js|jsx|mts|cts)$/;
const MD_FILE_PATTERN = /\.md$/;

/**
 * Detect the change type from a commit message and diff information.
 *
 * Detection priority:
 * 1. Conventional commit prefix in commit message
 * 2. Diff pattern heuristics (new files, test files, docs-only)
 * 3. Default to 'feature' (most thorough review)
 */
export function detectChangeType(commitMessage: string, diff: DiffInfo): ChangeType {
  // 1. Try commit message prefix
  const trimmed = commitMessage.trim();
  for (const { pattern, type } of PREFIX_PATTERNS) {
    if (pattern.test(trimmed)) {
      return type;
    }
  }

  // 2. Try diff pattern heuristics

  // All .md files → docs
  if (diff.changedFiles.length > 0 && diff.changedFiles.every((f) => MD_FILE_PATTERN.test(f))) {
    return 'docs';
  }

  // New non-test files exist → feature
  const newNonTestFiles = diff.newFiles.filter((f) => !TEST_FILE_PATTERN.test(f));
  if (newNonTestFiles.length > 0) {
    return 'feature';
  }

  // Small changes (< 20 lines) + new test file → bugfix
  const hasNewTestFile = diff.newFiles.some((f) => TEST_FILE_PATTERN.test(f));
  if (diff.totalDiffLines < 20 && hasNewTestFile) {
    return 'bugfix';
  }

  // 3. Default to feature
  return 'feature';
}
