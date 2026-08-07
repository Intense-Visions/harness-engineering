import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHooksCommand } from '../../src/commands/hooks/index';
import {
  initHooks,
  buildSettingsHooks,
  buildHookCommand,
  mergeSettings,
} from '../../src/commands/hooks/init';
import { listHooks } from '../../src/commands/hooks/list';
import { removeHooks } from '../../src/commands/hooks/remove';
import { addHooks } from '../../src/commands/hooks/add';

describe('createHooksCommand', () => {
  it('creates hooks command with init, list, remove subcommands', () => {
    const cmd = createHooksCommand();
    expect(cmd.name()).toBe('hooks');
    const subcommands = cmd.commands.map((c) => c.name());
    expect(subcommands).toContain('init');
    expect(subcommands).toContain('list');
    expect(subcommands).toContain('remove');
    expect(subcommands).toContain('add');
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

  it('builds standard profile with 8 hooks across 4 events', () => {
    const hooks = buildSettingsHooks('standard');
    expect(hooks.PreToolUse).toHaveLength(3); // block-no-verify, protect-config, sentinel-pre
    expect(hooks.PostToolUse).toHaveLength(2); // quality-warner, sentinel-post
    expect(hooks.PreCompact).toHaveLength(1);
    expect(hooks.Stop).toHaveLength(2);
    expect(hooks.Stop[0].hooks[0].command).toContain('adoption-tracker.js');
    expect(hooks.Stop[1].hooks[0].command).toContain('telemetry-reporter.js');
  });

  it('builds strict profile with all 10 hooks across 4 events', () => {
    const hooks = buildSettingsHooks('strict');
    expect(hooks.PreToolUse).toHaveLength(3); // block-no-verify, protect-config, sentinel-pre (all from standard)
    expect(hooks.PostToolUse).toHaveLength(3); // quality-warner, sentinel-post (from standard), strict-quality-gate
    expect(hooks.PreCompact).toHaveLength(1);
    expect(hooks.Stop).toHaveLength(3);
    expect(hooks.Stop[0].hooks[0].command).toContain('adoption-tracker.js');
    expect(hooks.Stop[1].hooks[0].command).toContain('telemetry-reporter.js');
    expect(hooks.Stop[2].hooks[0].command).toContain('cost-tracker.js');
  });
});

// Regression for #990: the generated command used
// `node "$(git rev-parse --show-toplevel)/.harness/hooks/<name>.js"`, which
// (1) pointed at the *worktree* root in a linked worktree — where machine-local
// `.harness/` does not exist — so gates silently stopped protecting worktree
// sessions, and (2) spammed `fatal: not a git repository` in a non-repo cwd.
// The command must resolve against the MAIN checkout and be a silent no-op when
// `.harness` is unreachable, while still propagating the hook's exit code.
describe('buildHookCommand (#990)', () => {
  const hasGit = spawnSync('git', ['--version']).status === 0;
  // POSIX shell semantics; the command uses `sh`-style `$(...)`, `||`, `[ -f ]`.
  const onPosix = process.platform === 'win32' || !hasGit ? describe.skip : describe;

  it('does not embed the worktree-fragile --show-toplevel form', () => {
    const cmd = buildHookCommand('block-no-verify');
    expect(cmd).not.toContain('--show-toplevel');
    expect(cmd).toContain('--git-common-dir');
    expect(cmd).toContain('.harness/hooks/block-no-verify.js');
    // Guards + exec so it no-ops silently off-repo and still propagates exit 2.
    expect(cmd).toContain('|| exit 0');
    expect(cmd).toContain('exec node');
  });

  onPosix('shell behavior', () => {
    let tmpRoot: string;
    let mainRepo: string;

    function git(cwd: string, ...args: string[]) {
      const r = spawnSync('git', args, { cwd, encoding: 'utf-8' });
      if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
      return r.stdout;
    }

    beforeEach(() => {
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hookcmd-'));
      mainRepo = path.join(tmpRoot, 'main');
      fs.mkdirSync(mainRepo, { recursive: true });
      git(mainRepo, 'init', '-q');
      git(mainRepo, 'config', 'user.email', 'test@example.com');
      git(mainRepo, 'config', 'user.name', 'Test');
      git(mainRepo, 'commit', '-q', '--allow-empty', '-m', 'init');
      // A probe hook that blocks (exit 2), installed only in the MAIN checkout's
      // machine-local .harness/ — exactly the layout that breaks --show-toplevel.
      const hooksDir = path.join(mainRepo, '.harness', 'hooks');
      fs.mkdirSync(hooksDir, { recursive: true });
      fs.writeFileSync(path.join(hooksDir, 'probe.js'), 'process.exit(2);\n');
    });

    afterEach(() => {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    const run = (cwd: string) =>
      spawnSync('sh', ['-c', buildHookCommand('probe')], { cwd, encoding: 'utf-8' });

    it('runs the main-checkout hook and propagates its blocking exit code', () => {
      const r = run(mainRepo);
      expect(r.status).toBe(2);
    });

    it('still resolves the MAIN checkout hook from a linked worktree', () => {
      const wt = path.join(tmpRoot, 'wt');
      git(mainRepo, 'worktree', 'add', '-q', wt, 'HEAD');
      // The worktree has no .harness/ of its own — the old --show-toplevel form
      // would MODULE_NOT_FOUND here and the gate would silently stop running.
      expect(fs.existsSync(path.join(wt, '.harness'))).toBe(false);
      const r = run(wt);
      expect(r.status).toBe(2);
    });

    it('is a silent no-op (exit 0, no stderr spam) outside any repo', () => {
      const nonRepo = path.join(tmpRoot, 'not-a-repo');
      fs.mkdirSync(nonRepo, { recursive: true });
      const r = run(nonRepo);
      expect(r.status).toBe(0);
      expect(r.stderr).not.toMatch(/not a git repository/);
    });

    it('is a silent no-op when the repo has no .harness hook file', () => {
      const bare = path.join(tmpRoot, 'bare-repo');
      fs.mkdirSync(bare, { recursive: true });
      git(bare, 'init', '-q');
      const r = run(bare);
      expect(r.status).toBe(0);
    });
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
    expect(profile.profile).toBe('standard');
    // Install-time content hashes recorded for local-modification detection (#902)
    expect(profile.fileHashes).toBeDefined();
    expect(Object.keys(profile.fileHashes).length).toBeGreaterThan(0);
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
    // minimal ships block-no-verify.js plus its shared support module.
    expect(minimalFiles.sort()).toEqual(['block-no-verify.js', 'read-hook-stdin.js']);
  });
});

describe('initHooks local-modification guard (#902)', () => {
  let tmpDir: string;
  let hooksDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-hooks-guard-'));
    hooksDir = path.join(tmpDir, '.harness', 'hooks');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('preserves a hand-edited hook and reports it in skippedModified', () => {
    initHooks({ profile: 'minimal', projectDir: tmpDir });
    const hookPath = path.join(hooksDir, 'block-no-verify.js');
    const edited = '// hand-edited by adopter\n' + fs.readFileSync(hookPath, 'utf-8');
    fs.writeFileSync(hookPath, edited);

    const result = initHooks({ profile: 'minimal', projectDir: tmpDir });

    expect(result.skippedModified).toEqual(['block-no-verify.js']);
    expect(fs.readFileSync(hookPath, 'utf-8')).toBe(edited);
  });

  it('overwrites a hand-edited hook when force is set', () => {
    initHooks({ profile: 'minimal', projectDir: tmpDir });
    const hookPath = path.join(hooksDir, 'block-no-verify.js');
    const original = fs.readFileSync(hookPath, 'utf-8');
    fs.writeFileSync(hookPath, '// hand-edited\n' + original);

    const result = initHooks({ profile: 'minimal', projectDir: tmpDir, force: true });

    expect(result.skippedModified).toEqual([]);
    expect(fs.readFileSync(hookPath, 'utf-8')).toBe(original);
  });

  it('refreshes unmodified hooks without warnings', () => {
    initHooks({ profile: 'minimal', projectDir: tmpDir });
    const result = initHooks({ profile: 'minimal', projectDir: tmpDir });
    expect(result.skippedModified).toEqual([]);
    expect(result.copiedScripts).toContain('block-no-verify');
  });

  it('keeps flagging a preserved hand-edited hook on subsequent runs', () => {
    initHooks({ profile: 'minimal', projectDir: tmpDir });
    const hookPath = path.join(hooksDir, 'block-no-verify.js');
    const edited = '// hand-edited\n' + fs.readFileSync(hookPath, 'utf-8');
    fs.writeFileSync(hookPath, edited);

    initHooks({ profile: 'minimal', projectDir: tmpDir });
    const again = initHooks({ profile: 'minimal', projectDir: tmpDir });

    expect(again.skippedModified).toEqual(['block-no-verify.js']);
    expect(fs.readFileSync(hookPath, 'utf-8')).toBe(edited);
  });

  it('preserves a hand-edited hook across a profile downgrade', () => {
    initHooks({ profile: 'strict', projectDir: tmpDir });
    const hookPath = path.join(hooksDir, 'strict-quality-gate.js');
    const edited = '// disabled locally\n' + fs.readFileSync(hookPath, 'utf-8');
    fs.writeFileSync(hookPath, edited);

    const result = initHooks({ profile: 'minimal', projectDir: tmpDir });

    // Hand-edited file survives the stale-.js wipe and is reported.
    expect(result.skippedModified).toContain('strict-quality-gate.js');
    expect(fs.readFileSync(hookPath, 'utf-8')).toBe(edited);
  });

  it('keeps legacy refresh behavior for installs without recorded hashes', () => {
    initHooks({ profile: 'minimal', projectDir: tmpDir });
    // Simulate a pre-hash install: strip fileHashes from profile.json.
    const profilePath = path.join(hooksDir, 'profile.json');
    fs.writeFileSync(profilePath, JSON.stringify({ profile: 'minimal' }, null, 2) + '\n');
    const hookPath = path.join(hooksDir, 'block-no-verify.js');
    const original = fs.readFileSync(hookPath, 'utf-8');
    fs.writeFileSync(hookPath, '// hand-edited\n' + original);

    const result = initHooks({ profile: 'minimal', projectDir: tmpDir });

    // Cannot verify without a recorded hash — refreshed as before.
    expect(result.skippedModified).toEqual([]);
    expect(fs.readFileSync(hookPath, 'utf-8')).toBe(original);
  });
});

describe('initHooks support files (format-check.js)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-hooks-support-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const hooksDir = () => path.join(tmpDir, '.harness', 'hooks');

  it('standard copies quality-warner.js + format-check.js (and never quality-gate.js)', () => {
    initHooks({ profile: 'standard', projectDir: tmpDir });
    expect(fs.existsSync(path.join(hooksDir(), 'quality-warner.js'))).toBe(true);
    expect(fs.existsSync(path.join(hooksDir(), 'format-check.js'))).toBe(true);
    expect(fs.existsSync(path.join(hooksDir(), 'quality-gate.js'))).toBe(false);
  });

  it('strict additionally copies strict-quality-gate.js', () => {
    initHooks({ profile: 'strict', projectDir: tmpDir });
    expect(fs.existsSync(path.join(hooksDir(), 'strict-quality-gate.js'))).toBe(true);
    expect(fs.existsSync(path.join(hooksDir(), 'format-check.js'))).toBe(true);
  });

  it('removes a pre-existing quality-gate.js from the dest', () => {
    fs.mkdirSync(hooksDir(), { recursive: true });
    fs.writeFileSync(path.join(hooksDir(), 'quality-gate.js'), '// stale\n');
    initHooks({ profile: 'standard', projectDir: tmpDir });
    expect(fs.existsSync(path.join(hooksDir(), 'quality-gate.js'))).toBe(false);
  });

  it('downgrade to minimal drops the orphaned format-check.js', () => {
    initHooks({ profile: 'standard', projectDir: tmpDir });
    expect(fs.existsSync(path.join(hooksDir(), 'format-check.js'))).toBe(true);
    initHooks({ profile: 'minimal', projectDir: tmpDir });
    const remaining = fs.readdirSync(hooksDir()).filter((f) => f.endsWith('.js'));
    // format-check.js is orphaned by the downgrade and dropped; block-no-verify
    // and its own support module read-hook-stdin.js remain.
    expect(remaining.sort()).toEqual(['block-no-verify.js', 'read-hook-stdin.js']);
    expect(remaining).not.toContain('format-check.js');
  });

  it('the copied strict-quality-gate.js resolves its sibling import and runs (exit 0 on empty stdin)', () => {
    initHooks({ profile: 'strict', projectDir: tmpDir });
    // Simulate an ESM adopter context so the copied .js is treated as a module.
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"type":"module"}\n');
    const result = spawnSync('node', [path.join(hooksDir(), 'strict-quality-gate.js')], {
      input: '',
      encoding: 'utf-8',
      cwd: tmpDir,
      timeout: 30000,
    });
    // A failed `import './format-check.js'` would crash before reading stdin and
    // exit non-zero with ERR_MODULE_NOT_FOUND. Exit 0 proves resolution worked.
    expect(result.signal ? 0 : (result.status ?? 1)).toBe(0);
    expect(result.stderr ?? '').not.toContain('ERR_MODULE_NOT_FOUND');
  });
});

// Regression: installed ESM hooks warned MODULE_TYPELESS_PACKAGE_JSON on every
// fire in adopters whose nearest package.json is CommonJS-default (or absent),
// because the installer shipped bare `.js` ES modules with no `package.json`
// declaring the hooks dir as `"type": "module"`. Claude Code surfaced the
// per-fire stderr warning as a non-blocking "hook error". The installer must
// write the ESM marker beside the copied hooks.
describe('initHooks ESM module marker (MODULE_TYPELESS_PACKAGE_JSON)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-hooks-esm-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const markerPath = () => path.join(tmpDir, '.harness', 'hooks', 'package.json');

  it('writes .harness/hooks/package.json declaring type:module', () => {
    initHooks({ profile: 'standard', projectDir: tmpDir });
    expect(fs.existsSync(markerPath())).toBe(true);
    expect(JSON.parse(fs.readFileSync(markerPath(), 'utf-8'))).toEqual({ type: 'module' });
  });

  it('preserves the marker across the stale-.js wipe on profile downgrade', () => {
    initHooks({ profile: 'strict', projectDir: tmpDir });
    initHooks({ profile: 'minimal', projectDir: tmpDir });
    expect(fs.existsSync(markerPath())).toBe(true);
    expect(JSON.parse(fs.readFileSync(markerPath(), 'utf-8'))).toEqual({ type: 'module' });
  });

  it('loads a copied hook cleanly in a CommonJS-default adopter (no warning, no missing sibling)', () => {
    // Reproduce the adopter condition: a root package.json WITHOUT type:module.
    // Two failure modes are guarded together here:
    //  - Without the .harness/hooks marker, Node reparses the ESM hook and warns
    //    MODULE_TYPELESS_PACKAGE_JSON on every fire.
    //  - Without the hook's shared support module shipped alongside it, the static
    //    `import './read-hook-stdin.js'` fails at load with ERR_MODULE_NOT_FOUND.
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"adopter"}\n');
    initHooks({ profile: 'minimal', projectDir: tmpDir });
    const hookPath = path.join(tmpDir, '.harness', 'hooks', 'block-no-verify.js');
    const result = spawnSync('node', [hookPath], {
      input: '',
      encoding: 'utf-8',
      cwd: tmpDir,
      timeout: 30000,
    });
    const stderr = result.stderr ?? '';
    expect(stderr).not.toContain('MODULE_TYPELESS_PACKAGE_JSON');
    expect(stderr).not.toContain('ERR_MODULE_NOT_FOUND');
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
    expect(result.hooks).toHaveLength(10); // all hooks incl. strict-quality-gate, adoption-tracker, telemetry-reporter, sentinel-pre, and sentinel-post
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

describe('addHooks', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-hooks-add-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('adds sentinel alias (both sentinel-pre and sentinel-post)', () => {
    const result = addHooks('sentinel', tmpDir);
    expect(result.added).toContain('sentinel-pre');
    expect(result.added).toContain('sentinel-post');
    expect(result.notFound).toHaveLength(0);

    // Verify scripts copied
    expect(fs.existsSync(path.join(tmpDir, '.harness', 'hooks', 'sentinel-pre.js'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.harness', 'hooks', 'sentinel-post.js'))).toBe(true);

    // Verify settings.json registration
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf-8')
    );
    expect(settings.hooks.PreToolUse).toBeDefined();
    expect(settings.hooks.PostToolUse).toBeDefined();
    const preCommands = settings.hooks.PreToolUse.flatMap((e: any) =>
      e.hooks.map((h: any) => h.command)
    );
    expect(preCommands).toContain(buildHookCommand('sentinel-pre'));
  });

  it('writes the ESM module marker and ships support modules so copied hooks load cleanly', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"adopter"}\n');
    addHooks('sentinel', tmpDir);
    const markerPath = path.join(tmpDir, '.harness', 'hooks', 'package.json');
    expect(JSON.parse(fs.readFileSync(markerPath, 'utf-8'))).toEqual({ type: 'module' });
    // sentinel-pre imports './read-hook-stdin.js'; addHooks must ship it too.
    expect(fs.existsSync(path.join(tmpDir, '.harness', 'hooks', 'read-hook-stdin.js'))).toBe(true);
    const hookPath = path.join(tmpDir, '.harness', 'hooks', 'sentinel-pre.js');
    const result = spawnSync('node', [hookPath], {
      input: '',
      encoding: 'utf-8',
      cwd: tmpDir,
      timeout: 30000,
    });
    const stderr = result.stderr ?? '';
    expect(stderr).not.toContain('MODULE_TYPELESS_PACKAGE_JSON');
    expect(stderr).not.toContain('ERR_MODULE_NOT_FOUND');
  });

  it('adds a single hook by name', () => {
    const result = addHooks('cost-tracker', tmpDir);
    expect(result.added).toContain('cost-tracker');
    expect(result.notFound).toHaveLength(0);
  });

  it('returns notFound for unknown hook name', () => {
    const result = addHooks('nonexistent-hook', tmpDir);
    expect(result.notFound).toContain('nonexistent-hook');
    expect(result.added).toHaveLength(0);
  });

  it('reports already-installed on second run', () => {
    addHooks('sentinel', tmpDir);
    const result = addHooks('sentinel', tmpDir);
    expect(result.alreadyInstalled).toContain('sentinel-pre');
    expect(result.alreadyInstalled).toContain('sentinel-post');
    expect(result.added).toHaveLength(0);
  });

  it('is idempotent in settings.json — no duplicate entries', () => {
    addHooks('sentinel', tmpDir);
    addHooks('sentinel', tmpDir);
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf-8')
    );
    const preEntries = settings.hooks.PreToolUse.filter((e: any) =>
      e.hooks.some((h: any) => h.command.includes('sentinel-pre'))
    );
    expect(preEntries).toHaveLength(1);
  });

  it('preserves existing settings.json content', () => {
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, 'settings.json'),
      JSON.stringify({ permissions: { allow: ['Read'] } })
    );
    addHooks('sentinel', tmpDir);
    const settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf-8'));
    expect(settings.permissions).toEqual({ allow: ['Read'] });
    expect(settings.hooks).toBeDefined();
  });
});
