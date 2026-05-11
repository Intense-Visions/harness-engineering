import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import { syncMain } from '../../src/maintenance/sync-main';

function git(args: string[], cwd: string): string {
  // Disable autocrlf/eol normalization so Windows runners don't rewrite LF -> CRLF
  // on checkout. Test assertions compare against literal '\n' content.
  return execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', ...args], {
    cwd,
    encoding: 'utf8',
  }).toString();
}

describe('syncMain — integration (real git)', () => {
  let tmpDir: string;
  let remote: string;
  let local: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-syncmain-'));
    remote = path.join(tmpDir, 'remote.git');
    local = path.join(tmpDir, 'local');

    // Create a non-bare "upstream" working repo, then clone a bare from it.
    const seed = path.join(tmpDir, 'seed');
    fs.mkdirSync(seed, { recursive: true });
    git(['init', '-q', '-b', 'main'], seed);
    git(['config', 'user.email', 'test@example.com'], seed);
    git(['config', 'user.name', 'Test'], seed);
    fs.writeFileSync(path.join(seed, 'README.md'), 'one\n');
    git(['add', '.'], seed);
    git(['commit', '-q', '-m', 'one'], seed);
    git(['clone', '-q', '--bare', seed, remote], tmpDir);

    // Now clone the bare into our 'local' working copy and configure identity.
    git(['clone', '-q', remote, local], tmpDir);
    git(['config', 'user.email', 'test@example.com'], local);
    git(['config', 'user.name', 'Test'], local);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns no-op when local equals origin', async () => {
    const r = await syncMain(local);
    expect(r.status).toBe('no-op');
    if (r.status === 'no-op') expect(r.defaultBranch).toBe('main');
  });

  it('returns updated and advances local HEAD when origin is ahead', async () => {
    // Advance the bare via a second working clone.
    const pusher = path.join(tmpDir, 'pusher');
    git(['clone', '-q', remote, pusher], tmpDir);
    git(['config', 'user.email', 'test@example.com'], pusher);
    git(['config', 'user.name', 'Test'], pusher);
    fs.writeFileSync(path.join(pusher, 'README.md'), 'two\n');
    git(['commit', '-q', '-am', 'two'], pusher);
    git(['push', '-q', 'origin', 'main'], pusher);

    const before = git(['rev-parse', 'HEAD'], local).trim();
    const r = await syncMain(local);
    expect(r.status).toBe('updated');
    const after = git(['rev-parse', 'HEAD'], local).trim();
    expect(after).not.toBe(before);
    if (r.status === 'updated') {
      expect(r.from).toBe(before);
      expect(r.to).toBe(after);
      expect(r.defaultBranch).toBe('main');
    }
    expect(fs.readFileSync(path.join(local, 'README.md'), 'utf8')).toBe('two\n');
  });

  it('returns skipped:wrong-branch when checked out on a topic branch', async () => {
    git(['checkout', '-q', '-b', 'topic'], local);
    const r = await syncMain(local);
    expect(r.status).toBe('skipped');
    if (r.status === 'skipped') expect(r.reason).toBe('wrong-branch');
  });

  it('returns skipped:diverged when local has a commit not on origin', async () => {
    // Origin advances README.md, then local makes its own (different) commit.
    const pusher = path.join(tmpDir, 'pusher-div');
    git(['clone', '-q', remote, pusher], tmpDir);
    git(['config', 'user.email', 'test@example.com'], pusher);
    git(['config', 'user.name', 'Test'], pusher);
    fs.writeFileSync(path.join(pusher, 'README.md'), 'remote-change\n');
    git(['commit', '-q', '-am', 'remote-change'], pusher);
    git(['push', '-q', 'origin', 'main'], pusher);

    fs.writeFileSync(path.join(local, 'OTHER.md'), 'local-only\n');
    git(['add', 'OTHER.md'], local);
    git(['commit', '-q', '-m', 'local-only'], local);

    const r = await syncMain(local);
    expect(r.status).toBe('skipped');
    if (r.status === 'skipped') expect(r.reason).toBe('diverged');
  });

  it('returns skipped:dirty-conflict when working-tree edit conflicts with incoming', async () => {
    // Origin advances README.md, local also dirties README.md uncommitted.
    const pusher = path.join(tmpDir, 'pusher2');
    git(['clone', '-q', remote, pusher], tmpDir);
    git(['config', 'user.email', 'test@example.com'], pusher);
    git(['config', 'user.name', 'Test'], pusher);
    fs.writeFileSync(path.join(pusher, 'README.md'), 'remote-change\n');
    git(['commit', '-q', '-am', 'remote-change'], pusher);
    git(['push', '-q', 'origin', 'main'], pusher);

    fs.writeFileSync(path.join(local, 'README.md'), 'local-uncommitted\n');
    const r = await syncMain(local);
    expect(r.status).toBe('skipped');
    if (r.status === 'skipped') expect(r.reason).toBe('dirty-conflict');
    // Working tree must remain byte-identical to what we wrote.
    expect(fs.readFileSync(path.join(local, 'README.md'), 'utf8')).toBe('local-uncommitted\n');
  });

  it('returns skipped:fetch-failed or no-remote when origin URL is unreachable', async () => {
    git(['remote', 'set-url', 'origin', 'file:///definitely/does/not/exist.git'], local);
    const r = await syncMain(local);
    expect(r.status).toBe('skipped');
    // Either reason is acceptable: depends on whether origin/HEAD survives.
    if (r.status === 'skipped') {
      expect(['fetch-failed', 'no-remote']).toContain(r.reason);
    }
  });
});
