import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

export async function getSkillsResource(projectRoot: string): Promise<string> {
  const skillsDir = path.join(projectRoot, 'agents', 'skills', 'claude-code');
  const skills: Record<string, unknown>[] = [];

  if (!fs.existsSync(skillsDir)) {
    return JSON.stringify(skills, null, 2);
  }

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillYamlPath = path.join(skillsDir, entry.name, 'skill.yaml');
    if (!fs.existsSync(skillYamlPath)) continue;

    try {
      const content = fs.readFileSync(skillYamlPath, 'utf-8');
      const parsed = yaml.parse(content);
      skills.push({
        name: parsed.name,
        description: parsed.description,
        cognitive_mode: parsed.cognitive_mode,
        type: parsed.type,
        triggers: parsed.triggers,
      });
    } catch {
      /* skip malformed skill files */
    }
  }

  return JSON.stringify(skills, null, 2);
}
