import type { SlashCommandSpec } from './types';
import { GENERATED_HEADER_CODEX } from './types';

function yamlString(value: string): string {
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

function generatedHeaderLabel(): string {
  return GENERATED_HEADER_CODEX.replace(/<!--\s*|\s*-->/g, '').trim();
}

export function renderCodexSkill(skillMdContent: string, spec: SlashCommandSpec): string {
  const body = stripExistingFrontmatter(skillMdContent);
  const lines: string[] = [];
  lines.push('---');
  lines.push(`name: ${yamlString(spec.skillYamlName)}`);
  lines.push(`description: ${yamlString(spec.description)}`);
  lines.push('---');
  lines.push('');
  lines.push(`<!-- ${generatedHeaderLabel()} -->`);
  lines.push('');
  lines.push(body);
  return lines.join('\n') + (body.endsWith('\n') ? '' : '\n');
}

function stripExistingFrontmatter(content: string): string {
  if (!content.startsWith('---\n')) return content;
  const end = content.indexOf('\n---\n', 4);
  if (end === -1) return content;
  return content.slice(end + 5);
}

export function renderCodexOpenaiYaml(spec: SlashCommandSpec): string {
  return [
    `name: ${yamlString(spec.skillYamlName)}`,
    `description: ${yamlString(spec.description)}`,
    `version: "${spec.version}"`,
    '',
  ].join('\n');
}

export function renderCodexAgentsMd(specs: SlashCommandSpec[]): string {
  const lines: string[] = [];
  lines.push(`<!-- ${generatedHeaderLabel()} -->`);
  lines.push('');
  lines.push('# Harness Skills');
  lines.push('');
  lines.push(
    'This file bootstraps harness context for Codex CLI. Each skill is available as a structured workflow in the `skills/` directory.'
  );
  lines.push('');
  lines.push('## Available Skills');
  lines.push('');

  for (const spec of specs) {
    lines.push(`- **${spec.skillYamlName}** — ${spec.description}`);
  }

  lines.push('');
  return lines.join('\n');
}
