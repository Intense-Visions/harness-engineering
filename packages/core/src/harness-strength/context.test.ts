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
    mkdirSync(join(root, 'agents', 'skills', 'claude-code', 'initialize-harness-project'), {
      recursive: true,
    });
    writeFileSync(
      join(root, 'agents', 'skills', 'claude-code', 'initialize-harness-project', 'SKILL.md'),
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
