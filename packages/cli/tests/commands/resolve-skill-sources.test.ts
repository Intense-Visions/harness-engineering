import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let tmpBase: string;
let projectSkillsDir: string;
let globalSkillsDir: string;

vi.mock('../../src/utils/paths', () => ({
  resolveProjectSkillsDir: () =>
    (globalThis as Record<string, unknown>).__testProjectSkillsDir as string | null,
  resolveGlobalSkillsDir: () =>
    (globalThis as Record<string, unknown>).__testGlobalSkillsDir as string,
  resolveCommunitySkillsDir: () =>
    (globalThis as Record<string, unknown>).__testCommunitySkillsDir as string,
  resolveGlobalCommunitySkillsDir: () =>
    (globalThis as Record<string, unknown>).__testGlobalCommunitySkillsDir as string,
}));

import { resolveSkillSources } from '../../src/commands/generate-slash-commands';

describe('resolveSkillSources - global flag includes built-in skills', () => {
  beforeEach(() => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-sources-'));

    // Create a "project" skills dir with one skill (simulating third-party install)
    projectSkillsDir = path.join(tmpBase, 'project', 'skills');
    const projSkillDir = path.join(projectSkillsDir, 'capillary-ui');
    fs.mkdirSync(projSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(projSkillDir, 'skill.yaml'),
      'name: capillary-ui\nversion: "1.0.0"\ndescription: test\nplatforms:\n  - claude-code\ntype: rigid\ntier: 1\n'
    );
    fs.writeFileSync(path.join(projSkillDir, 'SKILL.md'), '# Capillary UI\n');

    // Create a separate "global" skills dir with a core skill
    globalSkillsDir = path.join(tmpBase, 'global', 'skills');
    const globalSkillDir = path.join(globalSkillsDir, 'harness-debugging');
    fs.mkdirSync(globalSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalSkillDir, 'skill.yaml'),
      'name: harness-debugging\nversion: "1.0.0"\ndescription: debugging\nplatforms:\n  - claude-code\ntype: rigid\ntier: 1\n'
    );
    fs.writeFileSync(path.join(globalSkillDir, 'SKILL.md'), '# Debugging\n');

    // Point mocks at the temp directories
    (globalThis as Record<string, unknown>).__testProjectSkillsDir = projectSkillsDir;
    (globalThis as Record<string, unknown>).__testGlobalSkillsDir = globalSkillsDir;
    (globalThis as Record<string, unknown>).__testCommunitySkillsDir = path.join(
      tmpBase,
      'nonexistent-community'
    );
    (globalThis as Record<string, unknown>).__testGlobalCommunitySkillsDir = path.join(
      tmpBase,
      'nonexistent-global-community'
    );
  });

  afterEach(() => {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  it('includes global skills dir when global flag is true, even with project skills present', () => {
    // Regression test: --global without --include-global used to exclude built-in
    // global skills when project skills existed, causing core commands to be orphaned.
    const sources = resolveSkillSources({
      platforms: ['claude-code'],
      global: true,
      includeGlobal: false,
      skillsDir: '',
      dryRun: false,
      yes: false,
    });

    const hasGlobalSource = sources.some((s) => s.source === 'global');
    expect(hasGlobalSource).toBe(true);
  });

  it('includes global skills dir when includeGlobal is true', () => {
    const sources = resolveSkillSources({
      platforms: ['claude-code'],
      global: false,
      includeGlobal: true,
      skillsDir: '',
      dryRun: false,
      yes: false,
    });

    const hasGlobalSource = sources.some((s) => s.source === 'global');
    expect(hasGlobalSource).toBe(true);
  });

  it('does not include global skills dir when neither global nor includeGlobal is set and project skills exist', () => {
    const sources = resolveSkillSources({
      platforms: ['claude-code'],
      global: false,
      includeGlobal: false,
      skillsDir: '',
      dryRun: false,
      yes: false,
    });

    const hasGlobalSource = sources.some((s) => s.source === 'global');
    expect(hasGlobalSource).toBe(false);
  });

  it('falls back to global skills dir when no other sources exist', () => {
    // Simulate no project or community skills
    (globalThis as Record<string, unknown>).__testProjectSkillsDir = null;

    const sources = resolveSkillSources({
      platforms: ['claude-code'],
      global: false,
      includeGlobal: false,
      skillsDir: '',
      dryRun: false,
      yes: false,
    });

    const hasGlobalSource = sources.some((s) => s.source === 'global');
    expect(hasGlobalSource).toBe(true);
  });
});

