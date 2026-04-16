import { glob } from 'glob';
import type { AgentConfigFinding } from '../types';
import {
  extractFrontmatter,
  makeFinding,
  parseFrontmatterFields,
  readTextSafe,
  relPath,
} from './shared';

const MIN_DESCRIPTION_LENGTH = 20;

/**
 * Run agent-definition frontmatter rules:
 *   HARNESS-AC-010 agent-frontmatter   (missing/malformed YAML frontmatter)
 *   HARNESS-AC-011 agent-name          (missing name or mismatched with filename)
 *   HARNESS-AC-012 agent-description   (missing or too short to win routing)
 */
export async function runAgentRules(cwd: string): Promise<AgentConfigFinding[]> {
  // Only inspect files that look like agent or slash-command definitions.
  // Skip skills (handled by rule-skills), READMEs, and documentation files like AGENTS.md / CLAUDE.md
  // that ship as context bootstraps rather than as routed agent definitions.
  const files = await glob('agents/**/*.md', {
    cwd,
    absolute: true,
    ignore: ['**/skills/**', '**/README.md', '**/SKILL.md', '**/AGENTS.md', '**/CLAUDE.md'],
  });
  const findings: AgentConfigFinding[] = [];
  for (const abs of files) {
    findings.push(...inspectAgentFile(cwd, abs));
  }
  return findings;
}

function inspectAgentFile(cwd: string, abs: string): AgentConfigFinding[] {
  const rel = relPath(cwd, abs);
  const content = readTextSafe(abs);
  if (content === null) return [];

  const fm = extractFrontmatter(content);
  if (!fm) {
    return [
      makeFinding({
        file: rel,
        ruleId: 'HARNESS-AC-010',
        severity: 'error',
        message: 'Agent definition is missing YAML frontmatter (--- ... ---)',
        suggestion: 'Add a frontmatter block with at least `name` and `description`',
        line: 1,
      }),
    ];
  }

  const fields = parseFrontmatterFields(fm.body);
  const baseName = rel.split('/').pop()?.replace(/\.md$/, '') ?? '';
  const out: AgentConfigFinding[] = [];
  appendNameFindings(out, rel, baseName, fields.name);
  appendDescriptionFindings(out, rel, fields.description);
  return out;
}

function appendNameFindings(
  out: AgentConfigFinding[],
  rel: string,
  baseName: string,
  name: string | undefined
): void {
  if (!name) {
    out.push(
      makeFinding({
        file: rel,
        ruleId: 'HARNESS-AC-011',
        severity: 'error',
        message: 'Agent frontmatter is missing required `name` field',
        suggestion: `Add 'name: ${baseName}' to the frontmatter`,
      })
    );
  } else if (baseName && name !== baseName) {
    out.push(
      makeFinding({
        file: rel,
        ruleId: 'HARNESS-AC-011',
        severity: 'warning',
        message: `Agent name '${name}' does not match filename '${baseName}'`,
        suggestion: `Rename file or set 'name: ${baseName}' so the router resolves both to the same agent`,
      })
    );
  }
}

function appendDescriptionFindings(
  out: AgentConfigFinding[],
  rel: string,
  description: string | undefined
): void {
  if (!description) {
    out.push(
      makeFinding({
        file: rel,
        ruleId: 'HARNESS-AC-012',
        severity: 'error',
        message: 'Agent frontmatter is missing required `description` field',
        suggestion: 'Add a task-aware description so the router picks this agent',
      })
    );
  } else if (description.length < MIN_DESCRIPTION_LENGTH) {
    out.push(
      makeFinding({
        file: rel,
        ruleId: 'HARNESS-AC-012',
        severity: 'warning',
        message: `Agent description is only ${description.length} characters — too short to win routing`,
        suggestion: 'Write a one-paragraph description claiming concrete user tasks',
      })
    );
  }
}
