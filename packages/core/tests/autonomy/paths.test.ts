import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  harnessHomeDir,
  sessionDirPath,
  userConfigPath,
  computeRepoKey,
  sessionOverridePath,
  validateOverrideSlug,
} from '../../src/autonomy/paths';

const norm = (p: string) => p.replaceAll('\\', '/');
const identity = (p: string) => p;

describe('autonomy paths', () => {
  it('derives ~/.harness and config.json from an injected home', () => {
    expect(norm(harnessHomeDir({ homeDir: '/h' }))).toBe('/h/.harness');
    expect(norm(userConfigPath({ homeDir: '/h' }))).toBe('/h/.harness/config.json');
  });
  it('defaults to os.homedir() when no home is injected', () => {
    expect(norm(harnessHomeDir())).toBe(norm(path.join(os.homedir(), '.harness')));
  });
  it('repoKey is 16 hex chars, deterministic, path-sensitive, separator-insensitive', () => {
    const a = computeRepoKey('/repo/a', { realpath: identity });
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(computeRepoKey('/repo/a', { realpath: identity })).toBe(a);
    expect(computeRepoKey('/repo/b', { realpath: identity })).not.toBe(a);
    expect(computeRepoKey('C:\\r\\a', { realpath: identity })).toBe(
      computeRepoKey('C:/r/a', { realpath: identity })
    );
  });
  it.skipIf(process.platform === 'win32')('repoKey follows symlinks to the real root', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autonomy-key-'));
    const real = path.join(tmp, 'real');
    fs.mkdirSync(real);
    fs.symlinkSync(real, path.join(tmp, 'link'));
    expect(computeRepoKey(path.join(tmp, 'link'))).toBe(computeRepoKey(real));
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  it('places overrides under <home>/.harness/session-overrides/<repoKey>/<slug>.json', () => {
    const r = sessionOverridePath('/repo/a', 's1', { homeDir: '/h', realpath: identity });
    const key = computeRepoKey('/repo/a', { realpath: identity });
    expect(r.ok && norm(r.value)).toBe(`/h/.harness/session-overrides/${key}/s1.json`);
  });
  it.each(['', '   ', '../x', 'a/b', 'a\\b', 'C:x', '..'])('rejects slug %j', (slug) => {
    expect(validateOverrideSlug(slug).ok).toBe(false);
    expect(sessionOverridePath('/repo', slug, { homeDir: '/h', realpath: identity }).ok).toBe(
      false
    );
  });
});

/**
 * FIX 2: repoKey = sha256 of the REPO ROOT realpath (spec D12), not of the caller's cwd, so
 * `harness autonomy set` from a subdirectory and `show` from the root share one override.
 */
describe('repoKey keys on the project root', () => {
  const toplevelOf = (map: Record<string, string>) => (p: string) => map[p];

  it('a subdirectory hashes to the same key as its repo (injected git)', () => {
    const opts = {
      realpath: identity,
      gitCommonDir: toplevelOf({ '/proj/sub': '/proj/.git', '/proj': '/proj/.git' }),
    };
    expect(computeRepoKey('/proj/sub', opts)).toBe(computeRepoKey('/proj', opts));
  });

  it('D15: the key hashes the git common dir, so worktrees with distinct toplevels share it', () => {
    const opts = {
      realpath: identity,
      gitCommonDir: toplevelOf({ '/main': '/main/.git', '/wt': '/main/.git' }),
    };
    expect(computeRepoKey('/wt', opts)).toBe(computeRepoKey('/main', opts));
    expect(computeRepoKey('/wt', opts)).toBe(
      computeRepoKey('/main/.git', { realpath: identity, gitCommonDir: () => undefined })
    );
  });

  it('falls back to the given path when it is not in a git repo', () => {
    const opts = {
      realpath: identity,
      gitCommonDir: () => undefined,
    };
    expect(computeRepoKey('/x/sub', opts)).not.toBe(computeRepoKey('/x', opts));
    // Same key as the pre-existing path-only behaviour for non-repos.
    expect(computeRepoKey('/x/sub', opts)).toBe(
      computeRepoKey('/x/sub', { realpath: identity, gitCommonDir: () => undefined })
    );
  });

  it('sessionOverridePath uses the root key', () => {
    const opts = { homeDir: '/h', realpath: identity, gitCommonDir: () => '/proj/.git' };
    const a = sessionOverridePath('/proj/a/b', 's1', opts);
    const b = sessionOverridePath('/proj', 's1', opts);
    expect(a.ok && b.ok && a.value === b.value).toBe(true);
  });

  describe('against real git', () => {
    let tmp: string;
    const git = (cwd: string, ...args: string[]) =>
      execFileSync(
        'git',
        [
          '-c',
          'user.name=t',
          '-c',
          'user.email=t@example.com',
          '-c',
          'commit.gpgsign=false',
          '-c',
          'init.defaultBranch=main',
          '-c',
          'core.hooksPath=/dev/null',
          ...args,
        ],
        { cwd, stdio: ['ignore', 'pipe', 'pipe'] }
      );
    const setup = () => {
      tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'autonomy-root-')));
      const repo = path.join(tmp, 'repo');
      fs.mkdirSync(path.join(repo, 'sub', 'deeper'), { recursive: true });
      git(repo, 'init', '-q');
      git(repo, 'commit', '-q', '--allow-empty', '-m', 'init');
      return repo;
    };

    it('a nested subdirectory resolves to the repo root key', () => {
      const repo = setup();
      try {
        expect(computeRepoKey(path.join(repo, 'sub', 'deeper'))).toBe(computeRepoKey(repo));
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('all worktrees of a repo SHARE one key (D15: git-common-dir), session dirs stay as given', () => {
      const repo = setup();
      try {
        const wt = path.join(tmp, 'wt');
        git(repo, 'worktree', 'add', '-q', wt);
        fs.mkdirSync(path.join(wt, 'sub'), { recursive: true });
        // The session dir is the path as given (resolveSessionDir), never re-rooted by git...
        const dir = sessionDirPath(path.join(wt, 'sub'), 's1');
        expect(dir.ok && norm(dir.value)).toBe(
          norm(path.join(wt, 'sub', '.harness', 'sessions', 's1'))
        );
        // ...but the override key is shared, so a lowering in main reaches the worktree.
        expect(computeRepoKey(path.join(wt, 'sub'))).toBe(computeRepoKey(wt));
        expect(computeRepoKey(wt)).toBe(computeRepoKey(repo));
        // Positive control: a different repo still gets a different key.
        const other = path.join(tmp, 'other');
        fs.mkdirSync(other);
        git(other, 'init', '-q');
        expect(computeRepoKey(other)).not.toBe(computeRepoKey(repo));
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('ignores an inherited GIT_DIR (set inside git hooks) and resolves from the path', () => {
      const repo = setup();
      const other = path.join(tmp, 'other');
      fs.mkdirSync(other);
      git(other, 'init', '-q');
      const saved = process.env.GIT_DIR;
      process.env.GIT_DIR = path.join(other, '.git');
      try {
        expect(computeRepoKey(path.join(repo, 'sub'))).not.toBe(computeRepoKey(other));
        expect(computeRepoKey(path.join(repo, 'sub'))).toBe(
          computeRepoKey(path.join(repo, 'sub'), { gitCommonDir: () => path.join(repo, '.git') })
        );
      } finally {
        if (saved === undefined) delete process.env.GIT_DIR;
        else process.env.GIT_DIR = saved;
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('a directory outside any repo keys on itself', () => {
      tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'autonomy-norepo-')));
      try {
        const sub = path.join(tmp, 'sub');
        fs.mkdirSync(sub);
        expect(computeRepoKey(sub)).not.toBe(computeRepoKey(tmp));
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  });
});
