import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { initHooks } from '../../src/commands/hooks/init';
import { listHooks } from '../../src/commands/hooks/list';
import { removeHooks } from '../../src/commands/hooks/remove';

describe('hooks CLI integration: init -> list -> remove cycle', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-hooks-integration-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('full lifecycle: init -> list -> remove -> list', () => {
    // 1. Init with standard profile
    const initResult = initHooks({ profile: 'standard', projectDir: tmpDir });
    expect(initResult.copiedScripts.length).toBeGreaterThan(0);

    // 2. Verify files on disk
    expect(fs.existsSync(path.join(tmpDir, '.harness', 'hooks', 'profile.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'settings.json'))).toBe(true);

    // 3. Verify settings.json structure
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf-8')
    );
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.PreToolUse).toHaveLength(2); // block-no-verify + protect-config
    expect(settings.hooks.PostToolUse).toHaveLength(1); // quality-gate
    expect(settings.hooks.PreCompact).toHaveLength(1); // pre-compact-state
    expect(settings.hooks.Stop).toHaveLength(1); // adoption-tracker

    // 4. List shows correct state
    const listResult = listHooks(tmpDir);
    expect(listResult.installed).toBe(true);
    expect(listResult.profile).toBe('standard');
    expect(listResult.hooks).toHaveLength(5);

    // 5. Remove cleans everything
    const removeResult = removeHooks(tmpDir);
    expect(removeResult.removed).toBe(true);
    expect(removeResult.settingsCleaned).toBe(true);

    // 6. List shows nothing
    const listAfterRemove = listHooks(tmpDir);
    expect(listAfterRemove.installed).toBe(false);
    expect(listAfterRemove.hooks).toHaveLength(0);
  });

  it('idempotency: init twice produces same result', () => {
    initHooks({ profile: 'strict', projectDir: tmpDir });
    const settingsAfterFirst = fs.readFileSync(
      path.join(tmpDir, '.claude', 'settings.json'),
      'utf-8'
    );

    initHooks({ profile: 'strict', projectDir: tmpDir });
    const settingsAfterSecond = fs.readFileSync(
      path.join(tmpDir, '.claude', 'settings.json'),
      'utf-8'
    );

    expect(settingsAfterSecond).toBe(settingsAfterFirst);
  });

  it('profile switch: init minimal then init strict upgrades', () => {
    initHooks({ profile: 'minimal', projectDir: tmpDir });
    const minList = listHooks(tmpDir);
    expect(minList.hooks).toHaveLength(1);

    initHooks({ profile: 'strict', projectDir: tmpDir });
    const strictList = listHooks(tmpDir);
    expect(strictList.profile).toBe('strict');
    expect(strictList.hooks).toHaveLength(8);

    // Verify settings.json reflects strict
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf-8')
    );
    expect(settings.hooks.Stop).toHaveLength(2);
  });

  it('preserves existing .claude/settings.json content through full cycle', () => {
    // Set up pre-existing settings
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, 'settings.json'),
      JSON.stringify({ permissions: { allow: ['Read', 'Bash'] }, mcpServers: {} }, null, 2)
    );

    // Init
    initHooks({ profile: 'standard', projectDir: tmpDir });
    let settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf-8'));
    expect(settings.permissions).toEqual({ allow: ['Read', 'Bash'] });
    expect(settings.mcpServers).toEqual({});
    expect(settings.hooks).toBeDefined();

    // Remove
    removeHooks(tmpDir);
    settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf-8'));
    expect(settings.permissions).toEqual({ allow: ['Read', 'Bash'] });
    expect(settings.mcpServers).toEqual({});
    expect(settings.hooks).toBeUndefined();
  });
});
