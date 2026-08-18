// packages/cli/src/shared/craft/runs/store.ts
//
// Persists in-session craft runs to disk so a two-step MCP flow
// (collect → finalize) can resume across separate tool calls.
//
// Layout:
//   <projectRoot>/.harness/craft/runs/<runId>.json
//
// One run-state file per active runId. The orchestrator that consumes
// this is responsible for deleting the file after a successful finalize
// (or letting it expire — see `pruneOldRuns`).

import * as fs from 'node:fs';
import * as path from 'node:path';

const RUN_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export interface CraftRunState<TMeta> {
  /** Schema version for forward compatibility. */
  v: 1;
  runId: string;
  skill: string;
  createdAt: number;
  /** Skill-specific metadata sufficient to reconstruct findings from responses. */
  meta: TMeta;
}

function runsDir(projectRoot: string): string {
  return path.join(projectRoot, '.harness', 'craft', 'runs');
}

function runPath(projectRoot: string, runId: string): string {
  return path.join(runsDir(projectRoot), `${runId}.json`);
}

export function saveRunState<TMeta>(
  projectRoot: string,
  state: CraftRunState<TMeta>
): { runFile: string } {
  const dir = runsDir(projectRoot);
  fs.mkdirSync(dir, { recursive: true });
  const file = runPath(projectRoot, state.runId);
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
  return { runFile: file };
}

export function loadRunState<TMeta>(
  projectRoot: string,
  runId: string
): CraftRunState<TMeta> | null {
  const file = runPath(projectRoot, runId);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    return JSON.parse(raw) as CraftRunState<TMeta>;
  } catch {
    return null;
  }
}

/**
 * Load a persisted run-state, throwing a clear, actionable error when it is
 * missing or belongs to a different craft skill. Shared by the craft finalize
 * entries so each keeps a single-story body.
 */
export function loadRunStateOrThrow<TMeta>(
  projectRoot: string,
  runId: string,
  skill: string
): CraftRunState<TMeta> {
  const state = loadRunState<TMeta>(projectRoot, runId);
  if (state === null) {
    throw new Error(
      `${skill}: no persisted run found for runId=${runId} under ${projectRoot}. ` +
        `Run collect first, or ensure the path matches the project root used at collection time.`
    );
  }
  if (state.skill !== skill) {
    throw new Error(`${skill}: runId=${runId} belongs to skill ${state.skill}, not ${skill}.`);
  }
  return state;
}

export function deleteRunState(projectRoot: string, runId: string): void {
  const file = runPath(projectRoot, runId);
  try {
    fs.unlinkSync(file);
  } catch {
    /* ignore */
  }
}

/** Best-effort cleanup of run-state files older than TTL. Swallow errors. */
export function pruneOldRuns(projectRoot: string, now: number = Date.now()): void {
  const dir = runsDir(projectRoot);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const full = path.join(dir, entry.name);
    try {
      const stat = fs.statSync(full);
      if (now - stat.mtimeMs > RUN_TTL_MS) fs.unlinkSync(full);
    } catch {
      /* ignore */
    }
  }
}
