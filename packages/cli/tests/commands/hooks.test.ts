import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createHooksCommand } from '../../src/commands/hooks/index';
import { initHooks, buildSettingsHooks, mergeSettings } from '../../src/commands/hooks/init';
import { listHooks } from '../../src/commands/hooks/list';
import { removeHooks } from '../../src/commands/hooks/remove';

describe('createHooksCommand', () => {
  it('creates hooks command with init, list, remove subcommands', () => {
    const cmd = createHooksCommand();
    expect(cmd.name()).toBe('hooks');
    const subcommands = cmd.commands.map((c) => c.name());
    expect(subcommands).toContain('init');
    expect(subcommands).toContain('list');
    expect(subcommands).toContain('remove');
  });
});

describe('buildSettingsHooks', () => {
  it('builds minimal profile with only block-no-verify', () => {
    const hooks = buildSettingsHooks('minimal');
    expect(hooks.PreToolUse).toHaveLength(1);
    expect(hooks.PreToolUse[0].matcher).toBe('Bash');
    expect(hooks.PreToolUse[0].hooks[0].command).toContain('block-no-verify.js');
    expect(hooks.PostToolUse).toBeUndefined();
    expect(hooks.PreCompact).toBeUndefined();
    expect(hooks.Stop).toBeUndefined();
  });

  it('builds standard profile with 4 hooks across 3 events', () => {
    const hooks = buildSettingsHooks('standard');
    expect(hooks.PreToolUse).toHaveLength(2);
    expect(hooks.PostToolUse).toHaveLength(1);
    expect(hooks.PreCompact).toHaveLength(1);
    expect(hooks.Stop).toBeUndefined();
  });

  it('builds strict profile with all 5 hooks across 4 events', () => {
    const hooks = buildSettingsHooks('strict');
    expect(hooks.PreToolUse).toHaveLength(2);
    expect(hooks.PostToolUse).toHaveLength(1);
    expect(hooks.PreCompact).toHaveLength(1);
    expect(hooks.Stop).toHaveLength(1);
    expect(hooks.Stop[0].hooks[0].command).toContain('cost-tracker.js');
  });
});

describe('mergeSettings', () => {
  it('preserves existing non-hook keys', () => {
    const existing = { permissions: { allow: ['Bash'] }, customKey: 'value' };
    const result = mergeSettings(existing, { PreToolUse: [] });
    expect(result.permissions).toEqual({ allow: ['Bash'] });
    expect(result.customKey).toBe('value');
    expect(result.hooks).toEqual({ PreToolUse: [] });
  });

  it('replaces existing hooks key', () => {
    const existing = { hooks: { OldEvent: [] } };
    const result = mergeSettings(existing, { PreToolUse: [] });
    expect(result.hooks).toEqual({ PreToolUse: [] });
  });
});

describe('initHooks', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-hooks-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .harness/hooks/ directory with profile.json', () => {
    const result = initHooks({ profile: 'standard', projectDir: tmpDir });
    const profilePath = path.join(tmpDir, '.harness', 'hooks', 'profile.json');
    expect(fs.existsSync(profilePath)).toBe(true);
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
    expect(profile).toEqual({ profile: 'standard' });
    expect(result.profilePath).toBe(profilePath);
  });

  it('creates .claude/settings.json with hooks entries', () => {
    initHooks({ profile: 'minimal', projectDir: tmpDir });
    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    expect(fs.existsSync(settingsPath)).toBe(true);
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.PreToolUse).toHaveLength(1);
  });

  it('preserves existing settings.json content', () => {
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, 'settings.json'),
      JSON.stringify({ permissions: { allow: ['Read'] } })
    );
    initHooks({ profile: 'minimal', projectDir: tmpDir });
    const settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf-8'));
    expect(settings.permissions).toEqual({ allow: ['Read'] });
    expect(settings.hooks).toBeDefined();
  });

  it('is idempotent -- running twice produces same result', () => {
    initHooks({ profile: 'standard', projectDir: tmpDir });
    const first = fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf-8');
    initHooks({ profile: 'standard', projectDir: tmpDir });
    const second = fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf-8');
    expect(second).toBe(first);
  });

  it('throws on malformed settings.json', () => {
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{ broken json');
    expect(() => initHooks({ profile: 'minimal', projectDir: tmpDir })).toThrow(
      /Malformed .claude\/settings.json/
    );
  });

  it('cleans stale scripts on profile downgrade', () => {
    initHooks({ profile: 'strict', projectDir: tmpDir });
    const hooksDir = path.join(tmpDir, '.harness', 'hooks');
    // strict has 5 scripts
    const strictFiles = fs.readdirSync(hooksDir).filter((f) => f.endsWith('.js'));
    expect(strictFiles.length).toBeGreaterThan(1);

    initHooks({ profile: 'minimal', projectDir: tmpDir });
    const minimalFiles = fs.readdirSync(hooksDir).filter((f) => f.endsWith('.js'));
    expect(minimalFiles).toEqual(['block-no-verify.js']);
  });
});

