export interface DerivedPackageJson {
  name: string;
  version: string;
  description: string;
  keywords: string[];
  files: string[];
  license: string;
  repository?: { type: string; url: string };
}

interface SkillInput {
  name: string;
  version: string;
  description: string;
  platforms: string[];
  triggers: string[];
  type: string;
  tools: string[];
  depends_on: string[];
  repository?: string;
}

/**
 * Derive a package.json object from skill.yaml metadata.
 * This is used by `harness skills publish` to generate/update package.json.
 */
export function derivePackageJson(skill: SkillInput): DerivedPackageJson {
  const keywords = ['harness-skill', ...skill.platforms, ...skill.triggers];

  const pkg: DerivedPackageJson = {
    name: `@harness-skills/${skill.name}`,
    version: skill.version,
    description: skill.description,
    keywords,
    files: ['skill.yaml', 'SKILL.md', 'README.md'],
    license: 'MIT',
  };

  if (skill.repository) {
    pkg.repository = {
      type: 'git',
      url: skill.repository,
    };
  }

  return pkg;
}
