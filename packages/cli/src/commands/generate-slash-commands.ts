import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { normalizeSkills } from '../slash-commands/normalize';
import type { SkillSource } from '../slash-commands/normalize';
import { renderClaudeCode } from '../slash-commands/render-claude-code';
import { renderGemini } from '../slash-commands/render-gemini';
import { renderCursor } from '../slash-commands/render-cursor';
import { renderCodexAgentsMd } from '../slash-commands/render-codex';
import { computeSyncPlan, applySyncPlan } from '../slash-commands/sync';
import { computeCodexSync } from '../slash-commands/sync-codex';
import {
  resolveProjectSkillsDir,
  resolveGlobalSkillsDir,
  resolveCommunitySkillsDir,
  resolveGlobalCommunitySkillsDir,
} from '../utils/paths';
import { CLIError, ExitCode, handleError } from '../utils/errors';
import type { Platform, GenerateOptions, SlashCommandSpec } from '../slash-commands/types';
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
    if (platform === 'claude-code') return path.join(home, '.claude', 'commands', 'harness');
    if (platform === 'gemini-cli') return path.join(home, '.gemini', 'commands', 'harness');
    if (platform === 'cursor') return path.join(home, '.cursor', 'rules', 'harness');
    return path.join(home, '.codex', 'harness');
  }
  if (platform === 'claude-code') return path.join('agents', 'commands', 'claude-code', 'harness');
  if (platform === 'gemini-cli') return path.join('agents', 'commands', 'gemini-cli', 'harness');
  if (platform === 'cursor') return path.join('agents', 'commands', 'cursor', 'harness');
  return path.join('agents', 'commands', 'codex', 'harness');
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
  const sources: SkillSource[] = [];
  const seenPaths = new Set<string>();

  function addSource(dir: string, source: 'project' | 'community' | 'global'): void {
    const resolved = path.resolve(dir);
    if (!seenPaths.has(resolved) && fs.existsSync(dir)) {
      seenPaths.add(resolved);
      sources.push({ dir, source });
    }
  }

  // --skills-dir is additive: adds an extra source alongside normal resolution
  if (opts.skillsDir) {
    addSource(opts.skillsDir, 'community');
  }

  const projectDir = resolveProjectSkillsDir();
  if (projectDir) {
    addSource(projectDir, 'project');
  }

  const communityDir = resolveCommunitySkillsDir();
  addSource(communityDir, 'community');

  // Global community skills (~/.harness/skills/community/)
  const globalCommunityDir = resolveGlobalCommunitySkillsDir();
  addSource(globalCommunityDir, 'community');

  if (opts.includeGlobal || sources.length === 0) {
    const globalDir = resolveGlobalSkillsDir();
    addSource(globalDir, 'global');
  }

  return sources;
}

function resolveAbsoluteExecutionContext(spec: SlashCommandSpec): SlashCommandSpec {
  return {
    ...spec,
    prompt: {
      ...spec.prompt,
      executionContext: spec.prompt.executionContext
        .split('\n')
        .map((line) => (line.startsWith('@') ? `@${path.resolve(line.slice(1))}` : line))
        .join('\n'),
    },
  };
}

function renderSpec(
  platform: Platform,
  spec: SlashCommandSpec,
  useAbsolutePaths: boolean
): [string, string] {
  if (platform === 'cursor') {
    const mdPath = path.join(spec.skillsBaseDir, spec.sourceDir, 'SKILL.md');
    const skillMd = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf-8') : '';
    return [`${spec.skillYamlName}.mdc`, renderCursor(spec, skillMd, spec.cursor)];
  }

  if (platform === 'claude-code') {
    const renderSpecValue = useAbsolutePaths ? resolveAbsoluteExecutionContext(spec) : spec;
    return [`${spec.name}.md`, renderClaudeCode(renderSpecValue)];
  }

  const mdPath = path.join(spec.skillsBaseDir, spec.sourceDir, 'SKILL.md');
  const yamlPath = path.join(spec.skillsBaseDir, spec.sourceDir, 'skill.yaml');
  const mdContent = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf-8') : '';
  const yamlContent = fs.existsSync(yamlPath) ? fs.readFileSync(yamlPath, 'utf-8') : '';
  return [`${spec.name}.toml`, renderGemini(spec, mdContent, yamlContent)];
}