describe('listHooks', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-hooks-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns installed: false when no hooks are present', () => {
    const result = listHooks(tmpDir);
    expect(result.installed).toBe(false);
    expect(result.profile).toBeNull();
    expect(result.hooks).toHaveLength(0);
  });

  it('returns installed hooks after init', () => {
    initHooks({ profile: 'strict', projectDir: tmpDir });
    const result = listHooks(tmpDir);
    expect(result.installed).toBe(true);
    expect(result.profile).toBe('strict');
    expect(result.hooks).toHaveLength(5);
  });

  it('returns correct hook metadata', () => {
    initHooks({ profile: 'minimal', projectDir: tmpDir });
    const result = listHooks(tmpDir);
    expect(result.hooks).toHaveLength(1);
    expect(result.hooks[0].name).toBe('block-no-verify');
    expect(result.hooks[0].event).toBe('PreToolUse');
    expect(result.hooks[0].matcher).toBe('Bash');
  });

  it('returns warning and defaults to standard on malformed profile.json', () => {
    const hooksDir = path.join(tmpDir, '.harness', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(hooksDir, 'profile.json'), '{ broken json');
    const result = listHooks(tmpDir);
    expect(result.installed).toBe(true);
    expect(result.profile).toBe('standard');
    expect(result.warning).toContain('Malformed profile.json');
  });

  it('defaults to standard when profile value is invalid', () => {
    const hooksDir = path.join(tmpDir, '.harness', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(hooksDir, 'profile.json'), JSON.stringify({ profile: 'unknown' }));
    const result = listHooks(tmpDir);
    expect(result.installed).toBe(true);
    expect(result.profile).toBe('standard');
  });
});

describe('removeHooks', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-hooks-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns removed: false when no hooks are present', () => {
    const result = removeHooks(tmpDir);
    expect(result.removed).toBe(false);
    expect(result.settingsCleaned).toBe(false);
  });

  it('removes .harness/hooks/ directory after init', () => {
    initHooks({ profile: 'standard', projectDir: tmpDir });
    expect(fs.existsSync(path.join(tmpDir, '.harness', 'hooks'))).toBe(true);
    const result = removeHooks(tmpDir);
    expect(result.removed).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.harness', 'hooks'))).toBe(false);
  });

  it('removes hooks key from settings.json preserving other keys', () => {
    // Set up settings with both hooks and other content
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, 'settings.json'),
      JSON.stringify({ permissions: { allow: ['Read'] }, hooks: { PreToolUse: [] } })
    );
    fs.mkdirSync(path.join(tmpDir, '.harness', 'hooks'), { recursive: true });

    const result = removeHooks(tmpDir);
    expect(result.settingsCleaned).toBe(true);

    const settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf-8'));
    expect(settings.hooks).toBeUndefined();
    expect(settings.permissions).toEqual({ allow: ['Read'] });
  });

  it('deletes settings.json if hooks was the only key', () => {
    initHooks({ profile: 'minimal', projectDir: tmpDir });
    const result = removeHooks(tmpDir);
    expect(result.settingsCleaned).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'settings.json'))).toBe(false);
  });
});
