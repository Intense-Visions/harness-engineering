import type { Result } from '../../shared/result';
import { Ok } from '../../shared/result';
import type {
  EntropyError,
  CodebaseSnapshot,
  PatternConfig,
  PatternReport,
  PatternViolation,
  ConfigPattern,
  PatternMatch,
  SourceFile,
} from '../types';
import { readFileSync } from 'node:fs';
import { minimatch } from 'minimatch';
import { relativePosix } from '../../shared/fs-utils';

/**
 * Check if a file matches a glob pattern
 */
function fileMatchesPattern(filePath: string, pattern: string, rootDir: string): boolean {
  const relativePath = relativePosix(rootDir, filePath);
  return minimatch(relativePath, pattern);
}

const CONVENTION_DESCRIPTIONS: Record<string, string> = {
  camelCase: 'camelCase (e.g., myFunction)',
  PascalCase: 'PascalCase (e.g., MyClass)',
  UPPER_SNAKE: 'UPPER_SNAKE_CASE (e.g., MY_CONSTANT)',
  'kebab-case': 'kebab-case (e.g., my-component)',
};

type RuleChecker = (
  rule: ConfigPattern['rule'],
  file: SourceFile,
  message: string | undefined
) => PatternMatch[];

function checkMustExport(
  rule: ConfigPattern['rule'],
  file: SourceFile,
  message: string | undefined
): PatternMatch[] {
  if (rule.type !== 'must-export') return [];
  const matches: PatternMatch[] = [];
  for (const name of rule.names) {
    if (!file.exports.some((e) => e.name === name)) {
      matches.push({
        line: 1,
        message: message || `Missing required export: "${name}"`,
        suggestion: `Add export for "${name}"`,
      });
    }
  }
  return matches;
}

function checkMustExportDefault(
  _rule: ConfigPattern['rule'],
  file: SourceFile,
  message: string | undefined
): PatternMatch[] {
  if (!file.exports.some((e) => e.type === 'default')) {
    return [
      {
        line: 1,
        message: message || 'File must have a default export',
        suggestion: 'Add a default export',
      },
    ];
  }
  return [];
}

function checkNoExport(
  rule: ConfigPattern['rule'],
  file: SourceFile,
  message: string | undefined
): PatternMatch[] {
  if (rule.type !== 'no-export') return [];
  const matches: PatternMatch[] = [];
  for (const name of rule.names) {
    const exp = file.exports.find((e) => e.name === name);
    if (exp) {
      matches.push({
        line: exp.location.line,
        message: message || `Forbidden export: "${name}"`,
        suggestion: `Remove export "${name}"`,
      });
    }
  }
  return matches;
}

function checkMustImport(
  rule: ConfigPattern['rule'],
  file: SourceFile,
  message: string | undefined
): PatternMatch[] {
  if (rule.type !== 'must-import') return [];
  const hasImport = file.imports.some(
    (i) => i.source === rule.from || i.source.endsWith(rule.from)
  );
  if (!hasImport) {
    return [
      {
        line: 1,
        message: message || `Missing required import from "${rule.from}"`,
        suggestion: `Add import from "${rule.from}"`,
      },
    ];
  }
  return [];
}

function checkNoImport(
  rule: ConfigPattern['rule'],
  file: SourceFile,
  message: string | undefined
): PatternMatch[] {
  if (rule.type !== 'no-import') return [];
  const forbiddenImport = file.imports.find(
    (i) => i.source === rule.from || i.source.endsWith(rule.from)
  );
  if (forbiddenImport) {
    return [
      {
        line: forbiddenImport.location.line,
        message: message || `Forbidden import from "${rule.from}"`,
        suggestion: `Remove import from "${rule.from}"`,
      },
    ];
  }
  return [];
}

function checkNaming(
  rule: ConfigPattern['rule'],
  file: SourceFile,
  message: string | undefined
): PatternMatch[] {
  if (rule.type !== 'naming') return [];
  const regex = new RegExp(rule.match);
  const matches: PatternMatch[] = [];
  for (const exp of file.exports) {
    if (!regex.test(exp.name)) {
      const expected = CONVENTION_DESCRIPTIONS[rule.convention] ?? rule.convention;
      matches.push({
        line: exp.location.line,
        message: message || `"${exp.name}" does not follow ${rule.convention} convention`,
        suggestion: `Rename to follow ${expected}`,
      });
    }
  }
  return matches;
}

function checkMaxExports(
  rule: ConfigPattern['rule'],
  file: SourceFile,
  message: string | undefined
): PatternMatch[] {
  if (rule.type !== 'max-exports') return [];
  if (file.exports.length > rule.count) {
    return [
      {
        line: 1,
        message: message || `File has ${file.exports.length} exports, max is ${rule.count}`,
        suggestion: `Split into multiple files or reduce exports to ${rule.count}`,
      },
    ];
  }
  return [];
}

/**
 * Count a file's lines the way ESLint's `max-lines` does: every line counts
 * (blank and comment lines included — the rule has no skip options), any of
 * `\r\n`, `\r`, `\n`, U+2028, U+2029 ends a line, and the empty "line" after
 * a trailing line break is not counted. So `a\nb\n` and `a\nb` are both 2.
 */
