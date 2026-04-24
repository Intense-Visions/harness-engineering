// agents/skills/tests/initialize-test-suite-project.test.ts
//
// Contract tests for the initialize-test-suite-project skill. Generic schema,
// structure, and platform-parity checks live in the sibling *.test.ts files;
// this file locks in invariants specific to this skill — its composition with
// initialize-harness-project, phase structure, and the cross-file references
// that make the slash command and docs discoverable.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, '..');
const REPO_ROOT = resolve(SKILLS_DIR, '..', '..');

const SKILL_NAME = 'initialize-test-suite-project';
const PARENT_SKILL = 'initialize-harness-project';
const PLATFORMS = ['claude-code', 'gemini-cli', 'cursor', 'codex'] as const;

function readSkillYaml(platform: string): Record<string, unknown> {
  const path = resolve(SKILLS_DIR, platform, SKILL_NAME, 'skill.yaml');
  return parse(readFileSync(path, 'utf-8'));
}

function readSkillMd(platform: string): string {
  return readFileSync(resolve(SKILLS_DIR, platform, SKILL_NAME, 'SKILL.md'), 'utf-8');
}

describe('initialize-test-suite-project metadata', () => {
  it.each(PLATFORMS)('%s skill.yaml declares correct name and tier', (platform) => {
    const meta = readSkillYaml(platform);
    expect(meta.name).toBe(SKILL_NAME);
    expect(meta.tier).toBe(1);
    expect(meta.type).toBe('flexible');
    expect(meta.cognitive_mode).toBe('constructive-architect');
  });

  it.each(PLATFORMS)('%s skill.yaml depends on initialize-harness-project', (platform) => {
    const meta = readSkillYaml(platform);
    expect(meta.depends_on).toContain(PARENT_SKILL);
  });

  it.each(PLATFORMS)('%s skill.yaml is registered for all four platforms', (platform) => {
    const meta = readSkillYaml(platform) as { platforms: string[] };
    for (const p of PLATFORMS) {
      expect(meta.platforms).toContain(p);
    }
  });

  it.each(PLATFORMS)('%s skill.yaml does not set a custom command_namespace', (platform) => {
    const meta = readSkillYaml(platform) as Record<string, unknown>;
    expect(meta.command_namespace).toBeUndefined();
  });
});

describe('initialize-test-suite-project SKILL.md structure', () => {
  const REQUIRED_PHASES = [
    '### Phase 1: CLASSIFY',
    '### Phase 2: DECIDE',
    '### Phase 3: CONFIGURE',
    '### Phase 4: VALIDATE',
  ];

  it.each(PLATFORMS)('%s SKILL.md declares all four phases', (platform) => {
    const body = readSkillMd(platform);
    for (const phase of REQUIRED_PHASES) {
      expect(body, `missing phase heading "${phase}" in ${platform}`).toContain(phase);
    }
  });

  it.each(PLATFORMS)('%s SKILL.md names all three archetypes', (platform) => {
    const body = readSkillMd(platform);
    expect(body).toMatch(/API test suite/i);
    expect(body).toMatch(/E2E ?\/ ?UI/i);
    expect(body).toMatch(/Shared test library/i);
  });

  it.each(PLATFORMS)('%s SKILL.md documents both layer variants A and B', (platform) => {
    const body = readSkillMd(platform);
    expect(body).toMatch(/Variant A/);
    expect(body).toMatch(/Variant B/);
  });

  it.each(PLATFORMS)(
    '%s SKILL.md includes the "Prove the guards fire" verification step',
    (platform) => {
      const body = readSkillMd(platform);
      expect(body).toMatch(/Prove the [Gg]uards [Ff]ire/);
    }
  );

  it.each(PLATFORMS)('%s SKILL.md describes the custom report scaffolding', (platform) => {
    const body = readSkillMd(platform);
    expect(body).toMatch(/scripts\/generate-reports\.ts/);
  });

  it.each(PLATFORMS)('%s SKILL.md documents quarantine tag grepInvert', (platform) => {
    const body = readSkillMd(platform);
    expect(body).toMatch(/grepInvert/);
    expect(body).toMatch(/@known-failure/);
    expect(body).toMatch(/@wip/);
  });

  it.each(PLATFORMS)('%s SKILL.md hands control back to parent skill', (platform) => {
    const body = readSkillMd(platform);
    expect(body).toContain(PARENT_SKILL);
  });
});

describe('initialize-test-suite-project composition with initialize-harness-project', () => {
  it.each(PLATFORMS)('%s parent skill dispatches to initialize-test-suite-project', (platform) => {
    const parentPath = resolve(SKILLS_DIR, platform, PARENT_SKILL, 'SKILL.md');
    if (!existsSync(parentPath)) return;
    const parent = readFileSync(parentPath, 'utf-8');
    expect(
      parent,
      `${platform}/${PARENT_SKILL}/SKILL.md must reference ${SKILL_NAME} for dispatch`
    ).toContain(SKILL_NAME);
  });
});

describe('initialize-test-suite-project cross-file registration', () => {
  it('is listed in docs/reference/skills-catalog.md under Tier 1', () => {
    const catalog = readFileSync(
      resolve(REPO_ROOT, 'docs', 'reference', 'skills-catalog.md'),
      'utf-8'
    );
    const tier1Section = catalog.split('## Tier 2')[0] ?? '';
    expect(tier1Section).toContain(`### ${SKILL_NAME}`);
  });

  it('is referenced in docs/guides/qa-quickstart.md as a slash command', () => {
    const guide = readFileSync(resolve(REPO_ROOT, 'docs', 'guides', 'qa-quickstart.md'), 'utf-8');
    expect(guide).toContain(`/harness:${SKILL_NAME}`);
  });

  it('is referenced in docs/guides/features-overview.md', () => {
    const overview = readFileSync(
      resolve(REPO_ROOT, 'docs', 'guides', 'features-overview.md'),
      'utf-8'
    );
    expect(overview).toContain(`/harness:${SKILL_NAME}`);
  });

  it('is listed in agents/skills/README.md Setup section', () => {
    const readme = readFileSync(resolve(SKILLS_DIR, 'README.md'), 'utf-8');
    expect(readme).toContain(SKILL_NAME);
  });
});
