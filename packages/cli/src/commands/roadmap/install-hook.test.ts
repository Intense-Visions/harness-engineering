// packages/cli/src/commands/roadmap/install-hook.test.ts
//
// Adopter-facing git-hook installer for roadmap aggregate regeneration (#688).
//
// Covers the pure merge core (idempotent, non-clobbering), the end-to-end
// installer against a real temp git repo (husky + raw .git/hooks, graceful
// no-op when unsharded), and a real `git commit` proving the installed hook
// fires the regen step only when a shard is staged.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  HOOK_BLOCK_BEGIN,
  HOOK_BLOCK_END,
  DEFAULT_REGEN_COMMAND,
  buildRegenBlock,
  mergeHookContent,
  runRoadmapInstallHook,
} from './install-hook';

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-install-hook-'));
}

/** Minimal sharded roadmap so the installer treats the repo as sharded. */
function seedShards(cwd: string): void {
  const shardDir = path.join(cwd, 'docs', 'roadmap.d');
  fs.mkdirSync(shardDir, { recursive: true });
  fs.writeFileSync(path.join(shardDir, '_meta.md'), '---\nproject: demo\nmilestones: []\n---\n');
  fs.writeFileSync(
    path.join(shardDir, 'sample.md'),
    '---\nslug: "sample"\n---\n\n### Sample\n\n- **Status:** planned\n'
  );
}

function initGitRepo(cwd: string): void {
  execFileSync('git', ['init', '-q'], { cwd });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd });
}

describe('mergeHookContent', () => {
  const block = buildRegenBlock(DEFAULT_REGEN_COMMAND);

  it('creates a fresh POSIX hook (shebang + block) when no file exists', () => {
    const { content, action } = mergeHookContent(null, block);
    expect(action).toBe('created');
    expect(content.startsWith(`#!/bin/sh\n`)).toBe(true);
    expect(content).toContain(HOOK_BLOCK_BEGIN);
    expect(content).toContain(HOOK_BLOCK_END);
  });

  it('treats an effectively-empty file as a fresh hook', () => {
    const { content, action } = mergeHookContent('   \n  ', block);
    expect(action).toBe('created');
    expect(content.startsWith(`#!/bin/sh\n`)).toBe(true);
  });

  it('appends to an existing adopter hook without clobbering its steps', () => {
    const existing = '#!/bin/sh\nnpm run lint-staged\n';
    const { content, action } = mergeHookContent(existing, block);
    expect(action).toBe('updated');
    expect(content).toContain('npm run lint-staged');
    expect(content).toContain(HOOK_BLOCK_BEGIN);
    // Adopter content must precede the managed block.
    expect(content.indexOf('npm run lint-staged')).toBeLessThan(content.indexOf(HOOK_BLOCK_BEGIN));
  });

  it('replaces a previously-managed block in place, preserving surrounding steps', () => {
    const first = mergeHookContent('#!/bin/sh\necho before\n', block).content;
    // Add an adopter step AFTER the managed block, then re-merge with a new command.
    const withTrailer = `${first}echo after\n`;
    const newBlock = buildRegenBlock('pnpm harness roadmap regen');
    const { content, action } = mergeHookContent(withTrailer, newBlock);
    expect(action).toBe('updated');
    expect(content).toContain('echo before');
    expect(content).toContain('echo after');
    expect(content).toContain('pnpm harness roadmap regen');
    expect(content).not.toContain(DEFAULT_REGEN_COMMAND);
    // Still exactly one managed block.
    expect(content.split(HOOK_BLOCK_BEGIN).length - 1).toBe(1);
  });

  it('is idempotent — re-merging identical content reports unchanged', () => {
    const once = mergeHookContent('#!/bin/sh\n', block).content;
    const { content, action } = mergeHookContent(once, block);
    expect(action).toBe('unchanged');
    expect(content).toBe(once);
  });
});

describe('buildRegenBlock', () => {
  it('embeds the guard, the regen command, and a fail-closed exit', () => {
    const block = buildRegenBlock('npx harness roadmap regen');
    expect(block).toContain("grep -qE '^docs/roadmap\\.d/'");
    expect(block).toContain('npx harness roadmap regen');
    expect(block).toContain('git add docs/roadmap.md');
    expect(block).toContain('exit 1');
  });
});

