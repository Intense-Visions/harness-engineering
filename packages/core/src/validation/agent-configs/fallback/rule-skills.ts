import { glob } from 'glob';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { AgentConfigFinding } from '../types';
import {
  extractFrontmatter,
  makeFinding,
  parseFrontmatterFields,
  readTextSafe,
  relPath,
} from './shared';

/**
 * Run skill-definition rules:
 *   HARNESS-AC-030 skill-reachable     (SKILL.md not referenced by any persona, agent, or command)
 *   HARNESS-AC-031 skill-frontmatter   (missing name/description)
 *   HARNESS-AC-032 skill-name-match    (frontmatter name does not match directory name)
 */
export async function runSkillRules(cwd: string): Promise<AgentConfigFinding[]> {
  const findings: AgentConfigFinding[] = [];
  const skillFiles = await glob('agents/skills/**/SKILL.md', { cwd, absolute: true });
  if (skillFiles.length === 0) return findings;

  const references = await collectReferenceCorpus(cwd);

  for (const abs of skillFiles) {
    const rel = relPath(cwd, abs);
    const dirName = basename(dirname(abs));
    const siblingYaml = join(dirname(abs), 'skill.yaml');

    // Harness-convention skills carry metadata in a sibling `skill.yaml` — in that case,
    // the SKILL.md file is allowed to use a plain markdown heading instead of frontmatter.
    if (existsSync(siblingYaml)) {
      const yamlFields = parseFrontmatterFields(readTextSafe(siblingYaml) ?? '');
      findings.push(...checkSkillMetadata(relPath(cwd, siblingYaml), dirName, yamlFields));
    } else {
      findings.push(...checkSkillFromMarkdown(abs, rel, dirName));
    }

    // Unreachable detection is informational — skills can be loaded by directory glob at runtime,
    // so a missing name reference does not always mean the skill is dead.
    if (!references.has(dirName)) {
      findings.push(
        makeFinding({
          file: rel,
          ruleId: 'HARNESS-AC-030',
          severity: 'info',
          message: `Skill '${dirName}' has no explicit reference in personas, agents, or commands`,
          suggestion: `Reference '${dirName}' somewhere, or confirm it is loaded by a directory glob`,
        })
      );
    }
  }
  return findings;
}

/** Validate name/description on either a skill.yaml or an extracted SKILL.md frontmatter. */
function checkSkillMetadata(
  file: string,
  dirName: string,
  fields: Record<string, string>
): AgentConfigFinding[] {
  const out: AgentConfigFinding[] = [];
  if (!fields.name) {
    out.push(
      makeFinding({
        file,
        ruleId: 'HARNESS-AC-031',
        severity: 'error',
        message: `${file.endsWith('.yaml') ? 'skill.yaml' : 'Skill frontmatter'} missing required \`name\` field`,
        suggestion: `Add 'name: ${dirName}'`,
      })
    );
  } else if (fields.name !== dirName) {
    out.push(
      makeFinding({
        file,
        ruleId: 'HARNESS-AC-032',
        severity: 'warning',
        message: `Skill name '${fields.name}' does not match directory '${dirName}'`,
        suggestion: `Rename directory or set 'name: ${dirName}'`,
      })
    );
  }
  if (!fields.description) {
    out.push(
      makeFinding({
        file,
        ruleId: 'HARNESS-AC-031',
        severity: 'warning',
        message: `${file.endsWith('.yaml') ? 'skill.yaml' : 'Skill frontmatter'} missing \`description\` field`,
        suggestion: 'Add a one-line description so recommenders can surface this skill',
      })
    );
  }
  return out;
}

/** Validate a SKILL.md file that has no sibling skill.yaml. */
function checkSkillFromMarkdown(abs: string, rel: string, dirName: string): AgentConfigFinding[] {
  const content = readTextSafe(abs);
  if (content === null) return [];
  const fm = extractFrontmatter(content);
  if (!fm) {
    return [
      makeFinding({
        file: rel,
        ruleId: 'HARNESS-AC-031',
        severity: 'error',
        message: 'SKILL.md is missing YAML frontmatter and no sibling skill.yaml was found',
        suggestion: 'Add frontmatter with at least `name` and `description`, or create skill.yaml',
        line: 1,
      }),
    ];
  }
  return checkSkillMetadata(rel, dirName, parseFrontmatterFields(fm.body));
}

/**
 * Collect a set of identifier tokens found in persona YAMLs, agent markdown files,
 * and slash command files so we can check whether each skill is referenced anywhere.
 */
async function collectReferenceCorpus(cwd: string): Promise<Set<string>> {
  const corpus = new Set<string>();
  const patterns = [
    'agents/personas/**/*.yaml',
    'agents/personas/**/*.yml',
    'agents/commands/**/*.md',
    'agents/agents/**/*.md',
    'agents/*.md',
  ];
  const files = (await Promise.all(patterns.map((p) => glob(p, { cwd, absolute: true })))).flat();

  for (const file of files) {
    const text = readTextSafe(file);
    if (!text) continue;
    // Token-match on words — skills referenced by slug will appear here.
    const tokens = text.match(/[a-z][a-z0-9-]{2,}/g);
    if (!tokens) continue;
    for (const t of tokens) corpus.add(t);
  }
  return corpus;
}