describe('resolveSkillSources - skillsDirOnly scopes to the repo skills tree (#704)', () => {
  let repoSkillsDir: string;
  let globalCommunityDir: string;

  beforeEach(() => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-sources-repo-'));

    // The repo's OWN skills tree (what generate-plugin.mjs passes via --skills-dir).
    repoSkillsDir = path.join(tmpBase, 'repo', 'agents', 'skills', 'claude-code');
    const repoSkill = path.join(repoSkillsDir, 'harness-debugging');
    fs.mkdirSync(repoSkill, { recursive: true });
    fs.writeFileSync(path.join(repoSkill, 'skill.yaml'), 'name: harness-debugging\n');
    fs.writeFileSync(path.join(repoSkill, 'SKILL.md'), '# Debugging\n');

    // A machine-wide global community install with a FOREIGN third-party skill.
    // This is the source of the #704 leak: it must NOT appear in repo artifacts.
    globalCommunityDir = path.join(
      tmpBase,
      'home',
      '.harness',
      'skills',
      'community',
      'claude-code'
    );
    const foreignSkill = path.join(globalCommunityDir, 'third-party-foreign');
    fs.mkdirSync(foreignSkill, { recursive: true });
    fs.writeFileSync(path.join(foreignSkill, 'skill.yaml'), 'name: third-party-foreign\n');
    fs.writeFileSync(path.join(foreignSkill, 'SKILL.md'), '# Foreign\n');

    // Point every ambient resolver at real, existing dirs so the additive path
    // WOULD pull them in if scoping is broken.
    (globalThis as Record<string, unknown>).__testProjectSkillsDir = repoSkillsDir;
    (globalThis as Record<string, unknown>).__testGlobalSkillsDir = repoSkillsDir;
    (globalThis as Record<string, unknown>).__testCommunitySkillsDir = globalCommunityDir;
    (globalThis as Record<string, unknown>).__testGlobalCommunitySkillsDir = globalCommunityDir;
  });

  afterEach(() => {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  it('returns ONLY the --skills-dir tree when skillsDirOnly is set, excluding global community skills', () => {
    const sources = resolveSkillSources({
      platforms: ['claude-code'],
      global: false,
      includeGlobal: false,
      skillsDir: repoSkillsDir,
      skillsDirOnly: true,
      dryRun: false,
      yes: false,
    });

    // Exactly one source: the repo skills dir passed via --skills-dir.
    expect(sources).toHaveLength(1);
    expect(path.resolve(sources[0].dir)).toBe(path.resolve(repoSkillsDir));

    // No source resolves into the machine-wide global community tree.
    const leaksGlobalCommunity = sources.some(
      (s) => path.resolve(s.dir) === path.resolve(globalCommunityDir)
    );
    expect(leaksGlobalCommunity).toBe(false);
    // No global fallback source is added either.
    expect(sources.some((s) => s.source === 'global')).toBe(false);
  });

  it('WITHOUT skillsDirOnly, the same call additively leaks the global community tree (documents the bug)', () => {
    const sources = resolveSkillSources({
      platforms: ['claude-code'],
      global: false,
      includeGlobal: false,
      skillsDir: repoSkillsDir,
      dryRun: false,
      yes: false,
    });

    const leaksGlobalCommunity = sources.some(
      (s) => path.resolve(s.dir) === path.resolve(globalCommunityDir)
    );
    expect(leaksGlobalCommunity).toBe(true);
  });
});
