import { describe, it, expect } from 'vitest';
import { getSkillsResource } from '../../src/resources/skills';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../../../..');

describe('getSkillsResource', () => {
  it('returns skills from the project root', async () => {
    const result = await getSkillsResource(PROJECT_ROOT);
    const skills = JSON.parse(result);
    expect(Array.isArray(skills)).toBe(true);
    expect(skills.length).toBeGreaterThan(0);
    expect(skills[0]).toHaveProperty('name');
    expect(skills[0]).toHaveProperty('description');
    expect(skills[0]).toHaveProperty('cognitive_mode');
  });

  it('returns empty array for non-existent path', async () => {
    const result = await getSkillsResource('/tmp/nonexistent-project');
    const skills = JSON.parse(result);
    expect(skills).toEqual([]);
  });
});
