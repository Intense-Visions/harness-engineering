import fs from 'node:fs';
import path from 'node:path';
import { renderCodexSkill, renderCodexOpenaiYaml } from './render-codex';
import { GENERATED_HEADER_CODEX } from './types';
import type { SlashCommandSpec } from './types';

export interface CodexSyncResult {
  added: string[];
  updated: string[];
  removed: string[];
  unchanged: string[];
}

export function computeCodexSync(
  outputDir: string,
  specs: SlashCommandSpec[],
  dryRun: boolean
): CodexSyncResult {
  const added: string[] = [];
  const updated: string[] = [];
  const unchanged: string[] = [];
  const specSkillNames = new Set<string>();

  for (const spec of specs) {
    const mdPath = path.join(spec.skillsBaseDir, spec.sourceDir, 'SKILL.md');
    const skillMd = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf-8') : '';
    const skillDir = path.join(outputDir, spec.skillYamlName);
    specSkillNames.add(spec.skillYamlName);

    const renderedSkillMd = renderCodexSkill(skillMd);
    const renderedOpenaiYaml = renderCodexOpenaiYaml(spec);
    const existingSkillMdPath = path.join(skillDir, 'SKILL.md');
    const existingOpenaiYamlPath = path.join(skillDir, 'agents', 'openai.yaml');

    if (!fs.existsSync(skillDir)) {
      added.push(spec.skillYamlName);
    } else {
      const existingSkillMd = fs.existsSync(existingSkillMdPath)
        ? fs.readFileSync(existingSkillMdPath, 'utf-8')
        : '';
      const existingOpenaiYaml = fs.existsSync(existingOpenaiYamlPath)
        ? fs.readFileSync(existingOpenaiYamlPath, 'utf-8')
        : '';
      if (existingSkillMd === renderedSkillMd && existingOpenaiYaml === renderedOpenaiYaml) {
        unchanged.push(spec.skillYamlName);
      } else {
        updated.push(spec.skillYamlName);
      }
    }

    if (!dryRun && !unchanged.includes(spec.skillYamlName)) {
      const agentsSubDir = path.join(skillDir, 'agents');
      fs.mkdirSync(agentsSubDir, { recursive: true });
      fs.writeFileSync(existingSkillMdPath, renderedSkillMd, 'utf-8');
      fs.writeFileSync(existingOpenaiYamlPath, renderedOpenaiYaml, 'utf-8');
    }
  }

  const removed = detectCodexOrphans(outputDir, specSkillNames);
  return { added, updated, removed, unchanged };
}

function detectCodexOrphans(outputDir: string, specSkillNames: Set<string>): string[] {
  const removed: string[] = [];
  if (!fs.existsSync(outputDir)) return removed;

  const existingDirs = fs
    .readdirSync(outputDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const dirName of existingDirs) {
    if (specSkillNames.has(dirName)) continue;
    const skillMdPath = path.join(outputDir, dirName, 'SKILL.md');
    if (fs.existsSync(skillMdPath)) {
      const content = fs.readFileSync(skillMdPath, 'utf-8');
      if (content.includes(GENERATED_HEADER_CODEX)) {
        removed.push(dirName);
      }
    }
  }
  return removed;
}
