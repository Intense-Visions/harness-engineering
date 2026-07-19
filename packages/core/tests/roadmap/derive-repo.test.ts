import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  parseOwnerRepoFromRemoteUrl,
  deriveRepoFromGitRemote,
} from '../../src/roadmap/derive-repo';
import { loadTrackerClientConfigFromProject } from '../../src/roadmap/load-tracker-client-config';
import { loadTrackerSyncConfig } from '../../src/roadmap/tracker-config';

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'derive-repo-'));
}

/** Init a git repo at dir with the given origin URL (no network access). */
function gitInitWithOrigin(dir: string, originUrl: string): void {
  execFileSync('git', ['init', '--quiet'], { cwd: dir });
  execFileSync('git', ['remote', 'add', 'origin', originUrl], { cwd: dir });
}

describe('parseOwnerRepoFromRemoteUrl', () => {
  it('parses https URLs', () => {
    expect(parseOwnerRepoFromRemoteUrl('https://github.com/some-org/some-repo')).toBe(
      'some-org/some-repo'
    );
  });

  it('parses https URLs with a .git suffix', () => {
    expect(parseOwnerRepoFromRemoteUrl('https://github.com/some-org/some-repo.git')).toBe(
      'some-org/some-repo'
    );
  });

  it('parses scp-style ssh URLs', () => {
    expect(parseOwnerRepoFromRemoteUrl('git@github.com:some-org/some-repo.git')).toBe(
      'some-org/some-repo'
    );
  });

  it('parses ssh:// URLs', () => {
    expect(parseOwnerRepoFromRemoteUrl('ssh://git@github.com/some-org/some-repo.git')).toBe(
      'some-org/some-repo'
    );
  });

  it('tolerates trailing slashes and surrounding whitespace', () => {
    expect(parseOwnerRepoFromRemoteUrl('  https://github.com/some-org/some-repo/  \n')).toBe(
      'some-org/some-repo'
    );
  });

  it('returns null for URLs without an owner/repo path', () => {
    expect(parseOwnerRepoFromRemoteUrl('https://github.com/only-owner')).toBeNull();
    expect(parseOwnerRepoFromRemoteUrl('not a url')).toBeNull();
    expect(parseOwnerRepoFromRemoteUrl('')).toBeNull();
    expect(parseOwnerRepoFromRemoteUrl('/local/path/to/repo')).toBeNull();
  });
});

describe('deriveRepoFromGitRemote', () => {
  it('derives owner/repo from an https origin', () => {
    const dir = tmp();
    gitInitWithOrigin(dir, 'https://github.com/some-org/some-repo.git');
    expect(deriveRepoFromGitRemote(dir)).toBe('some-org/some-repo');
  });

  it('derives owner/repo from an ssh origin', () => {
    const dir = tmp();
    gitInitWithOrigin(dir, 'git@github.com:some-org/some-repo.git');
    expect(deriveRepoFromGitRemote(dir)).toBe('some-org/some-repo');
  });

  it('returns null when the repo has no origin remote', () => {
    const dir = tmp();
    execFileSync('git', ['init', '--quiet'], { cwd: dir });
    expect(deriveRepoFromGitRemote(dir)).toBeNull();
  });

  it('returns null when the directory is not a git repository', () => {
    // Guard against tmpdir living inside a parent repo: use a nested dir with
    // GIT_CEILING semantics via a plain non-repo tmpdir (os.tmpdir() is not a repo).
    const dir = tmp();
    expect(deriveRepoFromGitRemote(dir)).toBeNull();
  });
});

describe('tracker.repo derivation through the config loaders (#902)', () => {
  it('loadTrackerClientConfigFromProject derives repo from origin when unset', () => {
    const dir = tmp();
    gitInitWithOrigin(dir, 'https://github.com/some-org/some-repo.git');
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({ roadmap: { tracker: { kind: 'github' } } })
    );
    const result = loadTrackerClientConfigFromProject(dir);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.repo).toBe('some-org/some-repo');
  });

  it('loadTrackerClientConfigFromProject keeps an explicitly configured repo', () => {
    const dir = tmp();
    gitInitWithOrigin(dir, 'https://github.com/derived-org/derived-repo.git');
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({ roadmap: { tracker: { kind: 'github', repo: 'explicit/wins' } } })
    );
    const result = loadTrackerClientConfigFromProject(dir);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.repo).toBe('explicit/wins');
  });

  it('loadTrackerClientConfigFromProject still errors clearly with no repo and no remote', () => {
    const dir = tmp();
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({ roadmap: { tracker: { kind: 'github' } } })
    );
    const result = loadTrackerClientConfigFromProject(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/repo is required/i);
  });

  it('loadTrackerSyncConfig derives repo from origin when unset', () => {
    const dir = tmp();
    gitInitWithOrigin(dir, 'git@github.com:some-org/some-repo.git');
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({ roadmap: { tracker: { kind: 'github', statusMap: { done: 'closed' } } } })
    );
    const cfg = loadTrackerSyncConfig(dir);
    expect(cfg).not.toBeNull();
    expect(cfg?.repo).toBe('some-org/some-repo');
  });

  it('loadTrackerSyncConfig keeps an explicitly configured repo', () => {
    const dir = tmp();
    gitInitWithOrigin(dir, 'git@github.com:derived-org/derived-repo.git');
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({
        roadmap: { tracker: { kind: 'github', repo: 'explicit/wins', statusMap: {} } },
      })
    );
    const cfg = loadTrackerSyncConfig(dir);
    expect(cfg?.repo).toBe('explicit/wins');
  });

  it('loadTrackerSyncConfig leaves repo unset when derivation fails', () => {
    const dir = tmp();
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({ roadmap: { tracker: { kind: 'github', statusMap: {} } } })
    );
    const cfg = loadTrackerSyncConfig(dir);
    expect(cfg).not.toBeNull();
    expect(cfg?.repo).toBeUndefined();
  });
});
