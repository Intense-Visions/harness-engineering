import type { AgentDefinition } from './generator';
import { GENERATED_HEADER_AGENT } from './constants';

function formatStep(step: Record<string, unknown>, index: number): string {
  if ('command' in step && step.command) {
    const cmd = step.command as string;
    const when = (step.when as string) ?? 'always';
    return `${index + 1}. Run \`harness ${cmd}\` (${when})`;
  }
  if ('skill' in step && step.skill) {
    const skill = step.skill as string;
    const when = (step.when as string) ?? 'always';
    return `${index + 1}. Execute ${skill} skill (${when})`;
  }
  return `${index + 1}. Unknown step`;
}

/**
 * Render an agent definition for Cursor's plugin `agents/` directory.
 *
 * Cursor's frontmatter uses `name` + `description` only — no `tools` field
 * (tool availability is controlled by Cursor's own permission model). The
 * body mirrors Claude/Gemini renderers (Role / Skills / Steps / Methodology).
 *
 * Reference: https://cursor.com/docs/plugins/building
 */
export function renderCursorAgent(def: AgentDefinition): string {
  const lines: string[] = ['---'];
  lines.push(`name: ${def.name}`);
  lines.push(`description: >`);
  lines.push(`  ${def.description}`);
  lines.push('---');
  lines.push('');
  lines.push(GENERATED_HEADER_AGENT);
  lines.push('');
  lines.push('## Role');
  lines.push('');
  lines.push(def.role);
  lines.push('');
  lines.push('## Skills');
  lines.push('');
  for (const skill of def.skills) {
    lines.push(`- ${skill}`);
  }
  lines.push('');
  lines.push('## Steps');
  lines.push('');
  def.steps.forEach((step, i) => {
    lines.push(formatStep(step as Record<string, unknown>, i));
  });
  lines.push('');
  if (def.methodology) {
    lines.push('## Methodology');
    lines.push('');
    lines.push(def.methodology);
    lines.push('');
  }
  return lines.join('\n');
}
