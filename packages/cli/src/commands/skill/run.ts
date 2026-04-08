import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import { SkillMetadataSchema } from '../../skill/schema';
import { detectComplexity, type Complexity } from '../../skill/complexity';
import { buildPreamble } from './preamble';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';
import { resolveSkillsDir } from '../../utils/paths';

type SkillMetadata = ReturnType<typeof SkillMetadataSchema.parse>;

function loadSkillMetadata(skillDir: string): SkillMetadata | null {
  const yamlPath = path.join(skillDir, 'skill.yaml');
  if (!fs.existsSync(yamlPath)) return null;
  try {
    const result = SkillMetadataSchema.safeParse(parse(fs.readFileSync(yamlPath, 'utf-8')));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function resolveComplexity(
  metadata: SkillMetadata | null,
  requested: Complexity,
  projectPath: string
): 'fast' | 'thorough' | undefined {
  if (!metadata?.phases || metadata.phases.length === 0) return undefined;
  if (requested === 'standard') return detectComplexity(projectPath);
  return requested;
}

function loadPrinciples(projectPath: string): string | undefined {
  const principlesPath = path.join(projectPath, 'docs', 'principles.md');
  return fs.existsSync(principlesPath) ? fs.readFileSync(principlesPath, 'utf-8') : undefined;
}

function readMostRecentFileInDir(dirPath: string): string | undefined {
  const files = fs
    .readdirSync(dirPath)
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(dirPath, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (files.length > 0) return fs.readFileSync(path.join(dirPath, files[0]!.name), 'utf-8');
  return undefined;
}

function loadPriorState(metadata: SkillMetadata | null, projectPath: string): string | undefined {
  if (!metadata?.state.persistent || metadata.state.files.length === 0) return undefined;

  for (const stateFilePath of metadata.state.files) {
    const fullPath = path.join(projectPath, stateFilePath);
    if (!fs.existsSync(fullPath)) continue;

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) return readMostRecentFileInDir(fullPath);
    return fs.readFileSync(fullPath, 'utf-8');
  }
  return undefined;
}

function validatePhaseName(metadata: SkillMetadata | null, phase: string): boolean {
  if (!metadata?.phases) return true;
  return metadata.phases.map((p) => p.name).includes(phase);
}

function resolvePhaseState(
  metadata: SkillMetadata | null,
  projectPath: string,
  phase: string
): { priorState: string | undefined; stateWarning: string | undefined } | null {
  if (!validatePhaseName(metadata, phase)) {
    const validPhases = metadata!.phases!.map((p) => p.name);
    logger.error(`Unknown phase: ${phase}. Valid phases: ${validPhases.join(', ')}`);
    return null;
  }
  const priorState = loadPriorState(metadata, projectPath);
  const stateWarning =
    !priorState && metadata?.state.persistent
      ? 'No prior phase data found. Earlier phases have not been completed. Proceed with caution.'
      : undefined;
  return { priorState, stateWarning };
}

function appendProjectState(
  content: string,
  metadata: SkillMetadata | null,
  projectPath: string,
  hasPathOpt: boolean
): string {
  if (!metadata?.state.persistent || !hasPathOpt) return content;
  const stateFile = path.join(projectPath, '.harness', 'state.json');
  if (!fs.existsSync(stateFile)) return content;
  const stateContent = fs.readFileSync(stateFile, 'utf-8');
  return content + `\n\n---\n## Project State\n\`\`\`json\n${stateContent}\n\`\`\`\n`;
}

async function runSkill(name: string, opts: { path?: string; complexity?: string; phase?: string; party?: boolean }): Promise<void> {
  const skillsDir = resolveSkillsDir();
  const skillDir = path.join(skillsDir, name);

  if (!fs.existsSync(skillDir)) {
    logger.error(`Skill not found: ${name}`);
    process.exit(ExitCode.ERROR);
  }

  const metadata = loadSkillMetadata(skillDir);
  const projectPath = opts.path ? path.resolve(opts.path) : process.cwd();
  const complexity = resolveComplexity(metadata, (opts.complexity as Complexity) ?? 'standard', projectPath);
  const principles = loadPrinciples(projectPath);

  let priorState: string | undefined;
  let stateWarning: string | undefined;
  if (opts.phase) {
    const phaseResult = resolvePhaseState(metadata, projectPath, opts.phase);
    if (!phaseResult) { process.exit(ExitCode.ERROR); }
    priorState = phaseResult.priorState;
    stateWarning = phaseResult.stateWarning;
  }

  const preamble = buildPreamble({
    ...(complexity !== undefined && { complexity }),
    phases: metadata?.phases as Array<{ name: string; description: string; required: boolean }>,
    ...(principles !== undefined && { principles }),
    ...(opts.phase !== undefined && { phase: opts.phase }),
    ...(priorState !== undefined && { priorState }),
    ...(stateWarning !== undefined && { stateWarning }),
    ...(opts.party !== undefined && { party: opts.party }),
  });

  const skillMdPath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) {
    logger.error(`SKILL.md not found for skill: ${name}`);
    process.exit(ExitCode.ERROR);
  }

  const content = appendProjectState(fs.readFileSync(skillMdPath, 'utf-8'), metadata, projectPath, !!opts.path);
  process.stdout.write(preamble + content);
  process.exit(ExitCode.SUCCESS);
}

export function createRunCommand(): Command {
  return new Command('run')
    .description('Run a skill (outputs SKILL.md content with context preamble)')
    .argument('<name>', 'Skill name (e.g., harness-tdd)')
    .option('--path <path>', 'Project root path for context injection')
    .option('--complexity <level>', 'Rigor level: fast, standard, thorough', 'standard')
    .option('--phase <name>', 'Start at a specific phase (for re-entry)')
    .option('--party', 'Enable multi-perspective evaluation')
    .action(async (name, opts) => runSkill(name, opts));
}
