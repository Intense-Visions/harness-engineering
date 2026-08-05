import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import {
  SkillMetadataSchema,
  capabilityDriftErrors,
  type SkillCapabilities,
} from '../../skill/schema';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';
import { resolveProjectSkillsDir, resolveSkillsDir } from '../../utils/paths';

const BEHAVIORAL_REQUIRED_SECTIONS = [
  '## When to Use',
  '## Process',
  '## Harness Integration',
  '## Success Criteria',
  '## Examples',
  '## Rationalizations to Reject',
];

const KNOWLEDGE_REQUIRED_SECTIONS = ['## Instructions'];

function validateSkillMd(
  name: string,
  skillMdPath: string,
  skillType: string,
  errors: string[]
): void {
  if (!fs.existsSync(skillMdPath)) {
    errors.push(`${name}: missing SKILL.md`);
    return;
  }

  const mdContent = fs.readFileSync(skillMdPath, 'utf-8');

  if (!mdContent.trim().startsWith('# ')) {
    errors.push(`${name}/SKILL.md: must start with an h1 heading`);
  }

  if (skillType === 'knowledge') {
    for (const section of KNOWLEDGE_REQUIRED_SECTIONS) {
      if (!mdContent.includes(section)) {
        errors.push(`${name}/SKILL.md: missing section "${section}"`);
      }
    }
    return;
  }

  // Behavioral skills (rigid, flexible)
  for (const section of BEHAVIORAL_REQUIRED_SECTIONS) {
    if (!mdContent.includes(section)) {
      errors.push(`${name}/SKILL.md: missing section "${section}"`);
    }
  }
  if (skillType === 'rigid') {
    if (!mdContent.includes('## Gates'))
      errors.push(`${name}/SKILL.md: rigid skill missing "## Gates" section`);
    if (!mdContent.includes('## Escalation'))
      errors.push(`${name}/SKILL.md: rigid skill missing "## Escalation" section`);
  }
}

/**
 * Harness-authored skills are the ones the harness itself ships and is
 * accountable for. They carry the reserved `harness-` name prefix, so the
 * capabilities envelope is mandatory for them; third-party/community skills may
 * still declare it (and are checked for consistency when they do) but are not
 * required to.
 */
export function isHarnessAuthoredSkill(name: string): boolean {
  return name.startsWith('harness-');
}

/**
 * Enforce the per-skill capability declaration (#558):
 *
 * - Every harness-authored skill MUST declare `capabilities`.
 * - Any skill that declares `capabilities` must keep it consistent with its
 *   `tools:` list (derived network/filesystem/tool-set).
 *
 * This is the wired half of the declaration layer: it runs in `harness skill
 * validate` and in CI, and fails on a missing or drifted declaration. Runtime
 * bounds-enforcement (blocking a skill that exceeds its envelope) is deferred.
 */
function validateCapabilities(
  name: string,
  meta: { tools?: string[] | undefined; capabilities?: SkillCapabilities | undefined },
  errors: string[]
): void {
  if (!meta.capabilities) {
    if (isHarnessAuthoredSkill(name)) {
      errors.push(
        `${name}/skill.yaml: harness-authored skill must declare capabilities (derive from tools; run \`harness skill validate\` for the expected values)`
      );
    }
    return;
  }
  for (const drift of capabilityDriftErrors(meta.tools ?? [], meta.capabilities)) {
    errors.push(`${name}/skill.yaml: ${drift}`);
  }
}

