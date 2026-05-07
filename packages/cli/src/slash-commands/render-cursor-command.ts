import type { SlashCommandSpec } from './types';
import { GENERATED_HEADER_CURSOR } from './types';

/**
 * Render a slash command for Cursor's plugin `commands/` directory.
 *
 * Cursor plugin commands use frontmatter `name` + `description` only
 * (no `argument-hint` or `allowed-tools` — those are Claude Code-specific).
 * Body keeps the same `<context>` / `<objective>` / `<execution_context>` /
 * `<process>` blocks since Cursor's LLM parses them similarly.
 *
 * Distinct from `renderCursor`, which produces Cursor *rules* format
 * (description + globs + alwaysApply) for the `harness setup` flow that
 * writes to `~/.cursor/rules/harness/`. The plugin path uses commands
 * because Cursor's plugin manifest distinguishes the two.
 *
 * Reference: https://cursor.com/docs/plugins/building
 */
export function renderCursorCommand(spec: SlashCommandSpec): string {
  const lines: string[] = ['---'];
  lines.push(`name: ${spec.fullName}`);
  lines.push(`description: ${spec.description}`);
  lines.push('---');
  lines.push('');
  lines.push(GENERATED_HEADER_CURSOR);
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
