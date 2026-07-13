import type { SELResult, CMLResult, PESLResult } from './types';

function appendSelIntent(lines: string[], sel: SELResult): void {
  lines.push('## Intent', '', sel.intent, '');
  lines.push('## Summary', '', sel.summary, '');
  if (sel.affectedSystems.length > 0) {
    lines.push('## Affected Systems', '');
    for (const sys of sel.affectedSystems) lines.push(`- ${sys.name}`);
    lines.push('');
  }
}

function appendCmlScore(lines: string[], cml: CMLResult): void {
  lines.push('## Complexity Score', '');
  lines.push(`- **Overall:** ${Math.round(cml.overall * 100)}%`);
  lines.push(`- **Structural:** ${Math.round(cml.dimensions.structural * 100)}%`);
  lines.push(`- **Semantic:** ${Math.round(cml.dimensions.semantic * 100)}%`);
  lines.push(`- **Historical:** ${Math.round(cml.dimensions.historical * 100)}%`);
  lines.push(
    `- **Blast Radius:** ${cml.blastRadius.services} services, ${cml.blastRadius.modules} modules, ~${cml.blastRadius.filesEstimated} files`
  );
  lines.push('');
}

function appendBulletSection(lines: string[], heading: string, items: string[]): void {
  if (items.length === 0) return;
  lines.push(heading, '');
  for (const item of items) lines.push(`- ${item}`);
  lines.push('');
}

function appendPeslSection(lines: string[], pesl: PESLResult): void {
  lines.push('## Simulation (PESL)', '');
  lines.push(`**Execution Confidence:** ${Math.round(pesl.executionConfidence * 100)}%`);
  lines.push('');
  if (pesl.simulatedPlan.length > 0) {
    lines.push('### Simulated Plan', '');
    pesl.simulatedPlan.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    lines.push('');
  }
  appendBulletSection(lines, '### Predicted Failures', pesl.predictedFailures);
  appendBulletSection(lines, '### Recommended Changes', pesl.recommendedChanges);
}

export function buildSpecMarkdown(
  title: string,
  sel: SELResult | null,
  cml: CMLResult | null,
  pesl: PESLResult | null
): string {
  const lines: string[] = [`# Spec: ${title}`, ''];
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  if (cml) {
    lines.push(`**Route Recommendation:** ${cml.recommendedRoute}`);
    lines.push(`**Risk Level:** ${cml.riskLevel}`);
  }
  lines.push('');

  if (sel) appendSelIntent(lines, sel);
  if (cml) appendCmlScore(lines, cml);
  if (sel) {
    appendBulletSection(lines, '## Unknowns', sel.unknowns);
    appendBulletSection(lines, '## Ambiguities', sel.ambiguities);
    appendBulletSection(lines, '## Risk Signals', sel.riskSignals);
  }
  if (pesl) appendPeslSection(lines, pesl);

  return lines.join('\n');
}
