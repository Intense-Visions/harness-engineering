import type { ContextBundle, ReviewFinding, ReviewAgentDescriptor } from '../types';
import { makeFindingId } from '../constants';

export const BUG_DETECTION_DESCRIPTOR: ReviewAgentDescriptor = {
  domain: 'bug',
  tier: 'strong',
  displayName: 'Bug Detection',
  focusAreas: [
    'Edge cases — boundary conditions, empty input, max values, null, concurrent access',
    'Error handling — errors handled at appropriate level, no silent swallowing',
    'Logic errors — off-by-one, incorrect boolean logic, missing early returns',
    'Race conditions — concurrent access to shared state',
    'Resource leaks — unclosed handles, missing cleanup in error paths',
    'Type safety — type mismatches, unsafe casts, missing null checks',
    'Test coverage — tests for happy path, error paths, and edge cases',
  ],
};

/**
 * Returns true when the lines preceding index i contain a zero-guard.
 */
function hasPrecedingZeroCheck(lines: string[], i: number): boolean {
  const preceding = lines.slice(Math.max(0, i - 3), i).join('\n');
  return (
    preceding.includes('=== 0') ||
    preceding.includes('!== 0') ||
    preceding.includes('== 0') ||
    preceding.includes('!= 0')
  );
}

/**
 * Detect potential division-by-zero issues.
 */
function detectDivisionByZero(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const cf of bundle.changedFiles) {
    const lines = cf.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      // Look for division operations that don't have a preceding zero check
      if (!line.match(/[^=!<>]\s*\/\s*[a-zA-Z_]\w*/) || line.includes('//')) continue;
      if (hasPrecedingZeroCheck(lines, i)) continue;
      findings.push({
        id: makeFindingId('bug', cf.path, i + 1, 'division by zero'),
        file: cf.path,
        lineRange: [i + 1, i + 1],
        domain: 'bug',
        severity: 'important',
        title: 'Potential division by zero without guard',
        rationale:
          'Division operation found without a preceding zero check on the divisor. This can cause Infinity or NaN at runtime.',
        suggestion: 'Add a check for zero before dividing, or use a safe division utility.',
        evidence: [`Line ${i + 1}: ${line.trim()}`],
        validatedBy: 'heuristic',
      });
    }
  }
  return findings;
}

/**
 * Returns true when the line at index i is an empty catch block.
 */
function isEmptyCatch(lines: string[], i: number): boolean {
  const line = lines[i]!;
  if (line.match(/catch\s*\([^)]*\)\s*\{\s*\}/)) return true;
  return (
    line.match(/catch\s*\([^)]*\)\s*\{/) !== null &&
    i + 1 < lines.length &&
    lines[i + 1]!.trim() === '}'
  );
}

/**
 * Detect empty catch blocks (silent error swallowing).
 */
function detectEmptyCatch(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const cf of bundle.changedFiles) {
    const lines = cf.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      // Match: catch (e) {} or catch(e){} or catch (e) { }
      if (!isEmptyCatch(lines, i)) continue;
      const line = lines[i]!;
      findings.push({
        id: makeFindingId('bug', cf.path, i + 1, 'empty catch block'),
        file: cf.path,
        lineRange: [i + 1, i + 2],
        domain: 'bug',
        severity: 'important',
        title: 'Empty catch block silently swallows error',
        rationale:
          'Catching an error without handling, logging, or re-throwing it hides failures and makes debugging difficult.',
        suggestion:
          'Log the error, re-throw it, or handle it explicitly. If intentionally ignoring, add a comment explaining why.',
        evidence: [`Line ${i + 1}: ${line.trim()}`],
        validatedBy: 'heuristic',
      });
    }
  }
  return findings;
}

/**
 * Detect missing test coverage.
 */
function detectMissingTests(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const hasTestFiles = bundle.contextFiles.some((f) => f.reason === 'test');

  if (!hasTestFiles) {
    // Check if any changed files are source files (not test files themselves)
    const sourceFiles = bundle.changedFiles.filter(
      (f) => !f.path.match(/\.(test|spec)\.(ts|tsx|js|jsx)$/)
    );
    if (sourceFiles.length > 0) {
      const firstFile = sourceFiles[0]!;
      findings.push({
        id: makeFindingId('bug', firstFile.path, 1, 'no test files'),
        file: firstFile.path,
        lineRange: [1, 1],
        domain: 'bug',
        severity: 'suggestion',
        title: 'No test files found for changed source files',
        rationale:
          'Changed source files should have corresponding test files. No test files were found in the review context.',
        evidence: [`Source files without tests: ${sourceFiles.map((f) => f.path).join(', ')}`],
        validatedBy: 'heuristic',
      });
    }
  }

  return findings;
}

/**
 * Run the bug detection review agent.
 *
 * Analyzes the context bundle for logic errors, edge cases, error handling issues,
 * and test coverage gaps. Produces ReviewFinding[] with domain 'bug'.
 */
export function runBugDetectionAgent(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];

  findings.push(...detectDivisionByZero(bundle));
  findings.push(...detectEmptyCatch(bundle));
  findings.push(...detectMissingTests(bundle));

  return findings;
}
