// agents/skills/tests/platform-parity.test.ts
//
// Ensures all AI platform variations (claude-code, gemini-cli) of skills
// exist and are in sync. Every skill must be present in every platform
// directory with identical SKILL.md and skill.yaml files.

import { describe, it, expect } from 'vitest';
import { glob } from 'glob';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ALLOWED_PLATFORMS } from './schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, '..');

// Discover all platform directories
const platforms = ALLOWED_PLATFORMS.filter((p) => existsSync(resolve(SKILLS_DIR, p)));

// Files that must exist and be identical in every platform
const SKILL_FILES = ['SKILL.md', 'skill.yaml'];

// Collect all skill names across all platforms
function getAllSkillNames(): Map<string, Set<string>> {
  const skillsByPlatform = new Map<string, Set<string>>();

  for (const platform of platforms) {
    const dirs = glob.sync('*/', {
      cwd: resolve(SKILLS_DIR, platform),
      ignore: ['node_modules/'],
    });
    const names = new Set(
      dirs
        .map((d) => d.replace(/\/$/, ''))
        .filter((name) => {
          // Only include directories that have at least one skill file
          return SKILL_FILES.some((f) => existsSync(resolve(SKILLS_DIR, platform, name, f)));
        })
    );
    skillsByPlatform.set(platform, names);
  }

  return skillsByPlatform;
}

describe('platform parity', () => {
  if (platforms.length < 2) {
    it.skip('fewer than 2 platform directories found', () => {});
    return;
  }

  const skillsByPlatform = getAllSkillNames();

  // Get the union of all skill names across platforms
  const allSkillNames = new Set<string>();
  for (const names of skillsByPlatform.values()) {
    for (const name of names) {
      allSkillNames.add(name);
    }
  }

  if (allSkillNames.size === 0) {
    it.skip('no skills found in any platform', () => {});
    return;
  }

  describe('every skill exists in all platforms', () => {
    const cases = Array.from(allSkillNames)
      .sort()
      .flatMap((skill) => platforms.map((platform) => ({ skill, platform })));

    it.each(cases)('$skill exists in $platform', ({ skill, platform }) => {
      const skillDir = resolve(SKILLS_DIR, platform, skill);
      expect(
        existsSync(skillDir),
        `Skill "${skill}" is missing from platform "${platform}". ` +
          `It exists in: ${platforms.filter((p) => skillsByPlatform.get(p)?.has(skill)).join(', ')}`
      ).toBe(true);
    });
  });

  describe('skill files are identical across platforms', () => {
    // Use the first platform as the reference
    const [referencePlatform, ...otherPlatforms] = platforms;

    const cases = Array.from(allSkillNames)
      .sort()
      .flatMap((skill) =>
        SKILL_FILES.flatMap((file) => otherPlatforms.map((platform) => ({ skill, file, platform })))
      );

    it.each(cases)(
      '$skill/$file is identical in $platform vs ' + platforms[0],
      ({ skill, file, platform }) => {
        const refPath = resolve(SKILLS_DIR, referencePlatform!, skill, file);
        const otherPath = resolve(SKILLS_DIR, platform, skill, file);

        if (!existsSync(refPath) || !existsSync(otherPath)) {
          // Missing file is caught by the existence test above
          return;
        }

        const refContent = readFileSync(refPath, 'utf-8');
        const otherContent = readFileSync(otherPath, 'utf-8');

        expect(
          otherContent,
          `${skill}/${file} differs between ${referencePlatform} and ${platform}. ` +
            `Run: cp agents/skills/${referencePlatform}/${skill}/${file} agents/skills/${platform}/${skill}/${file}`
        ).toBe(refContent);
      }
    );
  });

  describe('platform skill counts match', () => {
    it('all platforms have the same number of skills', () => {
      const counts = platforms.map((p) => ({
        platform: p,
        count: skillsByPlatform.get(p)?.size ?? 0,
      }));

      const first = counts[0]!;
      for (const { platform, count } of counts.slice(1)) {
        expect(
          count,
          `Platform "${platform}" has ${count} skills but "${first.platform}" has ${first.count}`
        ).toBe(first.count);
      }
    });
  });
});
