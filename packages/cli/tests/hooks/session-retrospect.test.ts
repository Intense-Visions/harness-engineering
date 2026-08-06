import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';

const HOOK_SRC = resolve(__dirname, '../../src/hooks/session-retrospect.js');

/**
 * The hook resolves `@harness-engineering/core` and `@harness-engineering/
 * orchestrator` relative to its own location. To exercise the archive path
 * deterministically — without building the real packages or touching sqlite —
 * we copy the (self-contained) hook into a temp project and provide local stub
 * packages. The core stub records each archive call and invokes the onArchived
 * hook it is handed, so the test can also assert that the retrospection seam
 * (onArchived) is wired through the hook bundle.
 */
/** Write a local stub package under the temp project's node_modules. */
function writeStubPackage(dir: string, name: string, indexSource: string): void {
  const pkgDir = join(dir, 'node_modules', ...name.split('/'));
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(
    join(pkgDir, 'package.json'),
    JSON.stringify({ name, type: 'module', main: 'index.js' })
  );
  writeFileSync(join(pkgDir, 'index.js'), indexSource);
}

// @harness-engineering/core stub: archiveSession logs the call, simulates the
// directory move, and invokes onArchived (the seam #1124 augments).
const CORE_STUB = `import { appendFileSync, existsSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
export async function archiveSession(projectPath, slug, options) {
  appendFileSync(join(projectPath, 'archive-calls.log'), slug + '\\n');
  const src = join(projectPath, '.harness', 'sessions', slug);
  const destBase = join(projectPath, '.harness', 'archive', 'sessions');
  mkdirSync(destBase, { recursive: true });
  const dest = join(destBase, slug + '-archived');
  if (existsSync(src)) renameSync(src, dest);
  if (options && options.hooks && options.hooks.onArchived) {
    await options.hooks.onArchived({ sessionId: slug, archiveDir: dest, projectPath });
  }
  return { ok: true, value: undefined };
}
`;

// @harness-engineering/orchestrator stub: buildArchiveHooks returns an
// onArchived that writes a marker, standing in for the retrospection step.
const ORCHESTRATOR_STUB = `import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
export function buildArchiveHooks(opts) {
  return {
    async onArchived({ sessionId }) {
      writeFileSync(join(opts.projectPath, 'retrospection-ran.marker'), sessionId + '\\n');
    },
  };
}
`;

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'session-retrospect-'));
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}\n');
  // Copy the hook into the temp project so bare-specifier imports resolve
  // against the temp project's node_modules stubs.
  copyFileSync(HOOK_SRC, join(dir, 'session-retrospect.js'));
  writeStubPackage(dir, '@harness-engineering/core', CORE_STUB);
  writeStubPackage(dir, '@harness-engineering/orchestrator', ORCHESTRATOR_STUB);
  return dir;
}

function makeSession(dir: string, slug: string): void {
  const sessionDir = join(dir, '.harness', 'sessions', slug);
  mkdirSync(sessionDir, { recursive: true });
  writeFileSync(join(sessionDir, 'summary.md'), '# session\n');
}

function runHook(
  dir: string,
  sessionId: string,
  env: Record<string, string | undefined>
): { exitCode: number; stderr: string } {
  const result = spawnSync('node', [join(dir, 'session-retrospect.js')], {
    input: JSON.stringify({ session_id: sessionId, hook_event_name: 'Stop' }),
    encoding: 'utf-8',
    cwd: dir,
    timeout: 60000,
    env: { ...process.env, ...env },
  });
  return { exitCode: result.status ?? (result.signal ? 0 : 1), stderr: result.stderr ?? '' };
}

function archiveCallCount(dir: string): number {
  const log = join(dir, 'archive-calls.log');
  if (!existsSync(log)) return 0;
  return readFileSync(log, 'utf-8').trim().split('\n').filter(Boolean).length;
}

