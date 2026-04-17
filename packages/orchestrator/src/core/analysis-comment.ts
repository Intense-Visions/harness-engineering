import type { AnalysisRecord } from './analysis-archive';

/**
 * Renders an AnalysisRecord as a structured markdown comment.
 * Format: summary header + reasoning bullets + collapsible JSON with discriminator.
 *
 * Used by both the orchestrator auto-publish and the CLI publish-analyses command.
 */
export function renderAnalysisComment(record: AnalysisRecord): string {
  const lines: string[] = [];

  lines.push(`## Harness Analysis: ${record.identifier}`);
  lines.push('');

  if (record.score) {
    lines.push(
      `**Risk:** ${record.score.riskLevel} (${(record.score.confidence * 100).toFixed(0)}% confidence)`
    );
    lines.push(`**Route:** ${record.score.recommendedRoute}`);
  }
  lines.push(`**Analyzed:** ${record.analyzedAt}`);
  lines.push('');

  if (record.score && record.score.reasoning.length > 0) {
    for (const r of record.score.reasoning) {
      lines.push(`- ${r}`);
    }
    lines.push('');
  }

  // Collapsible details block with full AnalysisRecord + discriminator fields
  const jsonPayload = {
    _harness_analysis: true,
    _version: 1,
    ...record,
  };

  lines.push('<details>');
  lines.push('<summary>Full Analysis Data</summary>');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(jsonPayload, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('</details>');

  return lines.join('\n');
}
