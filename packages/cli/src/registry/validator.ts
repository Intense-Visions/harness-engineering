import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import semver from 'semver';
import { SkillMetadataSchema } from '../skill/schema';
import { getBundledSkillNames } from './bundled-skills';
import { resolveGlobalSkillsDir } from '../utils/paths';
import { resolvePackageName, fetchPackageMetadata } from './npm-client';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  skillMeta?: {
    name: string;
    version: string;
    description: string;
    platforms: string[];
    triggers: string[];
    type: string;
    tools: string[];
    depends_on: string[];
    repository?: string;
  };
}

/**
 * Run the pre-publish validation pipeline on a skill directory.
 * Returns a result with `valid` flag and array of error messages.
 */
export async function validateForPublish(
  skillDir: string,
  registryUrl?: string
): Promise<ValidationResult> {
  const errors: string[] = [];

  // 1. Check skill.yaml exists
  const skillYamlPath = path.join(skillDir, 'skill.yaml');
  if (!fs.existsSync(skillYamlPath)) {
    errors.push('skill.yaml not found. Create one with: harness skill create <name>');
    return { valid: false, errors };
  }

  // 2. Schema validation
  let skillMeta: ValidationResult['skillMeta'];
  try {
    const raw = fs.readFileSync(skillYamlPath, 'utf-8');
    const parsed = parse(raw);
    const result = SkillMetadataSchema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      errors.push(`skill.yaml validation failed: ${issues}`);
      return { valid: false, errors };
    }
    skillMeta = result.data as ValidationResult['skillMeta'];
  } catch (err) {
    errors.push(`Failed to parse skill.yaml: ${err instanceof Error ? err.message : String(err)}`);
    return { valid: false, errors };
  }

  // 3. Required fields — description non-empty
  if (!skillMeta!.description || skillMeta!.description.trim().length === 0) {
    errors.push('description must not be empty. Add a meaningful description to skill.yaml.');
  }

  // 4. Required fields — at least one platform
  if (!skillMeta!.platforms || skillMeta!.platforms.length === 0) {
    errors.push('At least one platform is required. Add platforms to skill.yaml.');
  }

  // 5. Required fields — at least one trigger
  if (!skillMeta!.triggers || skillMeta!.triggers.length === 0) {
    errors.push('At least one trigger is required. Add triggers to skill.yaml.');
  }

  // 6. SKILL.md exists and has required sections
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) {
    errors.push('SKILL.md not found. Create it with content describing your skill.');
  } else {
    const content = fs.readFileSync(skillMdPath, 'utf-8');
    if (!content.includes('## When to Use')) {
      errors.push('SKILL.md must contain a "## When to Use" section.');
    }
    if (!content.includes('## Process')) {
      errors.push('SKILL.md must contain a "## Process" section.');
    }
  }

  // 7. Name guard — no conflict with bundled skills
  const globalSkillsDir = resolveGlobalSkillsDir();
  const bundledNames = getBundledSkillNames(globalSkillsDir);
  if (bundledNames.has(skillMeta!.name)) {
    errors.push(
      `Skill name "${skillMeta!.name}" conflicts with a bundled skill. Choose a different name.`
    );
  }

  // 8. Version bump — check against published version
  try {
    const packageName = resolvePackageName(skillMeta!.name);
    const metadata = await fetchPackageMetadata(packageName, registryUrl);
    const publishedVersion = metadata['dist-tags']?.latest;
    if (publishedVersion && !semver.gt(skillMeta!.version, publishedVersion)) {
      errors.push(
        `Version ${skillMeta!.version} must be greater than published version ${publishedVersion}. Bump the version in skill.yaml.`
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Only swallow "not found" errors (first publish). Network errors should fail validation.
    if (!msg.includes('not found')) {
      errors.push(`Cannot verify version against npm registry: ${msg}`);
    }
  }

  // 9. Dependency check — all depends_on exist
  if (skillMeta!.depends_on && skillMeta!.depends_on.length > 0) {
    for (const dep of skillMeta!.depends_on) {
      if (bundledNames.has(dep)) continue; // Bundled skill
      try {
        const depPkg = resolvePackageName(dep);
        await fetchPackageMetadata(depPkg, registryUrl);
      } catch {
        errors.push(
          `Dependency "${dep}" not found on npm or as a bundled skill. Publish it first or remove from depends_on.`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    ...(skillMeta ? { skillMeta } : {}),
  };
}