describe('session-retrospect', { timeout: 60000 }, () => {
  let dir: string;

  beforeEach(() => {
    dir = setupProject();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const ON = { HARNESS_SESSION_RETROSPECTION: '1' };

  it('archives the active session once when opted in', () => {
    makeSession(dir, 'my-session');
    const result = runHook(dir, 'claude-abc', ON);
    expect(result.exitCode).toBe(0);
    expect(archiveCallCount(dir)).toBe(1);
    // The onArchived seam (summary/index/retrospection) ran through the bundle.
    expect(existsSync(join(dir, 'retrospection-ran.marker'))).toBe(true);
    // The session was moved out of the active sessions dir.
    expect(existsSync(join(dir, '.harness', 'sessions', 'my-session'))).toBe(false);
    // The once-per-session sentinel was recorded.
    expect(existsSync(join(dir, '.harness', 'state', 'retrospection', 'claude-abc.archived'))).toBe(
      true
    );
  });

  it('is a no-op on a repeat stop for the same session', () => {
    makeSession(dir, 'my-session');
    expect(runHook(dir, 'claude-abc', ON).exitCode).toBe(0);
    expect(archiveCallCount(dir)).toBe(1);

    // A fresh session dir appears, but the same Claude session already archived.
    makeSession(dir, 'later-session');
    const result = runHook(dir, 'claude-abc', ON);
    expect(result.exitCode).toBe(0);
    // Still exactly one archive — the sentinel short-circuited the repeat stop.
    expect(archiveCallCount(dir)).toBe(1);
    expect(existsSync(join(dir, '.harness', 'sessions', 'later-session'))).toBe(true);
  });

  it('is a no-op when the opt-in flag is unset', () => {
    makeSession(dir, 'my-session');
    const result = runHook(dir, 'claude-abc', { HARNESS_SESSION_RETROSPECTION: undefined });
    expect(result.exitCode).toBe(0);
    expect(archiveCallCount(dir)).toBe(0);
    expect(existsSync(join(dir, '.harness', 'sessions', 'my-session'))).toBe(true);
    expect(existsSync(join(dir, '.harness', 'state', 'retrospection'))).toBe(false);
  });

  it('is a no-op when the flag is set to a falsey value', () => {
    makeSession(dir, 'my-session');
    const result = runHook(dir, 'claude-abc', { HARNESS_SESSION_RETROSPECTION: '0' });
    expect(result.exitCode).toBe(0);
    expect(archiveCallCount(dir)).toBe(0);
  });

  it('writes no sentinel when there is no session to archive (retries later)', () => {
    // No sessions dir at all.
    const result = runHook(dir, 'claude-abc', ON);
    expect(result.exitCode).toBe(0);
    expect(archiveCallCount(dir)).toBe(0);
    expect(existsSync(join(dir, '.harness', 'state', 'retrospection'))).toBe(false);

    // A session created later in the same run is caught by a subsequent stop.
    makeSession(dir, 'my-session');
    const result2 = runHook(dir, 'claude-abc', ON);
    expect(result2.exitCode).toBe(0);
    expect(archiveCallCount(dir)).toBe(1);
  });

  it('archives the most-recently-modified session', () => {
    makeSession(dir, 'old-session');
    // Ensure a distinct, later mtime for the second session.
    const spin = Date.now() + 15;
    while (Date.now() < spin) {
      /* wait so mtimes differ */
    }
    makeSession(dir, 'new-session');
    runHook(dir, 'claude-abc', ON);
    const log = readFileSync(join(dir, 'archive-calls.log'), 'utf-8').trim();
    expect(log).toBe('new-session');
  });

  it('exits 0 (fail-soft) when the archive throws', () => {
    makeSession(dir, 'my-session');
    // Overwrite the core stub so archiveSession throws.
    const coreIndex = join(dir, 'node_modules', '@harness-engineering', 'core', 'index.js');
    writeFileSync(
      coreIndex,
      `export async function archiveSession() { throw new Error('boom'); }\n`
    );
    const result = runHook(dir, 'claude-abc', ON);
    expect(result.exitCode).toBe(0);
    // No sentinel written on failure, so the next stop can retry.
    expect(existsSync(join(dir, '.harness', 'state', 'retrospection', 'claude-abc.archived'))).toBe(
      false
    );
  });

  it('exits 0 on empty stdin', () => {
    const result = spawnSync('node', [join(dir, 'session-retrospect.js')], {
      input: '',
      encoding: 'utf-8',
      cwd: dir,
      env: { ...process.env, ...ON },
    });
    expect(result.status).toBe(0);
  });

  it('exits 0 on malformed stdin', () => {
    const result = spawnSync('node', [join(dir, 'session-retrospect.js')], {
      input: 'not json',
      encoding: 'utf-8',
      cwd: dir,
      env: { ...process.env, ...ON },
    });
    expect(result.status).toBe(0);
  });

  it('does not resolve archive packages when the flag is unset (pure no-op)', () => {
    // Remove the stub packages entirely; with the flag off the hook must not try
    // to import them and must still exit 0.
    rmSync(join(dir, 'node_modules'), { recursive: true, force: true });
    makeSession(dir, 'my-session');
    const result = runHook(dir, 'claude-abc', { HARNESS_SESSION_RETROSPECTION: undefined });
    expect(result.exitCode).toBe(0);
    // Sanity: the sessions dir is untouched.
    expect(readdirSync(join(dir, '.harness', 'sessions'))).toContain('my-session');
  });
});
