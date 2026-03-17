import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { SkillMetadataSchema } from '../skill/schema';
import type { Platform, SlashCommandSpec, SkillArg } from './types';
import { normalizeName } from './normalize-name';

export function normalizeSkills(
  skillsDir: string,
  platforms: Platform[],
): SlashCommandSpec[] {
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  const specs: SlashCommandSpec[] = [];
  const nameMap = new Map<string, string>();

  for (const entry of entries) {
    const yamlPath = path.join(skillsDir, entry.name, 'skill.yaml');
    if (!fs.existsSync(yamlPath)) continue;

    let raw: string;
    try {
      raw = fs.readFileSync(yamlPath, 'utf-8');
    } catch {
      continue;
    }

    const parsed = parse(raw);
    const result = SkillMetadataSchema.safeParse(parsed);
    if (!result.success) {
      console.warn(`Skipping ${entry.name}: invalid skill.yaml`);
      continue;
    }

    const meta = result.data;

    const matchesPlatform = platforms.some((p) => meta.platforms.includes(p));
    if (!matchesPlatform) continue;

    const normalized = normalizeName(meta.name);

    if (nameMap.has(normalized)) {
      throw new Error(
        `Name collision: skills "${nameMap.get(normalized)}" and "${meta.name}" both normalize to "${normalized}"`
      );
    }
    nameMap.set(normalized, meta.name);

    const skillMdPath = path.join(skillsDir, entry.name, 'SKILL.md');
    const skillMdContent = fs.existsSync(skillMdPath)
      ? fs.readFileSync(skillMdPath, 'utf-8')
      : '';
    const skillMdRelative = path.relative(process.cwd(), path.join(skillsDir, entry.name, 'SKILL.md'));
    const skillYamlRelative = path.relative(process.cwd(), path.join(skillsDir, entry.name, 'skill.yaml'));

    const args: SkillArg[] = (meta.cli?.args ?? []).map((a) => ({
      name: a.name,
      description: a.description ?? '',
      required: a.required ?? false,
    }));

    const tools = [...(meta.tools ?? [])];
    if (!tools.includes('Read')) {
      tools.push('Read');
    }

    const contextLines: string[] = [];
    if (meta.cognitive_mode) {
      contextLines.push(`Cognitive mode: ${meta.cognitive_mode}`);
    }
    if (meta.type) {
      contextLines.push(`Type: ${meta.type}`);
    }
    if (meta.state?.persistent) {
      const files = meta.state.files?.join(', ') ?? '';
      contextLines.push(`State: persistent${files ? ` (files: ${files})` : ''}`);
    }

    const objectiveLines = [meta.description];
    if (meta.phases && meta.phases.length > 0) {
      objectiveLines.push('');
      objectiveLines.push('Phases:');
      for (const phase of meta.phases) {
        const req = phase.required !== false ? '' : ' (optional)';
        objectiveLines.push(`- ${phase.name}: ${phase.description}${req}`);
      }
    }

    const executionContextLines: string[] = [];
    if (skillMdContent) {
      executionContextLines.push(`@${skillMdRelative}`);
      executionContextLines.push(`@${skillYamlRelative}`);
    }

    const processLines: string[] = [];
    if (meta.mcp?.tool) {
      processLines.push(
        `1. Try: invoke mcp__harness__${meta.mcp.tool} with skill: "${meta.name}"`
      );
      processLines.push(
        `2. If MCP unavailable: read SKILL.md and follow its workflow directly`
      );
      processLines.push(`3. Pass through any arguments provided by the user`);
    } else {
      processLines.push(`1. Read SKILL.md and follow its workflow directly`);
      processLines.push(`2. Pass through any arguments provided by the user`);
    }

    specs.push({
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
      prompt: {
        context: contextLines.join('\n'),
        objective: objectiveLines.join('\n'),
        executionContext: executionContextLines.join('\n'),
        process: processLines.join('\n'),
      },
    });
  }

  return specs;
}
