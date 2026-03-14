import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Ok, Err } from '@harness-engineering/core';
import { resultToMcpResponse } from '../utils/result-adapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveSkillsDir(): string {
  return path.resolve(__dirname, '..', '..', '..', '..', 'agents', 'skills', 'claude-code');
}

export const runSkillDefinition = {
  name: 'run_skill',
  description: 'Load and return the content of a skill (SKILL.md), optionally with project state context',
  inputSchema: {
    type: 'object' as const,
    properties: {
      skill: { type: 'string', description: 'Skill name (e.g., harness-tdd)' },
      path: { type: 'string', description: 'Path to project root for state context injection' },
    },
    required: ['skill'],
  },
};

export async function handleRunSkill(input: { skill: string; path?: string }) {
  const skillsDir = resolveSkillsDir();
  const skillDir = path.join(skillsDir, input.skill);

  if (!fs.existsSync(skillDir)) {
    return resultToMcpResponse(Err(new Error(`Skill not found: ${input.skill}`)));
  }

  const skillMdPath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) {
    return resultToMcpResponse(Err(new Error(`SKILL.md not found for skill: ${input.skill}`)));
  }

  let content = fs.readFileSync(skillMdPath, 'utf-8');

  // Optionally inject project state context
  if (input.path) {
    const projectPath = path.resolve(input.path);
    const stateFile = path.join(projectPath, '.harness', 'state.json');
    if (fs.existsSync(stateFile)) {
      const stateContent = fs.readFileSync(stateFile, 'utf-8');
      content += `\n\n---\n## Project State\n\`\`\`json\n${stateContent}\n\`\`\`\n`;
    }
  }

  return resultToMcpResponse(Ok(content));
}
