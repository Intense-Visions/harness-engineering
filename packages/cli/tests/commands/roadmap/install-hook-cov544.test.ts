import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  buildRegenBlock,
  mergeHookContent,
  runRoadmapInstallHook,
  runInstallHookAction,
  HOOK_BLOCK_BEGIN,
  HOOK_BLOCK_END,
  DEFAULT_REGEN_COMMAND,
} from '../../../src/commands/roadmap/install-hook';

let cwd: string;

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'install-hook-cov-'));
});

afterEach(() => {
  fs.rmSync(cwd, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function mkGit(): void {
  // isGitRepo only checks for a `.git` entry. A bare dir is enough (git
  // rev-parse falls back to <cwd>/.git/hooks when not a real repo).
  fs.mkdirSync(path.join(cwd, '.git'), { recursive: true });
}

function mkSharded(): void {
  fs.mkdirSync(path.join(cwd, 'docs', 'roadmap.d'), { recursive: true });
}

describe('buildRegenBlock', () => {
  it('wraps the command in the managed markers', () => {
    const block = buildRegenBlock('npx harness roadmap regen');
    expect(block.startsWith(HOOK_BLOCK_BEGIN)).toBe(true);
    expect(block.endsWith(HOOK_BLOCK_END)).toBe(true);
    expect(block).toContain('npx harness roadmap regen');
    expect(block).toContain('git add docs/roadmap.md');
  });
});

describe('mergeHookContent', () => {
  it('creates a fresh POSIX hook when existing is null', () => {
    const block = buildRegenBlock(DEFAULT_REGEN_COMMAND);
    const { content, action } = mergeHookContent(null, block);
    expect(action).toBe('created');
    expect(content.startsWith('#!/bin/sh\n')).toBe(true);
  });

  it('creates a fresh hook when existing is whitespace only', () => {
    const block = buildRegenBlock(DEFAULT_REGEN_COMMAND);
    const { action } = mergeHookContent('   \n  ', block);
    expect(action).toBe('created');
  });

  it('replaces a previously-managed block in place and reports updated', () => {
    const block = buildRegenBlock('cmd-a');
    const first = mergeHookContent('#!/bin/sh\necho hi\n', block).content;
    const block2 = buildRegenBlock('cmd-b');
    const { content, action } = mergeHookContent(first, block2);
    expect(action).toBe('updated');
    expect(content).toContain('cmd-b');
    expect(content).not.toContain('cmd-a');
    expect(content).toContain('echo hi');
  });

  it('reports unchanged when the managed block is byte-identical', () => {
    const block = buildRegenBlock('cmd-a');
    const first = mergeHookContent('#!/bin/sh\n', block).content;
    const { action } = mergeHookContent(first, block);
    expect(action).toBe('unchanged');
  });

  it('appends the block to an adopter hook that has no managed block', () => {
    const block = buildRegenBlock('cmd-a');
    const existing = '#!/bin/sh\nnpm test\n';
    const { content, action } = mergeHookContent(existing, block);
    expect(action).toBe('updated');
    expect(content).toContain('npm test');
    expect(content).toContain(HOOK_BLOCK_BEGIN);
  });

  it('appends (not mangles) when the BEGIN marker is present but END is missing', () => {
    const block = buildRegenBlock('cmd-a');
    const truncated = `#!/bin/sh\n${HOOK_BLOCK_BEGIN}\n# truncated, no end marker\n`;
    const { content, action } = mergeHookContent(truncated, block);
    expect(action).toBe('updated');
    // The original (truncated) content is preserved and a fresh block appended.
    expect(content).toContain('# truncated, no end marker');
    expect(content).toContain(HOOK_BLOCK_END);
  });

  it('adds a separator when the existing content does not end in a newline', () => {
    const block = buildRegenBlock('cmd-a');
    const existing = '#!/bin/sh\nnpm test';
    const { content } = mergeHookContent(existing, block);
    expect(content).toContain('npm test\n');
  });
});

describe('runRoadmapInstallHook', () => {
  it('errors when the directory is not a git repository', async () => {
    const r = await runRoadmapInstallHook({ cwd });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/git repository/i);
  });

  it('skips install when not sharded and --force is absent', async () => {
    mkGit();
    const r = await runRoadmapInstallHook({ cwd });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.action).toBe('skipped');
      expect(r.value.sharded).toBe(false);
    }
  });

  it('installs into raw .git/hooks (git mechanism) when sharded', async () => {
    mkGit();
    mkSharded();
    const r = await runRoadmapInstallHook({ cwd, mechanism: 'git' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.mechanism).toBe('git');
      expect(r.value.action).toBe('created');
      expect(r.value.sharded).toBe(true);
      expect(fs.existsSync(r.value.hookPath)).toBe(true);
    }
  });

  it('force-installs even when not sharded', async () => {
    mkGit();
    const r = await runRoadmapInstallHook({ cwd, mechanism: 'git', force: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.action).toBe('created');
      expect(r.value.sharded).toBe(false);
    }
  });

  it('auto-picks husky when a .husky directory exists', async () => {
    mkGit();
    mkSharded();
    fs.mkdirSync(path.join(cwd, '.husky'), { recursive: true });
    const r = await runRoadmapInstallHook({ cwd, mechanism: 'auto' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.mechanism).toBe('husky');
      expect(r.value.hookPath).toContain(path.join('.husky', 'pre-commit'));
    }
  });

  it('auto-picks git when no .husky directory exists', async () => {
    mkGit();
    mkSharded();
    const r = await runRoadmapInstallHook({ cwd });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.mechanism).toBe('git');
  });

  it('is idempotent: a second run reports unchanged', async () => {
    mkGit();
    mkSharded();
    const first = await runRoadmapInstallHook({ cwd, mechanism: 'git' });
    expect(first.ok).toBe(true);
    const second = await runRoadmapInstallHook({ cwd, mechanism: 'git' });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.value.action).toBe('unchanged');
  });

  it('updates an existing adopter hook rather than clobbering it', async () => {
    mkGit();
    mkSharded();
    const hooksDir = path.join(cwd, '.git', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(hooksDir, 'pre-commit'), '#!/bin/sh\nnpm test\n');
    const r = await runRoadmapInstallHook({ cwd, mechanism: 'git' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.action).toBe('updated');
      const written = fs.readFileSync(r.value.hookPath, 'utf-8');
      expect(written).toContain('npm test');
    }
  });

  it('honors a custom regen command', async () => {
    mkGit();
    mkSharded();
    const r = await runRoadmapInstallHook({ cwd, mechanism: 'git', command: 'pnpm regen' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.command).toBe('pnpm regen');
      expect(fs.readFileSync(r.value.hookPath, 'utf-8')).toContain('pnpm regen');
    }
  });

  it('falls back to DEFAULT_REGEN_COMMAND when command is blank', async () => {
    mkGit();
    mkSharded();
    const r = await runRoadmapInstallHook({ cwd, mechanism: 'git', command: '   ' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.command).toBe(DEFAULT_REGEN_COMMAND);
  });
});

