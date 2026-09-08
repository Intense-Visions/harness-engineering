/**
 * Dependency resolution for a `kind: "pnyon"` tracker — the wiring half of
 * #1863 (spec: docs/changes/pnyon-tracker-sync-adapter/proposal.md).
 *
 * `PnyonSyncAdapter` can be complete, correct, and fully unit-tested while
 * `harness roadmap sync` still refuses every Waypoint config, because nothing
 * in the CLI ever constructs it. That gap is invisible to the adapter's own
 * tests by construction, so it gets its own: these assert the CLI actually
 * reaches the Waypoint adapter, and that the GitHub path did not shift under it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PnyonSyncAdapter, GitHubIssuesSyncAdapter } from '@harness-engineering/core';
import { resolveConfig, resolveAdapter } from '../../../src/commands/roadmap/sync-deps';

let cwd: string;
const savedEnv = { ...process.env };

function writeTracker(tracker: unknown): void {
  fs.writeFileSync(
    path.join(cwd, 'harness.config.json'),
    JSON.stringify({ roadmap: { tracker } }, null, 2)
  );
}

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-deps-pnyon-'));
  delete process.env.PNYON_TOKEN;
  delete process.env.GITHUB_TOKEN;
});

afterEach(() => {
  process.env = { ...savedEnv };
  fs.rmSync(cwd, { recursive: true, force: true });
});

describe('resolveConfig — a Waypoint config is usable (SC-1)', () => {
  it('accepts a pnyon tracker that has no `repo`', () => {
    writeTracker({ kind: 'pnyon', url: 'https://waypoint.test/o/one' });

    const result = resolveConfig({}, cwd);

    // The pre-#1863 guard demanded `repo` of every kind, so a valid Waypoint
    // config was rejected for missing a GitHub-only field.
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.kind).toBe('pnyon');
  });

  it('still demands `repo` of a github tracker', () => {
    writeTracker({ kind: 'github', statusMap: { done: 'closed' } });

    const result = resolveConfig({}, cwd);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.message).toContain('repo');
  });
});

describe('resolveAdapter — the Waypoint adapter is actually constructed (SC-1)', () => {
  it('builds a PnyonSyncAdapter for a pnyon config with a config token', async () => {
    writeTracker({ kind: 'pnyon', url: 'https://waypoint.test/o/one', token: 'from-config' });
    const config = resolveConfig({}, cwd);
    expect(config.ok).toBe(true);

    const result = await resolveAdapter({}, cwd, config.ok ? config.value : ({} as never));

    expect(result.ok).toBe(true);
    // The concrete class matters: a GitHub adapter here would sync a Waypoint
    // roadmap to the wrong backend rather than fail.
    expect(result.ok && result.value).toBeInstanceOf(PnyonSyncAdapter);
  });

  it('falls back to PNYON_TOKEN when the config carries no token', async () => {
    writeTracker({ kind: 'pnyon', url: 'https://waypoint.test/o/one' });
    process.env.PNYON_TOKEN = 'from-env';
    const config = resolveConfig({}, cwd);

    const result = await resolveAdapter({}, cwd, config.ok ? config.value : ({} as never));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBeInstanceOf(PnyonSyncAdapter);
  });

  it('reads the token from the project .env, not only the ambient environment', async () => {
    writeTracker({ kind: 'pnyon', url: 'https://waypoint.test/o/one' });
    fs.writeFileSync(path.join(cwd, '.env'), 'PNYON_TOKEN=from-dotenv\n');
    const config = resolveConfig({}, cwd);

    const result = await resolveAdapter({}, cwd, config.ok ? config.value : ({} as never));

    // The .env load used to be guarded on GITHUB_TOKEN, so a Waypoint token
    // sitting in the very same file was never picked up.
    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBeInstanceOf(PnyonSyncAdapter);
  });

  it('refuses with an actionable message when no Waypoint token can be found', async () => {
    writeTracker({ kind: 'pnyon', url: 'https://waypoint.test/o/one' });
    const config = resolveConfig({}, cwd);

    const result = await resolveAdapter({}, cwd, config.ok ? config.value : ({} as never));

    expect(result.ok).toBe(false);
    // Name both places a token may come from; "missing token" alone leaves the
    // reader guessing which knob to turn.
    expect(result.ok === false && result.error.message).toContain('PNYON_TOKEN');
    expect(result.ok === false && result.error.message).toContain('roadmap.tracker.token');
  });

  it('does not fall back to the GitHub adapter when the Waypoint token is missing', async () => {
    writeTracker({ kind: 'pnyon', url: 'https://waypoint.test/o/one' });
    process.env.GITHUB_TOKEN = 'gh-token-that-must-not-be-used';
    const config = resolveConfig({}, cwd);

    const result = await resolveAdapter({}, cwd, config.ok ? config.value : ({} as never));

    // Silently syncing a Waypoint roadmap through GitHub because a GitHub token
    // happened to be present would be the worst outcome available here.
    expect(result.ok).toBe(false);
  });
});

describe('resolveAdapter — the GitHub path is unchanged (SC-5)', () => {
  it('still builds a GitHubIssuesSyncAdapter from GITHUB_TOKEN', async () => {
    writeTracker({ kind: 'github', repo: 'o/r', statusMap: { done: 'closed' } });
    process.env.GITHUB_TOKEN = 'gh-token';
    const config = resolveConfig({}, cwd);
    expect(config.ok).toBe(true);

    const result = await resolveAdapter({}, cwd, config.ok ? config.value : ({} as never));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBeInstanceOf(GitHubIssuesSyncAdapter);
  });

  it('still reads GITHUB_TOKEN from the project .env', async () => {
    writeTracker({ kind: 'github', repo: 'o/r', statusMap: { done: 'closed' } });
    fs.writeFileSync(path.join(cwd, '.env'), 'GITHUB_TOKEN=gh-from-dotenv\n');
    const config = resolveConfig({}, cwd);

    const result = await resolveAdapter({}, cwd, config.ok ? config.value : ({} as never));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBeInstanceOf(GitHubIssuesSyncAdapter);
  });

  it('an injected adapter still wins over both branches', async () => {
    writeTracker({ kind: 'pnyon', url: 'https://waypoint.test/o/one', token: 't' });
    const injected = { marker: 'injected' } as never;
    const config = resolveConfig({}, cwd);

    const result = await resolveAdapter(
      { adapter: injected },
      cwd,
      config.ok ? config.value : ({} as never)
    );

    expect(result.ok && result.value).toBe(injected);
  });
});
