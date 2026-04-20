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