export function validateSkillEntry(name: string, skillsDir: string, errors: string[]): boolean {
  const skillDir = path.join(skillsDir, name);
  const yamlPath = path.join(skillDir, 'skill.yaml');

  if (!fs.existsSync(yamlPath)) {
    errors.push(`${name}: missing skill.yaml`);
    return false;
  }

  try {
    const raw = fs.readFileSync(yamlPath, 'utf-8');
    const result = SkillMetadataSchema.safeParse(parse(raw));
    if (!result.success) {
      errors.push(`${name}/skill.yaml: ${result.error.message}`);
      return false;
    }
    validateSkillMd(name, path.join(skillDir, 'SKILL.md'), result.data.type, errors);
    validateCapabilities(name, result.data, errors);
    return true;
  } catch (e) {
    errors.push(`${name}: parse error — ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

export interface SkillValidationResult {
  /** The directory that was scanned, or null when none exists. */
  skillsDir: string | null;
  /** How many skills were actually examined (the denominator). */
  scanned: number;
  /** Of the scanned skills, how many had a parseable skill.yaml. */
  validated: number;
  errors: string[];
  /** Set when a requested skill name was not present in `skillsDir`. */
  notFound?: string;
}

/**
 * Resolve the skills directory to validate and run the checks (#1011).
 *
 * Prefers the working-tree `agents/skills/` when invoked inside a harness
 * checkout, falling back to the installed CLI bundle otherwise. Previously this
 * always scanned the bundle (`<cli>/dist/agents/skills/...`), so a skill authored
 * in a checkout was never examined — the validator's silence read as approval,
 * and `harness-skill-authoring`'s "no skill ships without validation passing"
 * gate could be satisfied without the file ever being looked at.
 */
export function runSkillValidation(
  // `| undefined` (not just `?`) so callers may pass through an unset optional
  // under exactOptionalPropertyTypes.
  opts: { cwd?: string | undefined; skillName?: string | undefined } = {}
): SkillValidationResult {
  const skillsDir = resolveProjectSkillsDir(opts.cwd) ?? resolveSkillsDir();

  if (!fs.existsSync(skillsDir)) {
    return { skillsDir: null, scanned: 0, validated: 0, errors: [] };
  }

  const allEntries = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  // Honour the skill-name argument: validate just that skill and fail if it is
  // not present, rather than silently validating everything else (#1011).
  if (opts.skillName && !allEntries.includes(opts.skillName)) {
    return { skillsDir, scanned: 0, validated: 0, errors: [], notFound: opts.skillName };
  }
  const entries = opts.skillName ? [opts.skillName] : allEntries;

  const errors: string[] = [];
  let validated = 0;
  for (const name of entries) {
    if (validateSkillEntry(name, skillsDir, errors)) validated++;
  }

  return { skillsDir, scanned: entries.length, validated, errors };
}

export function createValidateCommand(): Command {
  return new Command('validate')
    .description('Validate skill.yaml files and SKILL.md structure')
    .argument('[skill-name]', 'Validate only this skill (fails if it is not found)')
    .action(async (skillName: string | undefined, _opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const result = runSkillValidation({ skillName });

      if (result.skillsDir === null) {
        if (globalOpts.json) {
          logger.raw({ skillsDir: null, scanned: 0, validated: 0, errors: [] });
        } else {
          logger.info('No skills directory found.');
        }
        process.exit(ExitCode.SUCCESS);
        return;
      }

      if (result.notFound) {
        if (globalOpts.json) {
          logger.raw({ ...result });
        } else {
          logger.error(`Skill not found: ${result.notFound} (searched ${result.skillsDir})`);
        }
        process.exit(ExitCode.ERROR);
        return;
      }

      if (globalOpts.json) {
        logger.raw({
          skillsDir: result.skillsDir,
          scanned: result.scanned,
          validated: result.validated,
          errors: result.errors,
        });
      } else if (result.errors.length > 0) {
        logger.error(
          `Validation failed with ${result.errors.length} error(s) across ${result.scanned} skill(s) in ${result.skillsDir}:`
        );
        for (const err of result.errors) console.error(`  - ${err}`);
        process.exit(ExitCode.ERROR);
      } else if (!globalOpts.quiet) {
        // Report the denominator so "no errors" is distinguishable from
        // "nothing checked" (#1011).
        logger.success(`Validated ${result.scanned} skill(s) in ${result.skillsDir}.`);
      }
      process.exit(ExitCode.SUCCESS);
    });
}