function countLines(text: string): number {
  const lines = text.split(/\r\n|[\r\n\u2028\u2029]/);
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines.length;
}

/**
 * Flag a file with more than `rule.count` lines. `SourceFile` carries no
 * source text, so the file is read from `file.path` — lazily, and only for
 * files a `max-lines` rule applies to. The violation is reported at the first
 * line over the limit (`count + 1`), as ESLint does. A file that cannot be read
 * is reported, not passed: an unchecked file must never read as clean (#2324).
 */
function checkMaxLines(
  rule: ConfigPattern['rule'],
  file: SourceFile,
  message: string | undefined
): PatternMatch[] {
  if (rule.type !== 'max-lines') return [];
  let text: string;
  try {
    text = readFileSync(file.path, 'utf-8');
  } catch (e) {
    return [
      {
        line: 1,
        message: `Could not read file to check max-lines (${rule.count}): ${(e as Error).message}`,
        suggestion: 'Check that the file exists and is readable',
      },
    ];
  }
  const lineCount = countLines(text);
  if (lineCount > rule.count) {
    return [
      {
        line: Math.floor(rule.count) + 1,
        message: message || `File has ${lineCount} lines, max is ${rule.count}`,
        suggestion: `Split into smaller files or reduce to ${rule.count} lines`,
      },
    ];
  }
  return [];
}

function checkRequireJsdoc(
  _rule: ConfigPattern['rule'],
  file: SourceFile,
  message: string | undefined
): PatternMatch[] {
  if (file.jsDocComments.length === 0 && file.exports.length > 0) {
    return [
      {
        line: 1,
        message: message || 'Exported symbols require JSDoc documentation',
        suggestion: 'Add JSDoc comments to exports',
      },
    ];
  }
  return [];
}

/** Exhaustive over the rule-type union: a new rule type without a checker fails to compile. */
const RULE_CHECKERS: Record<ConfigPattern['rule']['type'], RuleChecker> = {
  'must-export': checkMustExport,
  'must-export-default': checkMustExportDefault,
  'no-export': checkNoExport,
  'must-import': checkMustImport,
  'no-import': checkNoImport,
  naming: checkNaming,
  'max-exports': checkMaxExports,
  'max-lines': checkMaxLines,
  'require-jsdoc': checkRequireJsdoc,
};

/**
 * Check a single config pattern against a file
 */
export function checkConfigPattern(
  pattern: ConfigPattern,
  file: SourceFile,
  rootDir: string
): PatternMatch[] {
  const fileMatches = pattern.files.some((glob) => fileMatchesPattern(file.path, glob, rootDir));
  if (!fileMatches) return [];

  const ruleType: string = pattern.rule.type;
  const checker = Object.hasOwn(RULE_CHECKERS, ruleType)
    ? RULE_CHECKERS[ruleType as keyof typeof RULE_CHECKERS]
    : undefined;
  if (!checker) {
    // Validated config cannot reach here (the schema is a discriminated union),
    // but a programmatic caller can. Report it: a rule that silently checks
    // nothing reads as a pass (#2324).
    return [
      {
        line: 1,
        message: `Unknown pattern rule type "${ruleType}" in "${pattern.name}": this rule was not checked`,
        suggestion: 'Use a supported rule type, or remove the rule',
      },
    ];
  }

  return checker(pattern.rule, file, pattern.message);
}

/**
 * Detect pattern violations across a codebase
 */
export async function detectPatternViolations(
  snapshot: CodebaseSnapshot,
  config?: PatternConfig
): Promise<Result<PatternReport, EntropyError>> {
  const violations: PatternViolation[] = [];
  const patterns = config?.patterns || [];

  // Check config patterns against each file
  for (const file of snapshot.files) {
    for (const pattern of patterns) {
      const matches = checkConfigPattern(pattern, file, snapshot.rootDir);

      for (const match of matches) {
        violations.push({
          pattern: pattern.name,
          file: file.path,
          line: match.line,
          message: match.message,
          suggestion: match.suggestion || 'Review and fix this pattern violation',
          severity: pattern.severity,
        });
      }
    }
  }

  // Check custom (code-level) patterns against each file
  if (config?.customPatterns) {
    for (const file of snapshot.files) {
      for (const custom of config.customPatterns) {
        const matches = custom.check(file, snapshot);
        for (const match of matches) {
          violations.push({
            pattern: custom.name,
            file: file.path,
            line: match.line,
            message: match.message,
            suggestion: match.suggestion || 'Review and fix this pattern violation',
            severity: custom.severity,
          });
        }
      }
    }
  }

  // Group by severity
  const errorCount = violations.filter((v) => v.severity === 'error').length;
  const warningCount = violations.filter((v) => v.severity === 'warning').length;

  // Calculate pass rate
  const customCount = config?.customPatterns?.length ?? 0;
  const allPatternsCount = patterns.length + customCount;
  const totalChecks = snapshot.files.length * allPatternsCount;
  const passRate =
    totalChecks > 0 ? Math.max(0, (totalChecks - violations.length) / totalChecks) : 1;

  return Ok({
    violations,
    stats: {
      filesChecked: snapshot.files.length,
      patternsApplied: allPatternsCount,
      violationCount: violations.length,
      errorCount,
      warningCount,
    },
    passRate,
  });
}
