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
import { relative } from 'path';

/**
 * Check if a file matches a glob pattern
 */
function fileMatchesPattern(filePath: string, pattern: string, rootDir: string): boolean {
  const relativePath = relative(rootDir, filePath);
  return minimatch(relativePath, pattern);
}

/**
 * Check a single config pattern against a file
 */
export function checkConfigPattern(
  pattern: ConfigPattern,
  file: SourceFile,
  rootDir: string
): PatternMatch[] {
  const matches: PatternMatch[] = [];

  // Check if file matches any of the pattern's file globs
  const fileMatches = pattern.files.some((glob) => fileMatchesPattern(file.path, glob, rootDir));
  if (!fileMatches) {
    return matches; // Pattern doesn't apply to this file
  }

  const rule = pattern.rule;

  switch (rule.type) {
    case 'must-export': {
      for (const name of rule.names) {
        const hasExport = file.exports.some((e) => e.name === name);
        if (!hasExport) {
          matches.push({
            line: 1,
            message: pattern.message || `Missing required export: "${name}"`,
            suggestion: `Add export for "${name}"`,
          });
        }
      }
      break;
    }

    case 'must-export-default': {
      const hasDefault = file.exports.some((e) => e.type === 'default');
      if (!hasDefault) {
        matches.push({
          line: 1,
          message: pattern.message || 'File must have a default export',
          suggestion: 'Add a default export',
        });
      }
      break;
    }

    case 'no-export': {
      for (const name of rule.names) {
        const exp = file.exports.find((e) => e.name === name);
        if (exp) {
          matches.push({
            line: exp.location.line,
            message: pattern.message || `Forbidden export: "${name}"`,
            suggestion: `Remove export "${name}"`,
          });
        }
      }
      break;
    }

    case 'must-import': {
      const hasImport = file.imports.some(
        (i) => i.source === rule.from || i.source.endsWith(rule.from)
      );
      if (!hasImport) {
        matches.push({
          line: 1,
          message: pattern.message || `Missing required import from "${rule.from}"`,
          suggestion: `Add import from "${rule.from}"`,
        });
      }
      break;
    }

    case 'no-import': {
      const forbiddenImport = file.imports.find(
        (i) => i.source === rule.from || i.source.endsWith(rule.from)
      );
      if (forbiddenImport) {
        matches.push({
          line: forbiddenImport.location.line,
          message: pattern.message || `Forbidden import from "${rule.from}"`,
          suggestion: `Remove import from "${rule.from}"`,
        });
      }
      break;
    }

    case 'naming': {
      const regex = new RegExp(rule.match);
      for (const exp of file.exports) {
        if (!regex.test(exp.name)) {
          let expected = '';
          switch (rule.convention) {
            case 'camelCase':
              expected = 'camelCase (e.g., myFunction)';
              break;
            case 'PascalCase':
              expected = 'PascalCase (e.g., MyClass)';
              break;
            case 'UPPER_SNAKE':
              expected = 'UPPER_SNAKE_CASE (e.g., MY_CONSTANT)';
              break;
            case 'kebab-case':
              expected = 'kebab-case (e.g., my-component)';
              break;
          }
          matches.push({
            line: exp.location.line,
            message:
              pattern.message || `"${exp.name}" does not follow ${rule.convention} convention`,
            suggestion: `Rename to follow ${expected}`,
          });
        }
      }
      break;
    }

    case 'max-exports': {
      if (file.exports.length > rule.count) {
        matches.push({
          line: 1,
          message:
            pattern.message || `File has ${file.exports.length} exports, max is ${rule.count}`,
          suggestion: `Split into multiple files or reduce exports to ${rule.count}`,
        });
      }
      break;
    }

    case 'max-lines': {
      // Would need actual line count from file content
      // For now, skip this check (would need AST end location)
      break;
    }

    case 'require-jsdoc': {
      // Would need to check JSDoc comments on exports
      // For now, check if jsDocComments is empty
      if (file.jsDocComments.length === 0 && file.exports.length > 0) {
        matches.push({
          line: 1,
          message: pattern.message || 'Exported symbols require JSDoc documentation',
          suggestion: 'Add JSDoc comments to exports',
        });
      }
      break;
    }
  }

  return matches;
}

/**
 * Detect pattern violations across a codebase
 */
// eslint-disable-next-line @typescript-eslint/require-await
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

  // Group by severity
  const errorCount = violations.filter((v) => v.severity === 'error').length;
  const warningCount = violations.filter((v) => v.severity === 'warning').length;

  // Calculate pass rate
  const totalChecks = snapshot.files.length * patterns.length;
  const passRate = totalChecks > 0 ? (totalChecks - violations.length) / totalChecks : 1;

  return Ok({
    violations,
    stats: {
      filesChecked: snapshot.files.length,
      patternsApplied: patterns.length,
      violationCount: violations.length,
      errorCount,
      warningCount,
    },
    passRate,
  });
}
