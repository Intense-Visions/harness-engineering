import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import { SkillMetadataSchema, type SkillMetadata } from '../../skill/schema';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';
import { resolveSkillsDir } from '../../utils/paths';

type LoadResult = { ok: true; data: SkillMetadata } | { ok: false; exitCode: number };

function loadSkillMetadata(name: string): LoadResult {
  const skillsDir = resolveSkillsDir();
  const skillDir = path.join(skillsDir, name);

  if (!fs.existsSync(skillDir)) {
    logger.error(`Skill not found: ${name}`);
    return { ok: false, exitCode: ExitCode.ERROR };
  }

  const yamlPath = path.join(skillDir, 'skill.yaml');
  if (!fs.existsSync(yamlPath)) {
    logger.error(`skill.yaml not found for skill: ${name}`);
    return { ok: false, exitCode: ExitCode.ERROR };
  }

  try {
    const raw = fs.readFileSync(yamlPath, 'utf-8');
    const parsed = parse(raw);
    const result = SkillMetadataSchema.safeParse(parsed);
    if (!result.success) {
      logger.error(`Invalid skill.yaml: ${result.error.message}`);
      return { ok: false, exitCode: ExitCode.ERROR };
    }
    return { ok: true, data: result.data };
  } catch (e) {
    logger.error(`Failed to read skill: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, exitCode: ExitCode.ERROR };
  }
}

function printSkillInfo(skill: SkillMetadata): void {
  console.log(`Name:        ${skill.name}`);
  console.log(`Version:     ${skill.version}`);
  console.log(`Type:        ${skill.type}`);
  console.log(`Description: ${skill.description}`);
  console.log(`Triggers:    ${skill.triggers.join(', ')}`);
  console.log(`Platforms:   ${skill.platforms.join(', ')}`);
  console.log(`Tools:       ${skill.tools.join(', ')}`);
  if (skill.phases && skill.phases.length > 0) {
    console.log(`Phases:`);
    for (const p of skill.phases) console.log(`  - ${p.name}: ${p.description}`);
  }
  if (skill.depends_on.length > 0) console.log(`Depends on:  ${skill.depends_on.join(', ')}`);
  console.log(`Persistent:  ${skill.state.persistent}`);
}

export function createInfoCommand(): Command {
  return new Command('info')
    .description('Show metadata for a skill')
    .argument('<name>', 'Skill name (e.g., harness-tdd)')
    .action(async (name, _opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const loaded = loadSkillMetadata(name);
      if (!loaded.ok) {
        process.exit(loaded.exitCode);
        return;
      }
      if (globalOpts.json) {
        logger.raw(loaded.data);
      } else {
        printSkillInfo(loaded.data);
      }
      process.exit(ExitCode.SUCCESS);
    });
}
