import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { resolveMode, buildProjectContext } from './context';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'hstrength-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('resolveMode', () => {
  it('honors explicit toolkit override regardless of layout', () => {
    expect(resolveMode({ mode: 'toolkit' }, root)).toBe('toolkit');
  });

  it('honors explicit adopter override even when toolkit layout exists', () => {
    mkdirSync(join(root, 'templates'));
    mkdirSync(join(root, 'agents', 'skills'), { recursive: true });
    expect(resolveMode({ mode: 'adopter' }, root)).toBe('adopter');
  });

  it('auto-detects toolkit when both templates/ and agents/skills/ exist', () => {
    mkdirSync(join(root, 'templates'));
    mkdirSync(join(root, 'agents', 'skills'), { recursive: true });
    expect(resolveMode({}, root)).toBe('toolkit');
  });

  it('auto-detects adopter when only one of the two dirs exists', () => {
    mkdirSync(join(root, 'templates'));
    expect(resolveMode({}, root)).toBe('adopter');
  });

  it('auto-detects adopter on a bare repo', () => {
    expect(resolveMode({}, root)).toBe('adopter');
  });
});

describe('buildProjectContext (absent inputs)', () => {
  it('never throws and returns null/[] for a bare repo', () => {
    const ctx = buildProjectContext(root, 'adopter');
    expect(ctx.config).toBeNull();
    expect(ctx.preCommit).toBeNull();
    expect(ctx.hookFiles).toEqual([]);
    expect(ctx.workflows).toEqual([]);
    expect(ctx.healthSnapshot).toBeNull();
    expect(ctx.mode).toBe('adopter');
    expect(ctx.root).toBe(root);
  });
});

describe('buildProjectContext (present inputs)', () => {
  it('parses harness.config.json subset and reads pre-commit + hooks', () => {
    writeFileSync(
      join(root, 'harness.config.json'),
      JSON.stringify({ template: { level: 'basic' }, extra: 1 })
    );
    mkdirSync(join(root, '.husky'));
    writeFileSync(join(root, '.husky', 'pre-commit'), '#!/bin/sh\nexit 0\n');
    const ctx = buildProjectContext(root, 'adopter');
    expect(ctx.config?.template?.level).toBe('basic');
    expect(ctx.preCommit).toContain('exit 0');
    expect(ctx.hookFiles.some((h) => h.name === 'pre-commit')).toBe(true);
    // Invariant: hook paths are stored ROOT-RELATIVE (no absolute/home-dir leak).
    const preCommit = ctx.hookFiles.find((h) => h.name === 'pre-commit');
    expect(preCommit?.path).toBe('.husky/pre-commit');
    expect(ctx.hookFiles.every((h) => !isAbsolute(h.path))).toBe(true);
  });

  it('returns null config when harness.config.json is malformed JSON', () => {
    writeFileSync(join(root, 'harness.config.json'), '{ not json');
    expect(buildProjectContext(root, 'adopter').config).toBeNull();
  });

  it('reads .github/workflows yml files as raw text', () => {
    mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'name: ci\n');
    const ctx = buildProjectContext(root, 'adopter');
    expect(ctx.workflows).toHaveLength(1);
    expect(ctx.workflows[0]?.text).toContain('name: ci');
    // Invariant: workflow paths are stored ROOT-RELATIVE.
    expect(ctx.workflows[0]?.path).toBe('.github/workflows/ci.yml');
    expect(ctx.workflows.every((w) => !isAbsolute(w.path))).toBe(true);
  });

  it('parses health-snapshot.json into healthSnapshot', () => {
    mkdirSync(join(root, '.harness'));
    writeFileSync(
      join(root, '.harness', 'health-snapshot.json'),
      JSON.stringify({ passed: true, signals: ['arch'] })
    );
    const ctx = buildProjectContext(root, 'adopter');
    expect((ctx.healthSnapshot as { passed: boolean }).passed).toBe(true);
  });

  it('leaves templates/initSkill undefined in adopter mode', () => {
    const ctx = buildProjectContext(root, 'adopter');
    expect(ctx.templates).toBeUndefined();
    expect(ctx.initSkill).toBeUndefined();
  });

  it('resolves a settings.json hook command to its real script path/contents', () => {
    mkdirSync(join(root, '.harness', 'hooks'), { recursive: true });
    writeFileSync(join(root, '.harness', 'hooks', 'foo.js'), '// foo hook\nprocess.exit(0)\n');
    mkdirSync(join(root, '.claude'), { recursive: true });
    writeFileSync(
      join(root, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'node "$(git rev-parse --show-toplevel)/.harness/hooks/foo.js"',
                },
              ],
            },
          ],
        },
      })
    );
    const ctx = buildProjectContext(root, 'adopter');
    const foo = ctx.hookFiles.find((h) => h.name === 'foo.js');
    expect(foo).toBeDefined();
    expect(foo?.text).toContain('foo hook');
  });

  it('discovers scripts under .harness/hooks/ by directory scan', () => {
    mkdirSync(join(root, '.harness', 'hooks'), { recursive: true });
    writeFileSync(join(root, '.harness', 'hooks', 'block-no-verify.js'), '// blocks --no-verify\n');
    const ctx = buildProjectContext(root, 'adopter');
    expect(ctx.hookFiles.some((h) => h.name === 'block-no-verify.js')).toBe(true);
  });

  it('populates templates (.hbs) and initSkill in toolkit mode', () => {
    mkdirSync(join(root, 'templates', 'basic'), { recursive: true });
    writeFileSync(join(root, 'templates', 'basic', 'harness.config.json.hbs'), '{}');
    mkdirSync(join(root, 'agents', 'skills', 'claude-code', 'harness-initialize-project'), {
      recursive: true,
    });
    writeFileSync(
      join(root, 'agents', 'skills', 'claude-code', 'harness-initialize-project', 'SKILL.md'),
      '# init\nrecommends basic\n'
    );
    const ctx = buildProjectContext(root, 'toolkit');
    expect(ctx.templates?.some((t) => t.path.endsWith('.hbs'))).toBe(true);
    expect(ctx.initSkill).toContain('init');
    // Invariant: template paths are stored ROOT-RELATIVE.
    expect(ctx.templates?.some((t) => t.path === 'templates/basic/harness.config.json.hbs')).toBe(
      true
    );
    expect(ctx.templates?.every((t) => !isAbsolute(t.path))).toBe(true);
  });
});

