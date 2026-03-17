import type { SlashCommandSpec } from './types';
import { GENERATED_HEADER_CLAUDE } from './types';
import { buildArgumentHint } from './argument-hint';

export function renderClaudeCode(spec: SlashCommandSpec): string {
  const lines: string[] = [GENERATED_HEADER_CLAUDE];

  lines.push('---');
  lines.push(`name: ${spec.fullName}`);
  lines.push(`description: ${spec.description}`);

  const hint = buildArgumentHint(spec.args);
  if (hint) {
    lines.push(`argument-hint: "${hint}"`);
  }

  if (spec.tools.length > 0) {
    lines.push('allowed-tools:');
    for (const tool of spec.tools) {
      lines.push(`  - ${tool}`);
    }
  }

  lines.push('---');
  lines.push('');

  lines.push('<context>');
  lines.push(spec.prompt.context);
  lines.push('</context>');
  lines.push('');

  lines.push('<objective>');
  lines.push(spec.prompt.objective);
  lines.push('</objective>');
  lines.push('');

  if (spec.prompt.executionContext) {
    lines.push('<execution_context>');
    lines.push(spec.prompt.executionContext);
    lines.push('</execution_context>');
    lines.push('');
  }

  lines.push('<process>');
  lines.push(spec.prompt.process);
  lines.push('</process>');
  lines.push('');

  return lines.join('\n');
}
