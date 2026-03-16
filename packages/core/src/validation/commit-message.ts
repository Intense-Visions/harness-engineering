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
 * Validates a commit message against conventional commit format
 */
function validateConventionalCommit(message: string): Result<CommitValidation, ValidationError> {
  const lines = message.split('\n');
  const headerLine = lines[0];

  if (!headerLine) {
    const error = createError<ValidationError>(
      'VALIDATION_FAILED',
      'Commit message header cannot be empty',
      { message },
      ['Provide a commit message with at least a header line']
    );
    return Err(error);
  }

  const match = headerLine.match(CONVENTIONAL_PATTERN);

  if (!match) {
    const error = createError<ValidationError>(
      'VALIDATION_FAILED',
      'Commit message does not follow conventional format',
      { message, header: headerLine },
      [
        'Use format: type(scope)?: description',
        'Valid types: ' + VALID_TYPES.join(', '),
        'Example: feat(core): add new feature',
      ]
    );
    return Err(error);
  }

  const type = match[1]!;
  const scope = match[3];
  const breaking = match[4] === '!';
  const description = match[5];

  const issues: string[] = [];

  // Validate type
  if (!VALID_TYPES.includes(type)) {
    issues.push(`Invalid commit type "${type}". Valid types: ${VALID_TYPES.join(', ')}`);
  }

  // Validate description is not empty
  if (!description || description.trim() === '') {
    issues.push('Commit description cannot be empty');
  }

  // Check for breaking change marker
  let hasBreakingChange = breaking;

  // Check for BREAKING CHANGE: in commit body
  if (lines.length > 1) {
    const body = lines.slice(1).join('\n');
    if (body.includes('BREAKING CHANGE:')) {
      hasBreakingChange = true;
    }
  }

  // If there are validation issues, return error with proper message
  if (issues.length > 0) {
    let errorMessage = `Commit message validation failed: ${issues.join('; ')}`;

    // For empty description, use more specific message
    if (issues.some((issue) => issue.includes('description cannot be empty'))) {
      errorMessage = `Commit message validation failed: ${issues.join('; ')}`;
    }

    const error = createError<ValidationError>(
      'VALIDATION_FAILED',
      errorMessage,
      { message, issues, type, scope },
      ['Review and fix the validation issues above']
    );
    return Err(error);
  }

  const result: CommitValidation = {
    valid: true,
    type,
    ...(scope && { scope }),
    breaking: hasBreakingChange,
    issues: [],
  };
  return Ok(result);
}
