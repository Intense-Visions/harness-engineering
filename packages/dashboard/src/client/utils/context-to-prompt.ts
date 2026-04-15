import type { SkillEntry } from '../types/skills';
import type {
  ChecksData,
  SecurityResult,
  PerfResult,
  ArchResult,
  SecurityFindingSummary,
  PerfViolationSummary,
} from '../../shared/types';

/**
 * Transforms raw context data into a human-readable summary for the BriefingPanel.
 */
export function generateBriefingSummary(skill: SkillEntry, data: Record<string, unknown>): string {
  const checks = data['/api/checks'] as ChecksData | undefined;
  if (!checks) return 'No specific context data found for this skill.';

  switch (skill.category) {
    case 'security':
      return formatSecuritySummary(checks.security);
    case 'performance':
      return formatPerfSummary(checks.perf);
    case 'architecture':
      return formatArchSummary(checks.arch);
    case 'health':
      return 'Analyzing overall project health and implementation artifacts.';
    default:
      return skill.description;
  }
}

/**
 * Transforms raw context data into a detailed system prompt for the AI.
 */
export function generateSystemPrompt(skill: SkillEntry, data: Record<string, unknown>): string {
  const checks = data['/api/checks'] as ChecksData | undefined;
  const parts: string[] = [
    `You are launching the harness skill: ${skill.name} (${skill.id}).`,
    `Goal: ${skill.description}`,
    '',
  ];

  if (checks) {
    if (skill.category === 'security') {
      parts.push('## Security Context', formatSecurityDetails(checks.security));
    } else if (skill.category === 'performance') {
      parts.push('## Performance Context', formatPerfDetails(checks.perf));
    } else if (skill.category === 'architecture') {
      parts.push('## Architecture Context', formatArchDetails(checks.arch));
    }
  }

  parts.push(
    '',
    '## Instructions',
    `Please proceed with the ${skill.name} task. Use the provided context to prioritize your analysis and remediation efforts.`,
    'If specific files are mentioned in the context, start by examining those files.'
  );

  return parts.join('\n');
}

// --- Formatters ---

function formatSecuritySummary(res: SecurityResult): string {
  if ('error' in res) return `Security scan error: ${res.error}`;
  if (res.stats.errorCount === 0 && res.stats.warningCount === 0) {
    return 'No security issues found in the latest scan.';
  }
  return `Found ${res.stats.errorCount} errors and ${res.stats.warningCount} warnings across ${res.stats.filesScanned} files.`;
}

function formatSecurityDetails(res: SecurityResult): string {
  if ('error' in res) return `Error: ${res.error}`;
  return res.findings
    .map(
      (f: SecurityFindingSummary) =>
        `- [${f.severity}] ${f.ruleId} in ${f.file}:${f.line}: ${f.message}`
    )
    .join('\n');
}

function formatPerfSummary(res: PerfResult): string {
  if ('error' in res) return `Performance audit error: ${res.error}`;
  if (res.stats.violationCount === 0) {
    return 'No performance violations detected.';
  }
  return `Found ${res.stats.violationCount} performance violations in ${res.stats.filesAnalyzed} files.`;
}

function formatPerfDetails(res: PerfResult): string {
  if ('error' in res) return `Error: ${res.error}`;
  return res.violations
    .map(
      (v: PerfViolationSummary) =>
        `- [${v.severity}] ${v.metric} in ${v.file}: ${v.value} (threshold: ${v.threshold})`
    )
    .join('\n');
}

function formatArchSummary(res: ArchResult): string {
  if ('error' in res) return `Architecture check error: ${res.error}`;
  if (res.totalViolations === 0) {
    return 'No architectural violations found.';
  }
  return `Found ${res.totalViolations} architectural violations across the codebase.`;
}

function formatArchDetails(res: ArchResult): string {
  if ('error' in res) return `Error: ${res.error}`;
  return res.newViolations.map((v) => `- [${v.severity}] ${v.file}: ${v.detail}`).join('\n');
}
