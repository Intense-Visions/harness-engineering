import type { AgentDefinition } from './generator';
import { GENERATED_HEADER_AGENT } from './constants';

function tomlBasicString(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .replace(/\t/g, ' ');
  return `"${escaped}"`;
}

function tomlMultilineString(value: string): string {
  // Triple-quoted strings cannot contain three consecutive double quotes; escape
  // each quote in any such run so the literal text round-trips through TOML.
  const escaped = value.replace(/"{3,}/g, (run) =>
    run
      .split('')
      .map((ch) => `\\${ch}`)
      .join('')
  );
  return `"""\n${escaped}\n"""`;
}

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

function buildInstructionsBody(def: AgentDefinition): string {
  const sections: string[] = [];

  sections.push('## Role');
  sections.push('');
  sections.push(def.role);

  if (def.skills.length > 0) {
    sections.push('');
    sections.push('## Skills');
    sections.push('');
    for (const skill of def.skills) {
      sections.push(`- ${skill}`);
    }
  }

  if (def.steps.length > 0) {
    sections.push('');
    sections.push('## Steps');
    sections.push('');
    def.steps.forEach((step, i) => {
      sections.push(formatStep(step as Record<string, unknown>, i));
    });
  }

  if (def.methodology) {
    sections.push('');
    sections.push('## Methodology');
    sections.push('');
    sections.push(def.methodology);
  }

  return sections.join('\n');
}

export function renderCodexAgent(def: AgentDefinition): string {
  const lines: string[] = [];
  lines.push(`# ${GENERATED_HEADER_AGENT}`);
  lines.push('');
  lines.push(`name = ${tomlBasicString(def.name)}`);
  lines.push(`description = ${tomlBasicString(def.description)}`);
  lines.push(`developer_instructions = ${tomlMultilineString(buildInstructionsBody(def))}`);
  lines.push('');
  return lines.join('\n');
}
