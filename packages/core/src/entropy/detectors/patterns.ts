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

function checkMaxLines(
  _rule: ConfigPattern['rule'],
  _file: SourceFile,
  _message: string | undefined
): PatternMatch[] {
  // Would need actual line count from file content
  // For now, skip this check (would need AST end location)
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

const RULE_CHECKERS: Record<string, RuleChecker> = {
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

  const checker = RULE_CHECKERS[pattern.rule.type];
  if (!checker) return [];

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
