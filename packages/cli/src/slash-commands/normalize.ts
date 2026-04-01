import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { SkillMetadataSchema } from '../skill/schema';
import type { Platform, SlashCommandSpec, SkillArg } from './types';
import { normalizeName } from './normalize-name';

export interface SkillSource {
  dir: string;
  source: 'project' | 'community' | 'global';
}

type NameMap = Map<string, { skillName: string; source: 'project' | 'community' | 'global' }>;

function readSkillYaml(yamlPath: string): ReturnType<typeof SkillMetadataSchema.safeParse> | null {
  let raw: string;
  try {
    raw = fs.readFileSync(yamlPath, 'utf-8');
  } catch {
    return null;
  }
  return SkillMetadataSchema.safeParse(parse(raw));
}

// Cursor and codex are derived platforms — a skill that supports claude-code
// is implicitly available to cursor and codex, since their skill directories
// are symlinks into agents/skills/claude-code/.
const DERIVED_FROM_CLAUDE_CODE: Platform[] = ['cursor', 'codex'];

function shouldSkipSkill(
  meta: { platforms: string[]; tier?: number | undefined; internal?: boolean | undefined },
  platforms: Platform[]
): boolean {
  const effectivePlatforms = platforms.map((p) =>
    DERIVED_FROM_CLAUDE_CODE.includes(p) ? 'claude-code' : p
  );
  const matchesPlatform = effectivePlatforms.some((p) => meta.platforms.includes(p));
  if (!matchesPlatform) return true;
  if (meta.tier === 3 || meta.internal) return true;
  return false;
}

function checkNameCollision(
  normalized: string,
  metaName: string,
  source: 'project' | 'community' | 'global',
  nameMap: NameMap
): 'ok' | 'skip' {
  const existing = nameMap.get(normalized);
  if (!existing) {
    nameMap.set(normalized, { skillName: metaName, source });
    return 'ok';
  }
  if (existing.source === source) {
    throw new Error(
      `Name collision: skills "${existing.skillName}" and "${metaName}" both normalize to "${normalized}"`
    );
  }
  return 'skip';
}

function buildContextLines(meta: {
  cognitive_mode?: string | undefined;
  type?: string | undefined;
  state?: { persistent?: boolean | undefined; files?: string[] | undefined } | undefined;
}): string[] {
  const lines: string[] = [];
  if (meta.cognitive_mode) lines.push(`Cognitive mode: ${meta.cognitive_mode}`);
  if (meta.type) lines.push(`Type: ${meta.type}`);
  if (meta.state?.persistent) {
    const files = meta.state.files?.join(', ') ?? '';
    lines.push(`State: persistent${files ? ` (files: ${files})` : ''}`);
  }
  return lines;
}

function buildObjectiveLines(meta: {
  description: string;
  phases?: Array<{ name: string; description: string; required?: boolean | undefined }> | undefined;
}): string[] {
  const lines = [meta.description];
  if (meta.phases && meta.phases.length > 0) {
    lines.push('', 'Phases:');
    for (const phase of meta.phases) {
      const req = phase.required !== false ? '' : ' (optional)';
      lines.push(`- ${phase.name}: ${phase.description}${req}`);
    }
  }
  return lines;
}

function buildProcessLines(meta: {
  name: string;
  mcp?: { tool?: string | undefined } | undefined;
}): string[] {
  if (meta.mcp?.tool) {
    return [
      `1. Try: invoke mcp__harness__${meta.mcp.tool} with skill: "${meta.name}"`,
      `2. If MCP unavailable: read SKILL.md and follow its workflow directly`,
      `3. Pass through any arguments provided by the user`,
    ];
  }
  return [
    `1. Read SKILL.md and follow its workflow directly`,
    `2. Pass through any arguments provided by the user`,
  ];
}

function buildSpec(
  meta: ReturnType<typeof SkillMetadataSchema.parse>,
  normalized: string,
  entry: { name: string },
  skillsDir: string,
  source: 'project' | 'community' | 'global'
): SlashCommandSpec {
  const skillMdPath = path.join(skillsDir, entry.name, 'SKILL.md');
  const skillMdContent = fs.existsSync(skillMdPath) ? fs.readFileSync(skillMdPath, 'utf-8') : '';
  const skillMdRelative = path.relative(process.cwd(), skillMdPath).replaceAll('\\', '/');
  const skillYamlRelative = path
    .relative(process.cwd(), path.join(skillsDir, entry.name, 'skill.yaml'))
    .replaceAll('\\', '/');

  const args: SkillArg[] = (meta.cli?.args ?? []).map((a) => ({
    name: a.name,
    description: a.description ?? '',
    required: a.required ?? false,
  }));

  const tools = [...(meta.tools ?? [])];
  if (!tools.includes('Read')) tools.push('Read');

  const executionContextLines: string[] = [];
  if (skillMdContent) {
    executionContextLines.push(`@${skillMdRelative}`, `@${skillYamlRelative}`);
  }

  return {
    name: normalized,
    namespace: 'harness',
    fullName: `harness:${normalized}`,
    description: meta.description,
    version: meta.version,
    ...(meta.cognitive_mode ? { cognitiveMode: meta.cognitive_mode } : {}),
    tools,
    args,
    skillYamlName: meta.name,
    sourceDir: entry.name,
    skillsBaseDir: skillsDir,
    source,
    prompt: {
      context: buildContextLines(meta).join('\n'),
      objective: buildObjectiveLines(meta).join('\n'),
      executionContext: executionContextLines.join('\n'),
      process: buildProcessLines(meta).join('\n'),
    },
  };
}

export function normalizeSkills(
  skillSources: SkillSource[],
  platforms: Platform[]
): SlashCommandSpec[] {
  const specs: SlashCommandSpec[] = [];
  const nameMap: NameMap = new Map();

  for (const { dir: skillsDir, source } of skillSources) {
    if (!fs.existsSync(skillsDir)) continue;

    const entries = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory());

    for (const entry of entries) {
      const yamlPath = path.join(skillsDir, entry.name, 'skill.yaml');
      if (!fs.existsSync(yamlPath)) continue;

      const result = readSkillYaml(yamlPath);
      if (!result) continue;
      if (!result.success) {
        console.warn(`Skipping ${entry.name}: invalid skill.yaml`);
        continue;
      }

      const meta = result.data;
      if (shouldSkipSkill(meta, platforms)) continue;

      const normalized = normalizeName(meta.name);
      if (checkNameCollision(normalized, meta.name, source, nameMap) === 'skip') continue;

      specs.push(buildSpec(meta, normalized, entry, skillsDir, source));
    }
  }

  return specs;
}
