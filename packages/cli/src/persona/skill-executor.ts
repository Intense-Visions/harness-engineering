import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import { SkillMetadataSchema } from '../skill/schema';
import { resolveSkillsDir } from '../utils/paths';
import type { TriggerContext } from './schema';

export interface SkillExecutionContext {
  trigger: TriggerContext;
  projectPath: string;
  outputMode: 'inline' | 'artifact' | 'auto';
  baseSha?: string;
  headSha?: string;
}

export interface SkillExecutionResult {
  status: 'pass' | 'fail';
  output: string;
  artifactPath?: string;
  durationMs: number;
}

function resolveOutputMode(
  mode: 'inline' | 'artifact' | 'auto',
  trigger: TriggerContext
): 'inline' | 'artifact' {
  if (mode !== 'auto') return mode;
  return trigger === 'manual' ? 'inline' : 'artifact';
}

function buildArtifactPath(projectPath: string, headSha?: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const sha = headSha?.slice(0, 7) ?? 'unknown';
  return path.join(projectPath, '.harness', 'reviews', `${date}-${sha}.md`);
}

function buildArtifactContent(
  skillName: string,
  trigger: TriggerContext,
  headSha?: string
): string {
  const date = new Date().toISOString().slice(0, 10);
  return [
    '---',
    `skill: ${skillName}`,
    `trigger: ${trigger}`,
    `sha: ${headSha?.slice(0, 7) ?? 'unknown'}`,
    `date: ${date}`,
    `assessment: pending`,
    '---',
    '',
    `# Review by ${skillName}`,
    '',
    '## Strengths',
    '',
    '- (review pending)',
    '',
    '## Issues',
    '',
    '### Critical',
    '',
    '- None identified',
    '',
    '### Important',
    '',
    '- None identified',
    '',
    '### Suggestions',
    '',
    '- None identified',
    '',
    '## Assessment',
    '',
    'Pending — skill execution scaffolded.',
    '',
    '## Harness Checks',
    '',
    '- (run harness validate, check-deps, check-docs to populate)',
    '',
  ].join('\n');
}

export async function executeSkill(
  skillName: string,
  context: SkillExecutionContext
): Promise<SkillExecutionResult> {
  const startTime = Date.now();

  // Load the skill
  const skillsDir = resolveSkillsDir();
  const skillDir = path.join(skillsDir, skillName);

  if (!fs.existsSync(skillDir)) {
    return {
      status: 'fail',
      output: `Skill not found: ${skillName}`,
      durationMs: Date.now() - startTime,
    };
  }

  // Load metadata
  const yamlPath = path.join(skillDir, 'skill.yaml');
  if (!fs.existsSync(yamlPath)) {
    return {
      status: 'fail',
      output: `skill.yaml not found for ${skillName}`,
      durationMs: Date.now() - startTime,
    };
  }

  const raw = fs.readFileSync(yamlPath, 'utf-8');
  const parsed = parse(raw);
  const metadataResult = SkillMetadataSchema.safeParse(parsed);
  if (!metadataResult.success) {
    return {
      status: 'fail',
      output: `Invalid skill metadata: ${metadataResult.error.message}`,
      durationMs: Date.now() - startTime,
    };
  }

  // Load SKILL.md
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) {
    return {
      status: 'fail',
      output: `SKILL.md not found for ${skillName}`,
      durationMs: Date.now() - startTime,
    };
  }

  const skillContent = fs.readFileSync(skillMdPath, 'utf-8');
  const metadata = metadataResult.data;

  // Resolve output mode
  const resolvedMode = resolveOutputMode(context.outputMode, context.trigger);

  // Build output
  const output =
    `Skill ${metadata.name} (${metadata.type}) loaded.\n` +
    `Cognitive mode: ${metadata.cognitive_mode ?? 'default'}\n` +
    `Content length: ${skillContent.length} chars\n` +
    `Trigger: ${context.trigger}\n`;

  let artifactPath: string | undefined;
  if (resolvedMode === 'artifact') {
    artifactPath = buildArtifactPath(context.projectPath, context.headSha);
    const artifactContent = buildArtifactContent(skillName, context.trigger, context.headSha);
    const dir = path.dirname(artifactPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(artifactPath, artifactContent, 'utf-8');
  }

  return {
    status: 'pass',
    output,
    artifactPath,
    durationMs: Date.now() - startTime,
  };
}
