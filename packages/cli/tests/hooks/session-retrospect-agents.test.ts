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
} from 'node:fs';
import { tmpdir } from 'node:os';

/**
 * Per-agent session-retrospect entry points (Gemini CLI, Codex CLI, Cursor).
 *
 * Each entry point parses its agent's real session-end event shape, extracts a
 * session id, and delegates to the shared core. These tests spawn each entry
 * point against its agent's documented payload and assert: (1) the session id is
 * extracted from the correct field and used as the once-per-session sentinel
 * key, (2) the active session is archived through the shared onArchived seam,
 * (3) a repeat fire for the same session is a no-op, and (4) with the opt-in
 * flag unset nothing happens. The stubbing strategy mirrors
 * session-retrospect.test.ts (local @harness-engineering/{core,orchestrator}
 * stubs so the archive path runs without sqlite or a real build).
 */
const HOOKS_DIR = resolve(__dirname, '../../src/hooks');

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

function writeStubPackage(dir: string, name: string, indexSource: string): void {
  const pkgDir = join(dir, 'node_modules', ...name.split('/'));
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(
    join(pkgDir, 'package.json'),
    JSON.stringify({ name, type: 'module', main: 'index.js' })
  );
  writeFileSync(join(pkgDir, 'index.js'), indexSource);
}

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'session-retrospect-agents-'));
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}\n');
  // Copy the shared core + all per-agent entry points so their sibling imports
  // resolve, and the archive packages resolve against the temp stubs.
  for (const file of [
    'session-retrospect-core.js',
    'session-retrospect-gemini.js',
    'session-retrospect-codex.js',
    'session-retrospect-cursor.js',
  ]) {
    copyFileSync(join(HOOKS_DIR, file), join(dir, file));
  }
  writeStubPackage(dir, '@harness-engineering/core', CORE_STUB);
  writeStubPackage(dir, '@harness-engineering/orchestrator', ORCHESTRATOR_STUB);
  return dir;
}

function makeSession(dir: string, slug: string): void {
  const sessionDir = join(dir, '.harness', 'sessions', slug);
  mkdirSync(sessionDir, { recursive: true });
  writeFileSync(join(sessionDir, 'summary.md'), '# session\n');
}

function archiveCallCount(dir: string): number {
  const log = join(dir, 'archive-calls.log');
  if (!existsSync(log)) return 0;
  return readFileSync(log, 'utf-8').trim().split('\n').filter(Boolean).length;
}

function sentinelExists(dir: string, sessionId: string): boolean {
  return existsSync(join(dir, '.harness', 'state', 'retrospection', `${sessionId}.archived`));
}

interface AgentSpec {
  /** Agent label. */
  name: string;
  /** Entry-point script filename under the temp project. */
  script: string;
  /** The sanitized session id the entry point should derive (sentinel key). */
  sessionId: string;
  /** Build the payload for the agent's session-end event. */
  payload: (cwd: string) => Record<string, unknown>;
  /** How the payload is delivered: stdin (Gemini, Cursor) or argv (Codex). */
  delivery: 'stdin' | 'argv';
}

const AGENTS: AgentSpec[] = [
  {
    name: 'Gemini CLI (SessionEnd)',
    script: 'session-retrospect-gemini.js',
    sessionId: 'gemini-sess-1',
    delivery: 'stdin',
    payload: (cwd) => ({
      session_id: 'gemini-sess-1',
      transcript_path: '/tmp/t.json',
      cwd,
      hook_event_name: 'SessionEnd',
      timestamp: '2026-08-07T00:00:00Z',
      reason: 'exit',
    }),
  },
  {
    name: 'Codex CLI (notify / agent-turn-complete)',
    script: 'session-retrospect-codex.js',
    sessionId: 'codex-thread-1',
    delivery: 'argv',
    payload: (cwd) => ({
      type: 'agent-turn-complete',
      'thread-id': 'codex-thread-1',
      'turn-id': 'turn-9',
      cwd,
      'input-messages': ['hi'],
      'last-assistant-message': 'done',
    }),
  },
  {
    name: 'Cursor (sessionEnd)',
    script: 'session-retrospect-cursor.js',
    sessionId: 'cursor-sess-1',
    delivery: 'stdin',
    payload: (cwd) => ({
      conversation_id: 'cursor-conv-1',
      session_id: 'cursor-sess-1',
      reason: 'completed',
      duration_ms: 45000,
      is_background_agent: false,
      workspace_roots: [cwd],
    }),
  },
];