describe('runInstallHookAction (CLI wrapper)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((): never => {
      throw new Error('process.exit called');
    }) as never);
  });

  it('rejects an invalid --mechanism (human format) and exits', async () => {
    await expect(
      runInstallHookAction({ cwd, mechanism: 'bogus', format: 'human' })
    ).rejects.toThrow('process.exit called');
    expect(errSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalled();
  });

  it('rejects an invalid --mechanism (json format) and prints an error object', async () => {
    await expect(runInstallHookAction({ cwd, mechanism: 'bogus', format: 'json' })).rejects.toThrow(
      'process.exit called'
    );
    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('"ok":false');
  });

  it('exits when the install fails (not a git repo)', async () => {
    await expect(runInstallHookAction({ cwd, mechanism: 'git', format: 'human' })).rejects.toThrow(
      'process.exit called'
    );
    expect(exitSpy).toHaveBeenCalled();
  });

  it('prints a JSON success object on a successful install', async () => {
    mkGit();
    mkSharded();
    await runInstallHookAction({ cwd, mechanism: 'git', format: 'json' });
    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('"ok":true');
    expect(printed).toContain('"action":"created"');
  });

  it('prints a human report (created) on a successful install', async () => {
    mkGit();
    mkSharded();
    await runInstallHookAction({ cwd, mechanism: 'git', format: 'human' });
    const printed = logSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(printed).toMatch(/Created|pre-commit/);
  });

  it('prints a human skipped warning when not sharded (no force)', async () => {
    mkGit();
    await runInstallHookAction({ cwd, mechanism: 'git', format: 'human' });
    const printed = logSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(printed).toMatch(/not sharded/i);
  });

  it('warns that the hook is a no-op when force-installed without sharding (human)', async () => {
    mkGit();
    await runInstallHookAction({ cwd, mechanism: 'git', force: true, format: 'human' });
    const printed = logSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(printed).toMatch(/no-op until/i);
  });
});
