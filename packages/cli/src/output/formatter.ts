import chalk from 'chalk';

/**
 * Supported output modes for the CLI.
 */
export const OutputMode = {
  /** Output as formatted JSON */
  JSON: 'json',
  /** Output as human-readable text */
  TEXT: 'text',
  /** Minimal output, only errors and successes */
  QUIET: 'quiet',
  /** Full output with detailed context and suggestions */
  VERBOSE: 'verbose',
} as const;

/**
 * Type representing one of the supported output modes.
 */
export type OutputModeType = (typeof OutputMode)[keyof typeof OutputMode];

/**
 * Represents a single issue discovered during validation.
 */
interface ValidationIssue {
  /** The file where the issue was found */
  file?: string;
  /** A human-readable description of the issue */
  message: string;
  /** The line number where the issue occurs */
  line?: number;
  /** A suggested fix or next step */
  suggestion?: string;
}

/**
 * The result of a validation operation.
 */
interface ValidationResult {
  /** Whether the validation passed overall */
  valid: boolean;
  /** A list of issues found during validation */
  issues: ValidationIssue[];
}

/** Append formatted lines for a single validation issue into the lines array. */
function appendIssueLines(lines: string[], issue: ValidationIssue, mode: OutputModeType): void {
  const location = issue.file ? (issue.line ? `${issue.file}:${issue.line}` : issue.file) : 'unknown';
  lines.push(`  ${chalk.yellow('*')} ${chalk.dim(location)}`);
  lines.push(`    ${issue.message}`);
  if (issue.suggestion && mode === OutputMode.VERBOSE) {
    lines.push(`    ${chalk.dim('->')} ${issue.suggestion}`);
  }
}

/**
 * Formats data and results for CLI output based on the selected mode.
 */
export class OutputFormatter {
  /**
   * Creates a new OutputFormatter.
   *
   * @param mode - The output mode to use. Defaults to TEXT.
   */
  constructor(private mode: OutputModeType = OutputMode.TEXT) {}

  /**
   * Formats raw data for output.
   *
   * @param data - The data to format.
   * @returns A string representation of the data based on the current mode.
   */
  format(data: unknown): string {
    if (this.mode === OutputMode.JSON) {
      return JSON.stringify(data, null, 2);
    }
    return String(data);
  }

  /**
   * Formats a validation result into a user-friendly string.
   *
   * @param result - The validation result to format.
   * @returns A formatted string containing the validation status and any issues.
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
        appendIssueLines(lines, issue, this.mode);
      }
    }

    return lines.join('\n');
  }

  /**
   * Formats a summary line with a success/failure icon and label.
   *
   * @param label - The name of the field to summarize.
   * @param value - The value to display.
   * @param success - Whether the summary represents a success or failure state.
   * @returns A formatted summary string, or an empty string in JSON or QUIET modes.
   */
  formatSummary(label: string, value: string | number, success: boolean): string {
    if (this.mode === OutputMode.JSON || this.mode === OutputMode.QUIET) {
      return '';
    }
    const icon = success ? chalk.green('v') : chalk.red('x');
    return `${icon} ${label}: ${value}`;
  }
}

/**
 * Represents a parsed entry from conventional markdown text.
 */
export interface ConventionalMarkdownEntry {
  /** The bracketed type (e.g. CRITICAL, Phase 1/2) */
  type: string;
  /** The text following the bracketed type */
  title: string;
}

/**
 * Parses conventional markdown patterns (**[TYPE]** Title) from text.
 * Extracts structured data from display-only output using the harness
 * interaction surface conventions.
 *
 * @param text - The markdown text to parse.
 * @returns An array of parsed markdown entries.
 */
export function parseConventionalMarkdown(text: string): ConventionalMarkdownEntry[] {
  const pattern =
    /\*\*\[(CRITICAL|IMPORTANT|SUGGESTION|STRENGTH|FIXED|Phase \d+\/\d+)\]\*\*\s+(.+)/g;
  const entries: ConventionalMarkdownEntry[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    entries.push({ type: match[1]!, title: match[2]!.trim() });
  }
  return entries;
}
