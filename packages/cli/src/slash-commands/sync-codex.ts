import fs from 'node:fs';
import path from 'node:path';
import { renderCodexSkill, renderCodexOpenaiYaml } from './render-codex';
import { renderCodexPrompt } from './render-codex-prompt';
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

    const renderedSkillMd = renderCodexSkill(skillMd, spec);
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

export interface CodexPromptSyncResult {
  added: string[];
  updated: string[];
  removed: string[];
  unchanged: string[];
}

/**
 * Writes one prompt file per skill at `<promptsDir>/<skillYamlName>.md`. Codex
 * surfaces these as `/prompts:<skillYamlName>` in its slash menu — the only
 * mechanism for slash-menu discovery, since skills proper are invoked via `$`,
 * `/skills`, or auto-detection (not as individual slash commands).
 *
 * Removes harness-generated prompt files whose corresponding skill no longer
 * exists, identified by the GENERATED_HEADER_CODEX substring.
 */
export function computeCodexPromptsSync(
  promptsDir: string,
  specs: SlashCommandSpec[],
  dryRun: boolean
): CodexPromptSyncResult {
  const added: string[] = [];
  const updated: string[] = [];
  const unchanged: string[] = [];
  const renderedNames = new Set<string>();

  if (!dryRun) {
    fs.mkdirSync(promptsDir, { recursive: true });
  }

  for (const spec of specs) {
    const filename = `${spec.skillYamlName}.md`;
    renderedNames.add(filename);
    const filePath = path.join(promptsDir, filename);
    const rendered = renderCodexPrompt(spec);

    if (!fs.existsSync(filePath)) {
      added.push(filename);
    } else {
      const existing = fs.readFileSync(filePath, 'utf-8');
      if (existing === rendered) {
        unchanged.push(filename);
      } else {
        updated.push(filename);
      }
    }

    if (!dryRun && !unchanged.includes(filename)) {
      fs.writeFileSync(filePath, rendered, 'utf-8');
    }
  }

  const removed: string[] = [];
  if (fs.existsSync(promptsDir)) {
    const entries = fs.readdirSync(promptsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      if (renderedNames.has(entry.name)) continue;
      const content = fs.readFileSync(path.join(promptsDir, entry.name), 'utf-8');
      if (content.includes(GENERATED_HEADER_CODEX)) {
        removed.push(entry.name);
      }
    }
  }

  return { added, updated, removed, unchanged };
}

/**
 * Detects harness-generated skill directories left in the legacy Codex location
 * (`~/.codex/harness/`) from older harness versions, before Codex's skill
 * discovery directory (`~/.codex/skills/`) was the output target. Returns
 * directory names whose SKILL.md carries the harness generated-header; only
 * those are safe to remove.
 */
export function detectLegacyCodexOrphans(legacyDir: string): string[] {
  const orphans: string[] = [];
  if (!fs.existsSync(legacyDir)) return orphans;

  const entries = fs.readdirSync(legacyDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  for (const entry of entries) {
    const skillMdPath = path.join(legacyDir, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) continue;
    const content = fs.readFileSync(skillMdPath, 'utf-8');
    if (content.includes(GENERATED_HEADER_CODEX)) {
      orphans.push(entry.name);
    }
  }
  return orphans;
}