describe('runRoadmapInstallHook', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkTmp();
  });

  afterEach(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('errors when the directory is not a git repository', async () => {
    seedShards(cwd);
    const result = await runRoadmapInstallHook({ cwd });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/not a git repository/i);
  });

  it('installs an executable raw .git/hooks/pre-commit and is idempotent', async () => {
    initGitRepo(cwd);
    seedShards(cwd);

    const first = await runRoadmapInstallHook({ cwd });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.mechanism).toBe('git');
    expect(first.value.action).toBe('created');
    expect(first.value.sharded).toBe(true);

    const hookContent = fs.readFileSync(first.value.hookPath, 'utf-8');
    expect(hookContent).toContain(HOOK_BLOCK_BEGIN);
    expect(hookContent).toContain(DEFAULT_REGEN_COMMAND);
    // Executable bit set (POSIX).
    expect(fs.statSync(first.value.hookPath).mode & 0o111).not.toBe(0);

    const second = await runRoadmapInstallHook({ cwd });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.action).toBe('unchanged');
    expect(second.value.hookPath).toBe(first.value.hookPath);
  });

  it('auto-detects husky and writes .husky/pre-commit when .husky exists', async () => {
    initGitRepo(cwd);
    seedShards(cwd);
    fs.mkdirSync(path.join(cwd, '.husky'), { recursive: true });

    const result = await runRoadmapInstallHook({ cwd });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mechanism).toBe('husky');
    expect(result.value.hookPath).toBe(path.join(cwd, '.husky', 'pre-commit'));
    expect(fs.existsSync(result.value.hookPath)).toBe(true);
  });

  it('preserves an adopter husky hook when appending the block', async () => {
    initGitRepo(cwd);
    seedShards(cwd);
    const huskyHook = path.join(cwd, '.husky', 'pre-commit');
    fs.mkdirSync(path.dirname(huskyHook), { recursive: true });
    fs.writeFileSync(huskyHook, `#!/bin/sh\nnpx lint-staged\n`);

    const result = await runRoadmapInstallHook({ cwd, mechanism: 'husky' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.action).toBe('updated');
    const content = fs.readFileSync(huskyHook, 'utf-8');
    expect(content).toContain('npx lint-staged');
    expect(content).toContain(HOOK_BLOCK_BEGIN);
  });

  it('respects an explicit --command override', async () => {
    initGitRepo(cwd);
    seedShards(cwd);
    const result = await runRoadmapInstallHook({ cwd, command: 'pnpm exec harness roadmap regen' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const content = fs.readFileSync(result.value.hookPath, 'utf-8');
    expect(content).toContain('pnpm exec harness roadmap regen');
    expect(content).not.toContain(DEFAULT_REGEN_COMMAND);
  });

  it('degrades gracefully when the project is not sharded (skips, writes nothing)', async () => {
    initGitRepo(cwd);
    const result = await runRoadmapInstallHook({ cwd });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.action).toBe('skipped');
    expect(result.value.sharded).toBe(false);
    expect(fs.existsSync(result.value.hookPath)).toBe(false);
  });

  it('installs anyway with --force when not sharded (pre-provision)', async () => {
    initGitRepo(cwd);
    const result = await runRoadmapInstallHook({ cwd, force: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.action).toBe('created');
    expect(result.value.sharded).toBe(false);
    expect(fs.existsSync(result.value.hookPath)).toBe(true);
  });
});

describe('installed hook fires on commit', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkTmp();
    initGitRepo(cwd);
    seedShards(cwd);
  });

  afterEach(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('regenerates + re-stages the aggregate only when a shard is staged', async () => {
    // Use a deterministic, quote-free sentinel regen script (no external CLI
    // needed) that stands in for `harness roadmap regen`: it writes the
    // aggregate, then the block `git add`s it. Proves the hook is installed,
    // executable, guarded, and re-stages the aggregate through a real commit.
    fs.writeFileSync(
      path.join(cwd, 'regen.sh'),
      `#!/bin/sh\nprintf REGENERATED > docs/roadmap.md\n`
    );
    const install = await runRoadmapInstallHook({
      cwd,
      mechanism: 'git',
      command: 'sh ./regen.sh',
    });
    expect(install.ok).toBe(true);

    // Commit that DOES stage a shard → hook fires, aggregate committed.
    execFileSync('git', ['add', 'docs/roadmap.d/sample.md'], { cwd });
    execFileSync('git', ['commit', '-q', '-m', 'add shard'], { cwd });
    const committed = execFileSync('git', ['show', 'HEAD:docs/roadmap.md'], {
      cwd,
      encoding: 'utf-8',
    });
    expect(committed).toContain('REGENERATED');

    // Commit that does NOT touch a shard → guard is a no-op, no regen.
    fs.rmSync(path.join(cwd, 'docs', 'roadmap.md'));
    fs.writeFileSync(path.join(cwd, 'other.txt'), 'hi\n');
    execFileSync('git', ['add', 'other.txt'], { cwd });
    execFileSync('git', ['commit', '-q', '-m', 'unrelated'], { cwd });
    expect(fs.existsSync(path.join(cwd, 'docs', 'roadmap.md'))).toBe(false);
  });
});
