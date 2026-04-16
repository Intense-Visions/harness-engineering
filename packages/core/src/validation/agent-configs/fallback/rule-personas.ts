import { glob } from 'glob';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentConfigFinding } from '../types';
import { makeFinding, readTextSafe, relPath } from './shared';

/**
 * Run persona-reference rule:
 *   HARNESS-AC-080 persona-skill-exists  (persona references a skill directory that does not exist)
 *
 * Persona YAMLs list skills under `skills:` as `- <slug>`. Each slug must map to
 * `agents/skills/<slug>/SKILL.md` somewhere under the project root.
 */
export async function runPersonaRules(cwd: string): Promise<AgentConfigFinding[]> {
  const findings: AgentConfigFinding[] = [];
  const personaFiles = await glob('agents/personas/**/*.y?(a)ml', { cwd, absolute: true });
  for (const abs of personaFiles) findings.push(...inspectPersonaFile(cwd, abs));
  return findings;
}

function inspectPersonaFile(cwd: string, abs: string): AgentConfigFinding[] {
  const rel = relPath(cwd, abs);
  const content = readTextSafe(abs);
  if (content === null) return [];
  const missing: AgentConfigFinding[] = [];
  for (const slug of extractSkillSlugs(content)) {
    if (skillExists(cwd, slug)) continue;
    missing.push(
      makeFinding({
        file: rel,
        ruleId: 'HARNESS-AC-080',
        severity: 'error',
        message: `Persona references skill '${slug}' but agents/skills/*/${slug}/SKILL.md does not exist`,
        suggestion: `Create the skill under agents/skills/ or remove '${slug}' from the persona`,
      })
    );
  }
  return missing;
}

function extractSkillSlugs(content: string): string[] {
  const slugs: string[] = [];
  const lines = content.split(/\r?\n/);
  let inSkills = false;
  let indent = 0;
  for (const line of lines) {
    const stripped = line.trimStart();
    const lineIndent = line.length - stripped.length;

    if (/^skills\s*:/.test(stripped)) {
      inSkills = true;
      indent = lineIndent;
      continue;
    }
    if (!inSkills) continue;

    // Exit the skills block when we hit a sibling key.
    if (stripped && lineIndent <= indent && !stripped.startsWith('-')) {
      inSkills = false;
      continue;
    }
    const match = /^-\s+([^\s#]+)/.exec(stripped);
    if (match) slugs.push(stripQuotes(match[1]!));
  }
  return slugs;
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/** Check the two canonical skill locations: `agents/skills/<slug>/SKILL.md` and with a platform prefix. */
function skillExists(cwd: string, slug: string): boolean {
  if (existsSync(join(cwd, 'agents', 'skills', slug, 'SKILL.md'))) return true;
  for (const platform of ['claude-code', 'gemini-cli', 'codex', 'cursor', 'shared']) {
    if (existsSync(join(cwd, 'agents', 'skills', platform, slug, 'SKILL.md'))) return true;
  }
  return false;
}