function runAgent(
  dir: string,
  spec: AgentSpec,
  payload: Record<string, unknown>,
  env: Record<string, string | undefined>
): { exitCode: number; stderr: string } {
  const json = JSON.stringify(payload);
  const args = spec.delivery === 'argv' ? [join(dir, spec.script), json] : [join(dir, spec.script)];
  const result = spawnSync('node', args, {
    input: spec.delivery === 'stdin' ? json : undefined,
    encoding: 'utf-8',
    cwd: dir,
    timeout: 60000,
    env: { ...process.env, ...env },
  });
  return { exitCode: result.status ?? (result.signal ? 0 : 1), stderr: result.stderr ?? '' };
}

const ON = { HARNESS_SESSION_RETROSPECTION: '1' };

function assertArchivesOnce(dir: string, spec: AgentSpec): void {
  makeSession(dir, 'active-session');
  const result = runAgent(dir, spec, spec.payload(dir), ON);
  expect(result.exitCode).toBe(0);
  expect(archiveCallCount(dir)).toBe(1);
  // onArchived (summary/index/retrospection) ran through the shared bundle.
  expect(existsSync(join(dir, 'retrospection-ran.marker'))).toBe(true);
  // The sentinel is keyed on THIS agent's session id, proving extraction read
  // the correct payload field.
  expect(sentinelExists(dir, spec.sessionId)).toBe(true);
}

function assertNoopOnRepeatFire(dir: string, spec: AgentSpec): void {
  makeSession(dir, 'active-session');
  expect(runAgent(dir, spec, spec.payload(dir), ON).exitCode).toBe(0);
  expect(archiveCallCount(dir)).toBe(1);

  // A fresh session appears, but the same agent session already archived.
  makeSession(dir, 'later-session');
  expect(runAgent(dir, spec, spec.payload(dir), ON).exitCode).toBe(0);
  expect(archiveCallCount(dir)).toBe(1);
  expect(existsSync(join(dir, '.harness', 'sessions', 'later-session'))).toBe(true);
}

function assertNoopWhenFlagUnset(dir: string, spec: AgentSpec): void {
  makeSession(dir, 'active-session');
  const result = runAgent(dir, spec, spec.payload(dir), {
    HARNESS_SESSION_RETROSPECTION: undefined,
  });
  expect(result.exitCode).toBe(0);
  expect(archiveCallCount(dir)).toBe(0);
  expect(existsSync(join(dir, '.harness', 'state', 'retrospection'))).toBe(false);
}

function assertFailSoftOnMalformed(dir: string, spec: AgentSpec): void {
  makeSession(dir, 'active-session');
  const args =
    spec.delivery === 'argv' ? [join(dir, spec.script), 'not json'] : [join(dir, spec.script)];
  const result = spawnSync('node', args, {
    input: spec.delivery === 'stdin' ? 'not json' : undefined,
    encoding: 'utf-8',
    cwd: dir,
    env: { ...process.env, ...ON },
  });
  expect(result.status).toBe(0);
  expect(archiveCallCount(dir)).toBe(0);
}

describe('per-agent session-retrospect entry points', { timeout: 60000 }, () => {
  let dir: string;

  beforeEach(() => {
    dir = setupProject();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // Each agent's four assertions live in named helpers so the per-agent
  // describe body stays a thin registration list (and under the complexity
  // budget). `getDir` reads the beforeEach-assigned temp project at call time.
  const registerAgentTests = (spec: AgentSpec, getDir: () => string): void => {
    describe(spec.name, () => {
      it('extracts the session id and archives the active session once when opted in', () =>
        assertArchivesOnce(getDir(), spec));
      it('is a no-op on a repeat fire for the same session', () =>
        assertNoopOnRepeatFire(getDir(), spec));
      it('is a no-op when the opt-in flag is unset', () => assertNoopWhenFlagUnset(getDir(), spec));
      it('exits 0 fail-soft on malformed input', () => assertFailSoftOnMalformed(getDir(), spec));
    });
  };

  for (const spec of AGENTS) {
    registerAgentTests(spec, () => dir);
  }

  it('Cursor stop payload (no session_id) falls back to conversation_id as the dedupe key', () => {
    makeSession(dir, 'active-session');
    const stopPayload = {
      conversation_id: 'cursor-conv-stop',
      generation_id: 'gen-1',
      model: 'auto',
      hook_event_name: 'stop',
      workspace_roots: [dir],
      status: 'completed',
      loop_count: 0,
    };
    const spec = AGENTS.find((a) => a.script === 'session-retrospect-cursor.js')!;
    const result = runAgent(dir, spec, stopPayload, ON);
    expect(result.exitCode).toBe(0);
    expect(archiveCallCount(dir)).toBe(1);
    expect(sentinelExists(dir, 'cursor-conv-stop')).toBe(true);
  });
});
