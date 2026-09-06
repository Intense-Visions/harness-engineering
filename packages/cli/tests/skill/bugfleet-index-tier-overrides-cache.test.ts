import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { stringify } from 'yaml';
import { loadOrRebuildIndex } from '../../src/skill/index-builder';
import { resolveAllSkillsDirsWithSource } from '../../src/utils/paths';
import type { SkillsDirWithSource } from '../../src/utils/paths';

vi.mock('../../src/utils/paths', () => ({
  resolveAllSkillsDirsWithSource: vi.fn(() => []),
}));

const mockedResolveDirs = vi.mocked(resolveAllSkillsDirsWithSource);

/**
 * index-builder.loadOrRebuildIndex keys its cache purely on skill.yaml mtimes
 * (computeSkillsDirHash). `tierOverrides` is a THIRD input that materially
 * changes the built index (parseSkillEntry applies it to every entry's `tier`)
 * but never reaches the hash, so the cached index is served with the tiers of
 * whichever caller happened to build it first.
 *
 * Every production caller passes tierOverrides read from harness config
 * (mcp/tools/skill.ts, mcp/tools/search-skills.ts, mcp/tools/recommend-skills.ts,
 * commands/recommend.ts, commands/advise-skills.ts), so editing that config has
 * no effect until an unrelated skill.yaml mtime happens to change.
 */
describe('bugfleet: loadOrRebuildIndex ignores tierOverrides changes', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugfleet-tier-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeSkillYaml(dir: string, name: string): void {
    const skillDir = path.join(dir, name);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'skill.yaml'),
      stringify({
        name,
        version: '1.0.0',
        description: `Test skill ${name}`,
        triggers: ['manual'],
        platforms: ['claude-code'],
        tools: ['Read'],
        type: 'flexible',
        tier: 3,
      })
    );
  }

  it('applies a changed tierOverrides map instead of serving the cached tiers', () => {
    const skillsDir = path.join(tmpDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    writeSkillYaml(skillsDir, 'test-skill');
    const dirs: SkillsDirWithSource[] = [{ dir: skillsDir, source: 'project' }];
    mockedResolveDirs.mockReturnValue(dirs);

    // First caller overrides the skill to tier 1 and warms the on-disk cache.
    const first = loadOrRebuildIndex('claude-code', tmpDir, { 'test-skill': 1 });
    expect(first.skills['test-skill']!.tier).toBe(1);

    // Config now says tier 2. Nothing on disk changed, so the mtime hash matches
    // and the stale tier-1 index is returned.
    const second = loadOrRebuildIndex('claude-code', tmpDir, { 'test-skill': 2 });
    expect(second.skills['test-skill']!.tier).toBe(2);
  });
});
