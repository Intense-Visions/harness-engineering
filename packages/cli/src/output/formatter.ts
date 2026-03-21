import chalk from 'chalk';

export const OutputMode = {
  JSON: 'json',
  TEXT: 'text',
  QUIET: 'quiet',
  VERBOSE: 'verbose',
} as const;

export type OutputModeType = (typeof OutputMode)[keyof typeof OutputMode];

interface ValidationIssue {
  file?: string;
  message: string;
  line?: number;
  suggestion?: string;
}

interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export class OutputFormatter {
  constructor(private mode: OutputModeType = OutputMode.TEXT) {}

  /**
   * Format raw data (for JSON mode)
   */
  format(data: unknown): string {
    if (this.mode === OutputMode.JSON) {
      return JSON.stringify(data, null, 2);
    }
    return String(data);
  }

  /**
   * Format validation result
   */
  formatValidation(result: ValidationResult): string {
    if (this.mode === OutputMode.JSON) {
      return JSON.stringify(result, null, 2);
    }

    if (this.mode === OutputMode.QUIET) {
      if (result.valid) return '';
      return result.issues.map((i) => `${i.file ?? ''}: ${i.message}`).join('\n');
    }

    const lines: string[] = [];

    if (result.valid) {
      lines.push(chalk.green('v validation passed'));
    } else {
      lines.push(chalk.red(`x Validation failed (${result.issues.length} issues)`));
      lines.push('');

      for (const issue of result.issues) {
        const location = issue.file
          ? issue.line
            ? `${issue.file}:${issue.line}`
            : issue.file
          : 'unknown';
        lines.push(`  ${chalk.yellow('*')} ${chalk.dim(location)}`);
        lines.push(`    ${issue.message}`);
        if (issue.suggestion && this.mode === OutputMode.VERBOSE) {
          lines.push(`    ${chalk.dim('->')} ${issue.suggestion}`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Format a summary line
   */
  formatSummary(label: string, value: string | number, success: boolean): string {
    if (this.mode === OutputMode.JSON || this.mode === OutputMode.QUIET) {
      return '';
    }
    const icon = success ? chalk.green('v') : chalk.red('x');
    return `${icon} ${label}: ${value}`;
  }
}

export interface ConventionalMarkdownEntry {
  type: string;
  title: string;
}

/**
 * Parse conventional markdown patterns (**[TYPE]** Title) from text.
 * Extracts structured data from display-only output using the harness
 * interaction surface conventions.
 */
export function parseConventionalMarkdown(text: string): ConventionalMarkdownEntry[] {
  const pattern =
    /\*\*\[(CRITICAL|IMPORTANT|SUGGESTION|STRENGTH|FIXED|Phase \d+\/\d+)\]\*\*\s+(.+)/g;
  const entries: ConventionalMarkdownEntry[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    entries.push({ type: match[1], title: match[2].trim() });
  }
  return entries;
}
