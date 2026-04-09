import { Result, Ok, Err } from '../shared/result';
import { createError } from '../shared/errors';
import type { CommitValidation, CommitFormat } from './types';
import type { ValidationError } from '../shared/errors';

/**
 * Valid conventional commit types
 */
const VALID_TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert',
];

/**
 * Conventional commit regex pattern
 * Format: type(scope)!: description
 */
const CONVENTIONAL_PATTERN = /^(\w+)(\(([^)]+)\))?(!)?: (.+)$/;

/**
 * Validates a commit message according to the specified format
 * Returns a Result type with validation details
 *
 * @param message - The commit message to validate
 * @param format - The commit format to validate against ('conventional', 'angular', 'custom')
 * @returns Result<CommitValidation, ValidationError> - Success with validation details or error
 */
export function validateCommitMessage(
  message: string,
  format: CommitFormat = 'conventional'
): Result<CommitValidation, ValidationError> {
  if (!message || typeof message !== 'string') {
    const error = createError<ValidationError>(
      'VALIDATION_FAILED',
      'Commit message must be a non-empty string',
      { message },
      ['Provide a valid commit message']
    );
    return Err(error);
  }

  if (format === 'conventional' || format === 'angular') {
    return validateConventionalCommit(message);
  }

  // For 'custom' format, accept any non-empty message
  return Ok({
    valid: true,
    breaking: false,
    issues: [],
  });
}

/**
 * Parse the header line and return an error Result if it does not match.
 */
function parseConventionalHeader(
  message: string,
  headerLine: string
): Result<RegExpMatchArray, ValidationError> {
  const match = headerLine.match(CONVENTIONAL_PATTERN);
  if (match) return Ok(match);

  return Err(
    createError<ValidationError>(
      'VALIDATION_FAILED',
      'Commit message does not follow conventional format',
      { message, header: headerLine },
      [
        'Use format: type(scope)?: description',
        'Valid types: ' + VALID_TYPES.join(', '),
        'Example: feat(core): add new feature',
      ]
    )
  );
}

/**
 * Collect validation issues from parsed commit fields.
 */
function collectCommitIssues(type: string, description: string | undefined): string[] {
  const issues: string[] = [];
  if (!VALID_TYPES.includes(type)) {
    issues.push(`Invalid commit type "${type}". Valid types: ${VALID_TYPES.join(', ')}`);
  }
  if (!description || description.trim() === '') {
    issues.push('Commit description cannot be empty');
  }
  return issues;
}

/**
 * Check if the commit body contains a BREAKING CHANGE footer.
 */
function hasBreakingChangeInBody(lines: string[]): boolean {
  if (lines.length <= 1) return false;
  return lines.slice(1).join('\n').includes('BREAKING CHANGE:');
}

/**
 * Validates a commit message against conventional commit format
 */
function validateConventionalCommit(message: string): Result<CommitValidation, ValidationError> {
  const lines = message.split('\n');
  const headerLine = lines[0];

  if (!headerLine) {
    return Err(
      createError<ValidationError>(
        'VALIDATION_FAILED',
        'Commit message header cannot be empty',
        { message },
        ['Provide a commit message with at least a header line']
      )
    );
  }

  const matchResult = parseConventionalHeader(message, headerLine);
  if (!matchResult.ok) return matchResult;

  const match = matchResult.value;
  const type = match[1]!;
  const scope = match[3];
  const breaking = match[4] === '!';
  const description = match[5];

  const issues = collectCommitIssues(type, description);
  if (issues.length > 0) {
    return Err(
      createError<ValidationError>(
        'VALIDATION_FAILED',
        `Commit message validation failed: ${issues.join('; ')}`,
        { message, issues, type, scope },
        ['Review and fix the validation issues above']
      )
    );
  }

  return Ok({
    valid: true,
    type,
    ...(scope && { scope }),
    breaking: breaking || hasBreakingChangeInBody(lines),
    issues: [],
  });
}
