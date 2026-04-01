import type { SlashCommandSpec } from './types';
import { GENERATED_HEADER_CODEX } from './types';

export function renderCodexSkill(skillMdContent: string): string {
  return `<!-- ${GENERATED_HEADER_CODEX.replace(/<!--\s*|\s*-->/g, '').trim()} -->\n\n${skillMdContent}\n`;
}

export function renderCodexOpenaiYaml(spec: SlashCommandSpec): string {
  return [
    '# Reserved for Phase B native integration',
    `name: ${spec.skillYamlName}`,
    `version: "1.0.0"`,
    '',
  ].join('\n');
}

export function renderCodexAgentsMd(specs: SlashCommandSpec[]): string {
  const lines: string[] = [];
  lines.push(`<!-- ${GENERATED_HEADER_CODEX.replace(/<!--\s*|\s*-->/g, '').trim()} -->`);
  lines.push('');
  lines.push('# Harness Skills');
  lines.push('');
  lines.push(
    'This file bootstraps harness context for Codex CLI. Each skill is available as a structured workflow in the `harness/` directory.'
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