// Regression for #1012: hook discovery read only `.husky/pre-commit`, ignoring
// git's core.hooksPath. A repo wiring hooks via `.githooks/` +
// `git config core.hooksPath .githooks` had STRENGTH-002/003 silently disabled
// (ctx.preCommit === null) while still scoring solid.
describe('buildProjectContext (core.hooksPath / .githooks)', () => {
  function writeGitHooksRepo(hooksDirName: string): void {
    // Minimal `.git/config` that sets core.hooksPath, as `git config` would.
    mkdirSync(join(root, '.git'), { recursive: true });
    writeFileSync(
      join(root, '.git', 'config'),
      `[core]\n\trepositoryformatversion = 0\n\thooksPath = ${hooksDirName}\n`
    );
    mkdirSync(join(root, hooksDirName), { recursive: true });
    writeFileSync(
      join(root, hooksDirName, 'pre-commit'),
      '#!/bin/sh\nif ! npx harness ci check; then\n  exit 1\nfi\n'
    );
  }

  it('reads pre-commit from the core.hooksPath directory (not .husky)', () => {
    writeGitHooksRepo('.githooks');
    const ctx = buildProjectContext(root, 'adopter');

    // .husky/ does not exist here — the old code returned null and disabled the
    // pre-commit-behavior rules.
    expect(ctx.preCommit).not.toBeNull();
    expect(ctx.preCommit).toContain('harness ci check');
  });

  it('includes the core.hooksPath scripts in hookFiles', () => {
    writeGitHooksRepo('.githooks');
    const ctx = buildProjectContext(root, 'adopter');

    const preCommit = ctx.hookFiles.find((h) => h.name === 'pre-commit');
    expect(preCommit).toBeDefined();
    expect(preCommit?.path).toBe('.githooks/pre-commit');
    expect(ctx.hookFiles.every((h) => !isAbsolute(h.path))).toBe(true);
  });

  it('honors a quoted core.hooksPath value', () => {
    writeGitHooksRepo('.githooks');
    // Rewrite the config with a quoted value (git accepts either form).
    writeFileSync(join(root, '.git', 'config'), '[core]\n\thooksPath = ".githooks"\n');
    const ctx = buildProjectContext(root, 'adopter');
    expect(ctx.preCommit).toContain('harness ci check');
  });

  it('does NOT let the .husky/_ wrapper shadow the real .husky/pre-commit', () => {
    // Husky v9 sets core.hooksPath=.husky/_ and generates wrappers there that
    // exec the real hooks in .husky/. Reading the wrapper instead of the real
    // hook made STRENGTH-002/003 stop firing on every husky repo (regression
    // caught by the live-repo dogfood). The real .husky/pre-commit must win.
    mkdirSync(join(root, '.git'), { recursive: true });
    writeFileSync(join(root, '.git', 'config'), '[core]\n\thooksPath = .husky/_\n');
    mkdirSync(join(root, '.husky', '_'), { recursive: true });
    // The husky-generated wrapper — NOT the gate we want to analyze.
    writeFileSync(join(root, '.husky', '_', 'pre-commit'), '#!/bin/sh\n. "$(dirname "$0")/h"\n');
    // The real user gate.
    writeFileSync(
      join(root, '.husky', 'pre-commit'),
      '#!/bin/sh\nif ! npx harness ci check --skip docs; then\n  exit 1\nfi\n'
    );

    const ctx = buildProjectContext(root, 'adopter');
    expect(ctx.preCommit).toContain('harness ci check');
    expect(ctx.preCommit).not.toContain('dirname');
    // The internal wrapper dir must not be surfaced as a hook file.
    expect(ctx.hookFiles.every((h) => !h.path.includes('.husky/_'))).toBe(true);
  });
});
