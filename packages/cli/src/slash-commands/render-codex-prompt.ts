import type { SlashCommandSpec } from './types';
import { GENERATED_HEADER_CODEX } from './types';

function escapeYamlScalar(value: string): string {
  const startsSpecial = /^[\s?:\-#&*!|>'"%@`{}[\],]/.test(value);
  const endsSpace = /\s$/.test(value);
  const hasColonSpace = /:\s/.test(value);
  const hasCommentMarker = /\s#/.test(value);
  const hasQuoteChar = /["'`]/.test(value);
  const needsQuoting =
    value === '' || startsSpecial || endsSpace || hasColonSpace || hasCommentMarker || hasQuoteChar;
  if (!needsQuoting) return value;
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

export function renderCodexPrompt(spec: SlashCommandSpec): string {
  const lines: string[] = [];
  lines.push('---');
  lines.push(`description: ${escapeYamlScalar(spec.description)}`);
  if (spec.args && spec.args.length > 0) {
    const hint = spec.args.map((a) => (a.required ? `<${a.name}>` : `[${a.name}]`)).join(' ');
    lines.push(`argument-hint: ${escapeYamlScalar(hint)}`);
  }
  lines.push('---');
  lines.push('');
  lines.push(GENERATED_HEADER_CODEX);
  lines.push('');
  lines.push(
    `Use the \`${spec.skillYamlName}\` skill (installed at \`~/.codex/skills/${spec.skillYamlName}/SKILL.md\`) to handle the following request. Follow that skill's process exactly — do not improvise an alternative workflow.`
  );
  lines.push('');
  lines.push('$ARGUMENTS');
  lines.push('');
  return lines.join('\n');
}
