import type {
  DeadCodeReport,
  DriftReport,
  PatternReport,
  Suggestion,
  SuggestionReport,
} from '../types';

/**
 * Generate suggestions from dead code report
 */
function generateDeadCodeSuggestions(report: DeadCodeReport): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // Suggest removing dead files
  for (const file of report.deadFiles) {
    suggestions.push({
      type: 'delete',
      priority: 'high',
      source: 'dead-code',
      relatedIssues: [`dead-file:${file.path}`],
      title: `Remove dead file: ${file.path.split('/').pop()}`,
      description: `This file is not imported by any other file and can be safely removed.`,
      files: [file.path],
      steps: [
        `Delete ${file.path}`,
        'Run tests to verify no regressions',
      ],
      whyManual: 'File deletion requires verification that no dynamic imports exist',
    });
  }

  // Suggest removing unused exports
  for (const exp of report.deadExports) {
    suggestions.push({
      type: 'refactor',
      priority: 'medium',
      source: 'dead-code',
      relatedIssues: [`dead-export:${exp.file}:${exp.name}`],
      title: `Remove unused export: ${exp.name}`,
      description: `The export "${exp.name}" is not used anywhere. Consider removing it.`,
      files: [exp.file],
      steps: [
        `Remove export "${exp.name}" from ${exp.file}`,
        'Run tests to verify no regressions',
      ],
      whyManual: 'Export removal may affect external consumers not in scope',
    });
  }

  // Suggest removing unused imports
  for (const imp of report.unusedImports) {
    suggestions.push({
      type: 'delete',
      priority: 'medium',
      source: 'dead-code',
      relatedIssues: [`unused-import:${imp.file}:${imp.specifiers.join(',')}`],
      title: `Remove unused import${imp.specifiers.length > 1 ? 's' : ''}: ${imp.specifiers.join(', ')}`,
      description: `The import${imp.specifiers.length > 1 ? 's' : ''} from "${imp.source}" ${imp.specifiers.length > 1 ? 'are' : 'is'} not used.`,
      files: [imp.file],
      steps: imp.isFullyUnused
        ? [`Remove entire import line from ${imp.file}`]
        : [`Remove unused specifiers (${imp.specifiers.join(', ')}) from import statement`],
      whyManual: 'Import removal can be auto-fixed',
    });
  }

  return suggestions;
}

/**
 * Generate suggestions from drift report
 */
function generateDriftSuggestions(report: DriftReport): Suggestion[] {
  const suggestions: Suggestion[] = [];

  for (const drift of report.drifts) {
    const priority = drift.confidence === 'high' ? 'high' : 'medium';

    suggestions.push({
      type: 'update-docs',
      priority,
      source: 'drift',
      relatedIssues: [`drift:${drift.docFile}:${drift.reference}`],
      title: `Fix documentation drift: ${drift.reference}`,
      description: drift.details,
      files: [drift.docFile],
      steps: [
        drift.suggestion || 'Review and update documentation',
        'Review documentation for accuracy',
      ],
      whyManual: 'Documentation updates require human judgment for accuracy',
    });
  }

  return suggestions;
}

/**
 * Generate suggestions from pattern report
 */
function generatePatternSuggestions(report: PatternReport): Suggestion[] {
  const suggestions: Suggestion[] = [];

  for (const violation of report.violations) {
    suggestions.push({
      type: 'refactor',
      priority: violation.severity === 'error' ? 'high' : 'low',
      source: 'pattern',
      relatedIssues: [`pattern:${violation.pattern}:${violation.file}`],
      title: `Fix pattern violation: ${violation.pattern}`,
      description: violation.message,
      files: [violation.file],
      steps: [violation.suggestion || 'Follow pattern guidelines'],
      whyManual: 'Pattern violations often require architectural decisions',
    });
  }

  return suggestions;
}

/**
 * Generate all suggestions from analysis reports
 */
export function generateSuggestions(
  deadCode?: DeadCodeReport,
  drift?: DriftReport,
  patterns?: PatternReport
): SuggestionReport {
  const suggestions: Suggestion[] = [];

  if (deadCode) {
    suggestions.push(...generateDeadCodeSuggestions(deadCode));
  }

  if (drift) {
    suggestions.push(...generateDriftSuggestions(drift));
  }

  if (patterns) {
    suggestions.push(...generatePatternSuggestions(patterns));
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  // Group by priority
  const byPriority = {
    high: suggestions.filter(s => s.priority === 'high'),
    medium: suggestions.filter(s => s.priority === 'medium'),
    low: suggestions.filter(s => s.priority === 'low'),
  };

  // Estimate effort
  let estimatedEffort: 'trivial' | 'small' | 'medium' | 'large';
  if (suggestions.length === 0) {
    estimatedEffort = 'trivial';
  } else if (suggestions.length <= 5) {
    estimatedEffort = 'small';
  } else if (suggestions.length <= 20) {
    estimatedEffort = 'medium';
  } else {
    estimatedEffort = 'large';
  }

  return {
    suggestions,
    byPriority,
    estimatedEffort,
  };
}
