import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { normalizeSkills } from '../slash-commands/normalize';
import type { SkillSource } from '../slash-commands/normalize';
import { renderClaudeCode } from '../slash-commands/render-claude-code';
import { renderGemini } from '../slash-commands/render-gemini';
import { computeSyncPlan, applySyncPlan } from '../slash-commands/sync';
import {
  resolveProjectSkillsDir,
  resolveGlobalSkillsDir,
  resolveCommunitySkillsDir,
} from '../utils/paths';
import { CLIError, ExitCode, handleError } from '../utils/errors';
import type { Platform, GenerateOptions } from '../slash-commands/types';
import { VALID_PLATFORMS } from '../slash-commands/types';

export interface GenerateResult {
  platform: string;
  added: string[];
  updated: string[];
  removed: string[];
  unchanged: string[];
  outputDir: string;
}

function resolveOutputDir(platform: Platform, opts: { global: boolean; output?: string }): string {
  if (opts.output) {
    return path.join(opts.output, 'harness');
  }
  if (opts.global) {
    const home = os.homedir();
    return platform === 'claude-code'
      ? path.join(home, '.claude', 'commands', 'harness')
      : path.join(home, '.gemini', 'commands', 'harness');
  }
  return platform === 'claude-code'
    ? path.join('agents', 'commands', 'claude-code', 'harness')
    : path.join('agents', 'commands', 'gemini-cli', 'harness');
}

function fileExtension(platform: Platform): string {
  return platform === 'claude-code' ? '.md' : '.toml';
}

async function confirmDeletion(files: string[]): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`\nRemove ${files.length} orphaned command(s)? (y/N) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

function resolveSkillSources(opts: GenerateOptions): SkillSource[] {
  if (opts.skillsDir) {
    return [{ dir: opts.skillsDir, source: 'project' }];
  }

  const sources: SkillSource[] = [];
  const projectDir = resolveProjectSkillsDir();
  if (projectDir) {
    sources.push({ dir: projectDir, source: 'project' });
  }

  const communityDir = resolveCommunitySkillsDir();
  if (fs.existsSync(communityDir)) {
    sources.push({ dir: communityDir, source: 'community' });
  }

  if (opts.includeGlobal || sources.length === 0) {
    const globalDir = resolveGlobalSkillsDir();
    if (!projectDir || path.resolve(globalDir) !== path.resolve(projectDir)) {
      sources.push({ dir: globalDir, source: 'global' });
    }
  }

  return sources;
}

export function generateSlashCommands(opts: GenerateOptions): GenerateResult[] {
  const skillSources = resolveSkillSources(opts);
  const specs = normalizeSkills(skillSources, opts.platforms);
  const results: GenerateResult[] = [];

  for (const platform of opts.platforms) {
    const outputDir = resolveOutputDir(platform, opts);
    const ext = fileExtension(platform);
    const useAbsolutePaths = opts.global;

    const rendered = new Map<string, string>();
    for (const spec of specs) {
      const filename = `${spec.name}${ext}`;

      if (platform === 'claude-code') {
        const renderSpec = useAbsolutePaths
          ? {
              ...spec,
              prompt: {
                ...spec.prompt,
                executionContext: spec.prompt.executionContext
                  .split('\n')
                  .map((line) => {
                    if (line.startsWith('@')) {
                      const relPath = line.slice(1);
                      return `@${path.resolve(relPath)}`;
                    }
                    return line;
                  })
                  .join('\n'),
              },
            }
          : spec;
        rendered.set(filename, renderClaudeCode(renderSpec));
      } else {
        const mdPath = path.join(spec.skillsBaseDir, spec.sourceDir, 'SKILL.md');
        const yamlPath = path.join(spec.skillsBaseDir, spec.sourceDir, 'skill.yaml');
        const mdContent = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf-8') : '';
        const yamlContent = fs.existsSync(yamlPath) ? fs.readFileSync(yamlPath, 'utf-8') : '';
        rendered.set(filename, renderGemini(spec, mdContent, yamlContent));
      }
    }

    const plan = computeSyncPlan(outputDir, rendered);

    if (!opts.dryRun) {
      applySyncPlan(outputDir, rendered, plan, false);
    }

    results.push({
      platform,
      added: plan.added,
      updated: plan.updated,
      removed: plan.removed,
      unchanged: plan.unchanged,
      outputDir,
    });
  }

  return results;
}

export async function handleOrphanDeletion(
  results: GenerateResult[],
  opts: { yes: boolean; dryRun: boolean }
): Promise<void> {
  if (opts.dryRun) return;

  for (const result of results) {
    if (result.removed.length === 0) continue;

    const shouldDelete = opts.yes || (await confirmDeletion(result.removed));
    if (shouldDelete) {
      for (const filename of result.removed) {
        const filePath = path.join(result.outputDir, filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    }
  }
}

export function createGenerateSlashCommandsCommand(): Command {
  return new Command('generate-slash-commands')
    .description(
      'Generate native slash commands for Claude Code and Gemini CLI from skill metadata'
    )
    .option('--platforms <list>', 'Target platforms (comma-separated)', 'claude-code,gemini-cli')
    .option('--global', 'Write to global config directories', false)
    .option('--include-global', 'Include built-in global skills alongside project skills', false)
    .option('--output <dir>', 'Custom output directory')
    .option('--skills-dir <path>', 'Skills directory to scan')
    .option('--dry-run', 'Show what would change without writing', false)
    .option('--yes', 'Skip deletion confirmation prompts', false)
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();

      const platforms = opts.platforms.split(',').map((p: string) => p.trim());
      for (const p of platforms) {
        if (!VALID_PLATFORMS.includes(p as Platform)) {
          throw new CLIError(
            `Invalid platform "${p}". Valid platforms: ${VALID_PLATFORMS.join(', ')}`,
            ExitCode.VALIDATION_FAILED
          );
        }
      }

      const generateOpts: GenerateOptions = {
        platforms: platforms as Platform[],
        global: opts.global,
        includeGlobal: opts.includeGlobal,
        output: opts.output,
        skillsDir: opts.skillsDir ?? '',
        dryRun: opts.dryRun,
        yes: opts.yes,
      };

      try {
        const results = generateSlashCommands(generateOpts);

        if (globalOpts.json) {
          console.log(JSON.stringify(results, null, 2));
          return;
        }

        const totalCommands = results.reduce(
          (sum, r) => sum + r.added.length + r.updated.length + r.unchanged.length,
          0
        );
        if (totalCommands === 0) {
          console.log(
            '\nNo skills found. Use --include-global to include built-in skills, or create a skill with: harness create-skill'
          );
          return;
        }

        for (const result of results) {
          console.log(`\n${result.platform} → ${result.outputDir}`);
          if (result.added.length > 0) {
            console.log(`  + ${result.added.length} new: ${result.added.join(', ')}`);
          }
          if (result.updated.length > 0) {
            console.log(`  ~ ${result.updated.length} updated: ${result.updated.join(', ')}`);
          }
          if (result.removed.length > 0) {
            console.log(`  - ${result.removed.length} removed: ${result.removed.join(', ')}`);
          }
          if (result.unchanged.length > 0) {
            console.log(`  = ${result.unchanged.length} unchanged`);
          }
          if (opts.dryRun) {
            console.log('  (dry run — no files written)');
          }
        }

        await handleOrphanDeletion(results, { yes: opts.yes, dryRun: opts.dryRun });
      } catch (error) {
        handleError(error);
      }
    });
}
