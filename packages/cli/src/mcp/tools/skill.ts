import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { Ok, Err, extractLevel, computeLoadPlan } from '@harness-engineering/core';
import { resultToMcpResponse } from '../utils/result-adapter.js';
import type { McpToolResponse } from '../utils/result-adapter.js';
import { resolveSkillsDir } from '../../utils/paths.js';
import { sanitizePath } from '../utils/sanitize-path.js';
import { isTier1Skill, suggest, formatSuggestions } from '../../skill/dispatcher.js';
import { loadOrRebuildIndex } from '../../skill/index-builder.js';
import { loadOrGenerateProfile } from '../../skill/stack-profile.js';
import { resolveConfig } from '../../config/loader.js';

export const runSkillDefinition = {
  name: 'run_skill',
  description:
    'Load and return the content of a skill (SKILL.md), optionally with project state context',
  inputSchema: {
    type: 'object' as const,
    properties: {
      skill: { type: 'string', description: 'Skill name (e.g., harness-tdd)' },
      path: { type: 'string', description: 'Path to project root for state context injection' },
      complexity: {
        type: 'string',
        enum: ['fast', 'standard', 'thorough'],
        description: 'Rigor level: fast (minimal), standard (default), thorough (full)',
      },
      phase: { type: 'string', description: 'Start at a specific phase (re-entry)' },
      party: { type: 'boolean', description: 'Enable multi-perspective evaluation' },
      autoInject: {
        type: 'boolean',
        description:
          'When true, returns only the Instructions section (before ## Details) for knowledge skills',
      },
    },
    required: ['skill'],
  },
};

export async function handleRunSkill(input: {
  skill: string;
  path?: string;
  complexity?: 'fast' | 'standard' | 'thorough';
  phase?: string;
  party?: boolean;
  autoInject?: boolean;
}) {
  const skillsDir = resolveSkillsDir();
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(input.skill)) {
    return resultToMcpResponse(Err(new Error(`Invalid skill name: ${input.skill}`)));
  }
  const skillDir = path.join(skillsDir, input.skill);
  if (!skillDir.startsWith(skillsDir)) {
    return resultToMcpResponse(Err(new Error(`Invalid skill path: ${input.skill}`)));
  }

  if (!fs.existsSync(skillDir)) {
    return resultToMcpResponse(Err(new Error(`Skill not found: ${input.skill}`)));
  }

  const skillMdPath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) {
    return resultToMcpResponse(Err(new Error(`SKILL.md not found for skill: ${input.skill}`)));
  }

  let content = fs.readFileSync(skillMdPath, 'utf-8');

  // Progressive loading: apply on raw SKILL.md before any content mutations.
  // Load the index once and reuse it for both progressive loading and dispatcher.
  const projectRoot = input.path ? sanitizePath(input.path) : process.cwd();
  const configResult = resolveConfig();
  const skillsConfig = configResult.ok ? configResult.value.skills : undefined;
  let sharedIndex: ReturnType<typeof loadOrRebuildIndex> | undefined;

  try {
    sharedIndex = loadOrRebuildIndex('claude-code', projectRoot, skillsConfig?.tierOverrides);

    const plan = computeLoadPlan(
      Object.entries(sharedIndex.skills).map(([name, entry]) => {
        const skill: { name: string; budget?: { max_tokens: number; priority: number } } = { name };
        if (entry.contextBudget) {
          skill.budget = {
            max_tokens: entry.contextBudget.maxTokens,
            priority: entry.contextBudget.priority,
          };
        }
        return skill;
      })
    );

    const skillPlan = plan.find((p) => p.skillName === input.skill);
    if (skillPlan && skillPlan.level < 5) {
      content = extractLevel(content, skillPlan.level);
    }
  } catch {
    // Progressive loading failure must never block skill loading
  }

  // Optionally inject project state context
  if (input.path) {
    const projectPath = sanitizePath(input.path);
    const stateFile = path.join(projectPath, '.harness', 'state.json');
    if (fs.existsSync(stateFile)) {
      const stateContent = fs.readFileSync(stateFile, 'utf-8');
      content += `\n\n---\n## Project State\n\`\`\`json\n${stateContent}\n\`\`\`\n`;
    }
  }

  // Progressive disclosure for knowledge skills
  const skillYamlPath = path.join(skillDir, 'skill.yaml');
  if (fs.existsSync(skillYamlPath)) {
    try {
      const rawYaml = fs.readFileSync(skillYamlPath, 'utf-8');
      const skillMeta = parseYaml(rawYaml) as { type?: string };
      if (skillMeta.type === 'knowledge') {
        const boundary = content.indexOf('\n## Details');
        if (boundary !== -1 && input.autoInject === true) {
          content = content.slice(0, boundary);
        }
        // On-demand mode (autoInject: false or undefined): return full content
      }
    } catch {
      // YAML parse failure must never block skill loading
    }
  }

  // Dispatcher: inject domain skill suggestions for Tier 1 workflow skills
  if (isTier1Skill(input.skill)) {
    try {
      const index =
        sharedIndex ?? loadOrRebuildIndex('claude-code', projectRoot, skillsConfig?.tierOverrides);
      const profile = loadOrGenerateProfile(projectRoot);
      const taskDesc = [input.skill, input.phase].filter(Boolean).join(' ');
      const result = suggest(index, taskDesc, profile, [], skillsConfig);
      const suggestionText = formatSuggestions(result.suggestions);
      if (suggestionText) {
        content += suggestionText;
      }
    } catch {
      // Dispatcher failure must never block skill loading
    }
  }

  return resultToMcpResponse(Ok(content));
}

export const createSkillDefinition = {
  name: 'create_skill',
  description: 'Scaffold a new harness skill with skill.yaml and SKILL.md',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root directory' },
      name: { type: 'string', description: 'Skill name in kebab-case (e.g., my-new-skill)' },
      description: { type: 'string', description: 'Skill description' },
      cognitiveMode: {
        type: 'string',
        enum: [
          'adversarial-reviewer',
          'constructive-architect',
          'meticulous-implementer',
          'diagnostic-investigator',
          'advisory-guide',
          'meticulous-verifier',
        ],
        description: 'Cognitive mode (default: constructive-architect)',
      },
    },
    required: ['path', 'name', 'description'],
  },
};

export async function handleCreateSkill(input: {
  path: string;
  name: string;
  description: string;
  cognitiveMode?: string;
}): Promise<McpToolResponse> {
  try {
    const { generateSkillFiles } = await import('../../commands/create-skill.js');
    const result = generateSkillFiles({
      name: input.name,
      description: input.description,
      cognitiveMode: input.cognitiveMode ?? 'constructive-architect',
      outputDir: sanitizePath(input.path),
    });
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
