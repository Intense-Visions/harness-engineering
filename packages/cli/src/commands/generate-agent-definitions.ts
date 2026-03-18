import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadPersona, listPersonas } from '../persona/loader';
import { generateAgentDefinition, type AgentDefinition } from '../agent-definitions/generator';
import { renderClaudeCodeAgent } from '../agent-definitions/render-claude-code';
import { renderGeminiAgent } from '../agent-definitions/render-gemini-cli';
import { computeSyncPlan, applySyncPlan } from '../slash-commands/sync';
import { resolvePersonasDir, resolveSkillsDir } from '../utils/paths';
import { CLIError, ExitCode, handleError } from '../utils/errors';
import type { Platform } from '../slash-commands/types';
import { VALID_PLATFORMS } from '../slash-commands/types';

export interface GenerateAgentDefsOptions {
  platforms: Platform[];
  global: boolean;
  output?: string;
  dryRun: boolean;
}

export interface GenerateAgentDefsResult {
  platform: string;
  added: string[];
  updated: string[];
  removed: string[];
  unchanged: string[];
  outputDir: string;
}

function resolveOutputDir(platform: Platform, opts: { global: boolean; output?: string }): string {
  if (opts.output) {
    return platform === 'claude-code'
      ? path.join(opts.output, 'claude-code')
      : path.join(opts.output, 'gemini-cli');
  }
  if (opts.global) {
    const home = os.homedir();
    return platform === 'claude-code'
      ? path.join(home, '.claude', 'agents')
      : path.join(home, '.gemini', 'agents');
  }
  return platform === 'claude-code'
    ? path.join('agents', 'agents', 'claude-code')
    : path.join('agents', 'agents', 'gemini-cli');
}

function loadSkillContent(skillName: string): string | null {
  const skillsDir = resolveSkillsDir();
  const skillMdPath = path.join(skillsDir, skillName, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) return null;
  return fs.readFileSync(skillMdPath, 'utf-8');
}

function getRenderer(platform: Platform): (def: AgentDefinition) => string {
  return platform === 'claude-code' ? renderClaudeCodeAgent : renderGeminiAgent;
}

export function generateAgentDefinitions(
  opts: GenerateAgentDefsOptions
): GenerateAgentDefsResult[] {
  const personasDir = resolvePersonasDir();
  const personaList = listPersonas(personasDir);
  if (!personaList.ok) return [];

  // Load all personas
  const personas = personaList.value
    .map((meta) => loadPersona(meta.filePath))
    .filter((r) => r.ok)
    .map((r) => r.value);

  // Load skill contents for all referenced skills
  const allSkillNames = new Set(personas.flatMap((p) => p.skills));
  const skillContents = new Map<string, string>();
  for (const skillName of allSkillNames) {
    const content = loadSkillContent(skillName);
    if (content) {
      skillContents.set(skillName, content);
    }
  }

  // Generate definitions
  const definitions = personas.map((p) => generateAgentDefinition(p, skillContents));

  const results: GenerateAgentDefsResult[] = [];

  for (const platform of opts.platforms) {
    const outputDir = resolveOutputDir(platform, opts);
    const renderer = getRenderer(platform);

    const rendered = new Map<string, string>();
    for (const def of definitions) {
      const filename = `${def.name}.md`;
      rendered.set(filename, renderer(def));
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

export function createGenerateAgentDefinitionsCommand(): Command {
  return new Command('generate-agent-definitions')
    .description('Generate agent definition files from personas for Claude Code and Gemini CLI')
    .option('--platforms <list>', 'Target platforms (comma-separated)', 'claude-code,gemini-cli')
    .option('--global', 'Write to global agent directories', false)
    .option('--output <dir>', 'Custom output directory')
    .option('--dry-run', 'Show what would change without writing', false)
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

      try {
        const results = generateAgentDefinitions({
          platforms: platforms as Platform[],
          global: opts.global,
          output: opts.output,
          dryRun: opts.dryRun,
        });

        if (globalOpts.json) {
          console.log(JSON.stringify(results, null, 2));
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
      } catch (error) {
        handleError(error);
      }
    });
}
