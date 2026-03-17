import type { SlashCommandSpec } from './types';
import { GENERATED_HEADER_GEMINI } from './types';

function escapeToml(content: string): string {
  return content.replace(/"""/g, '""\\"');
}

export function renderGemini(
  spec: SlashCommandSpec,
  skillMdContent: string,
  skillYamlContent: string
): string {
  const lines: string[] = [GENERATED_HEADER_GEMINI];

  const safeDesc = spec.description.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  lines.push(`description = "${safeDesc}"`);
  lines.push('prompt = """');

  lines.push('<context>');
  lines.push(spec.prompt.context);
  lines.push('</context>');
  lines.push('');

  lines.push('<objective>');
  lines.push(spec.prompt.objective);
  lines.push('</objective>');
  lines.push('');

  if (skillMdContent || skillYamlContent) {
    lines.push('<execution_context>');
    if (skillMdContent) {
      const mdPath = spec.prompt.executionContext.split('\n')[0]?.replace(/^@/, '') ?? '';
      lines.push(`--- SKILL.md (${mdPath}) ---`);
      lines.push(escapeToml(skillMdContent));
      lines.push('');
    }
    if (skillYamlContent) {
      const refs = spec.prompt.executionContext.split('\n');
      const yamlPath = (refs[1] ?? refs[0] ?? '').replace(/^@/, '');
      lines.push(`--- skill.yaml (${yamlPath}) ---`);
      lines.push(escapeToml(skillYamlContent));
    }
    lines.push('</execution_context>');
    lines.push('');
  }

  const geminiProcess = spec.prompt.process.replace(
    'read SKILL.md and follow its workflow directly',
    'follow the SKILL.md workflow provided above directly'
  );
  lines.push('<process>');
  lines.push(geminiProcess);
  lines.push('</process>');

  lines.push('"""');
  lines.push('');

  return lines.join('\n');
}