function generateForCodex(
  platform: Platform,
  outputDir: string,
  specs: SlashCommandSpec[],
  dryRun: boolean
): GenerateResult {
  const codexSync = computeCodexSync(outputDir, specs, dryRun);
  const codexRoot = path.dirname(outputDir);
  if (!dryRun) {
    fs.mkdirSync(codexRoot, { recursive: true });
    fs.writeFileSync(path.join(codexRoot, 'AGENTS.md'), renderCodexAgentsMd(specs), 'utf-8');
  }
  return { platform, ...codexSync, outputDir };
}

function generateForPlatform(
  platform: Platform,
  outputDir: string,
  specs: SlashCommandSpec[],
  opts: GenerateOptions
): GenerateResult {
  const rendered = new Map<string, string>();
  const parentRendered = new Map<string, string>();

  for (const spec of specs) {
    const [filename, content] = renderSpec(platform, spec, opts.global);
    // Skills with command_name override the namespace prefix and belong at the
    // parent directory level (e.g. ~/.claude/commands/harness.md → /harness),
    // NOT inside the namespace subdirectory (which would give /harness:harness).
    if (spec.commandName && (platform === 'claude-code' || platform === 'gemini-cli')) {
      parentRendered.set(filename, content);
    } else {
      rendered.set(filename, content);
    }
  }

  const plan = computeSyncPlan(outputDir, rendered);
  if (!opts.dryRun) {
    applySyncPlan(outputDir, rendered, plan, false);
  }

  if (parentRendered.size === 0) {
    return {
      platform,
      added: plan.added,
      updated: plan.updated,
      removed: plan.removed,
      unchanged: plan.unchanged,
      outputDir,
    };
  }

  const parentDir = path.dirname(outputDir);
  const parentPlan = computeSyncPlan(parentDir, parentRendered);
  if (!opts.dryRun) {
    applySyncPlan(parentDir, parentRendered, parentPlan, false);
  }

  return {
    platform,
    added: [...plan.added, ...parentPlan.added],
    updated: [...plan.updated, ...parentPlan.updated],
    removed: [...plan.removed, ...parentPlan.removed],
    unchanged: [...plan.unchanged, ...parentPlan.unchanged],
    outputDir,
  };
}

export function generateSlashCommands(opts: GenerateOptions): GenerateResult[] {
  const skillSources = resolveSkillSources(opts);
  const specs = normalizeSkills(skillSources, opts.platforms);
  const results: GenerateResult[] = [];

  for (const platform of opts.platforms) {
    const outputDir = resolveOutputDir(platform, opts);
    if (platform === 'codex') {
      results.push(generateForCodex(platform, outputDir, specs, opts.dryRun));
    } else {
      results.push(generateForPlatform(platform, outputDir, specs, opts));
    }
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
    if (!shouldDelete) continue;

    for (const filename of result.removed) {
      const filePath = path.join(result.outputDir, filename);
      if (!fs.existsSync(filePath)) continue;
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
    }
  }
}

function validatePlatforms(platforms: string[]): Platform[] {
  for (const p of platforms) {
    if (!VALID_PLATFORMS.includes(p as Platform)) {
      throw new CLIError(
        `Invalid platform "${p}". Valid platforms: ${VALID_PLATFORMS.join(', ')}`,
        ExitCode.VALIDATION_FAILED
      );
    }
  }
  return platforms as Platform[];
}

function printResults(results: GenerateResult[], dryRun: boolean): void {
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
    if (dryRun) {
      console.log('  (dry run — no files written)');
    }
  }
}

export function createGenerateSlashCommandsCommand(): Command {
  return new Command('generate-slash-commands')
    .description(
      'Generate native commands for Claude Code, Gemini CLI, Codex CLI, and Cursor from skill metadata'
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

      try {
        const platforms = validatePlatforms(opts.platforms.split(',').map((p: string) => p.trim()));

        const generateOpts: GenerateOptions = {
          platforms,
          global: opts.global,
          includeGlobal: opts.includeGlobal,
          output: opts.output,
          skillsDir: opts.skillsDir ?? '',
          dryRun: opts.dryRun,
          yes: opts.yes,
        };

        const results = generateSlashCommands(generateOpts);

        if (globalOpts.json) {
          console.log(JSON.stringify(results, null, 2));
          return;
        }

        printResults(results, opts.dryRun);
        await handleOrphanDeletion(results, { yes: opts.yes, dryRun: opts.dryRun });
      } catch (error) {
        handleError(error);
      }
    });
}
