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
 * Extensions the source-scanning heuristics (division-by-zero, empty-catch)
 * apply to. These detectors read raw lines and match code patterns, so running
 * them on non-code files produces false positives — e.g. a `/` in a scoped
 * package name inside a Markdown changeset (`@scope/pkg`) reads as a division.
 */
const CODE_FILE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'];

/** True when `path` is a code file the line-pattern heuristics should scan. */
function isCodeFile(path: string): boolean {
  return CODE_FILE_EXTENSIONS.some((ext) => path.endsWith(ext));
}

/**
 * True when `path` is itself a test file — carries a `.test.` / `.spec.` /
 * `_test.` / `_spec.` infix (language-agnostic: `.test.ts`, `_test.py`,
 * `_test.go`, `.spec.tsx`, …). These are the files that *provide* coverage, so
 * their presence in a diff means the change is accompanied by tests.
 */
function isTestFile(path: string): boolean {
  return /(?:\.|_)(?:test|spec)\.[^./]+$/i.test(path);
}

/**
 * True when `path` is test-support scaffolding rather than a unit of production
 * code — it lives under a `test/` / `tests/` / `__tests__/` / `__mocks__/` /
 * `fixtures/` tree, is a `*-testkit.*` module, or is a `conftest.py`. Asking a
 * test kit to have its own test is a category error, so these must not land in
 * the "source files without tests" list (regression class fixed in canary#565).
 */
function isTestSupportFile(path: string): boolean {
  const p = path.toLowerCase();
  return (
    /(?:^|\/)(?:tests?|__tests__|__mocks__|fixtures?)\//.test(p) ||
    /-testkit\.[^./]+$/.test(p) ||
    /(?:^|\/)conftest\.py$/.test(p)
  );
}

/** Non-code suffixes / lockfiles that are never "source files requiring tests". */
const NON_SOURCE_EXTENSIONS = ['.md', '.markdown', '.txt', '.json', '.yaml', '.yml', '.lock'];
const LOCKFILE_BASENAMES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']);

/**
 * True when `path` is not source code that could carry tests — documentation,
 * config, or a lockfile. A `CHANGELOG.md` must not reach the source classifier
 * (it is not testable and also should not attract a file-size complaint).
 */
function isNonSourceFile(path: string): boolean {
  const p = path.toLowerCase();
  const base = p.split('/').pop() ?? p;
  if (LOCKFILE_BASENAMES.has(base)) return true;
  return NON_SOURCE_EXTENSIONS.some((ext) => p.endsWith(ext));
}

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
    if (!isCodeFile(cf.path)) continue;
    const lines = cf.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const trimmed = line.trimStart();
      // A scoped package path (`@scope/pkg`) in an import/export, a comment line,
      // or a URL (`//`) contains a `/` that is NOT division. Real division in a
      // prettier-formatted codebase is always spaced (`a / b`), so require
      // whitespace around the `/` and a variable/paren divisor. This drops the
      // `word/word` path false positives that flagged every scoped import.
      if (
        trimmed.startsWith('import ') ||
        trimmed.startsWith('export ') ||
        trimmed.startsWith('*') ||
        line.includes('//')
      )
        continue;
      // Divisor must be a lowercase variable or a parenthesised expression — a
      // SCREAMING_CASE constant (e.g. `/ DAY_MS`) or a numeric literal cannot be
      // zero at runtime, so flagging them is noise.
      if (!line.match(/[^=!<>*/]\s+\/\s+[a-z_(]/)) continue;
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
    if (!isCodeFile(cf.path)) continue;
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
  // Credit test files present in the DIFF itself, not only those pulled in as
  // context. A PR whose purpose is adding tests carries them in `changedFiles`;
  // the old code only inspected `contextFiles`, so it asserted "no test files
  // found" about a diff that contained several — inverting its own signal.
  const hasTestContext = bundle.contextFiles.some((f) => f.reason === 'test');
  const diffContainsTests = bundle.changedFiles.some((f) => isTestFile(f.path));
  const hasTestFiles = hasTestContext || diffContainsTests;

  if (!hasTestFiles) {
    // A "source file requiring a test" is code that is not itself a test, not
    // test-support scaffolding (test kits, fixtures, conftest), and not a
    // non-code file (docs/config/lockfiles like CHANGELOG.md).
    const sourceFiles = bundle.changedFiles.filter(
      (f) => !isTestFile(f.path) && !isTestSupportFile(f.path) && !isNonSourceFile(f.path)
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
