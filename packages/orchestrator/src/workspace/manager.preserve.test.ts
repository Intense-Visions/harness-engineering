import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { WorkspaceManager } from './manager';
import type { WorkspaceConfig } from '@harness-engineering/types';

/**
 * Regression: within-run retries MUST preserve the ONE worktree so a local/codex
 * agent's uncommitted partial progress survives a gate-block re-dispatch. An
 * earlier ollama-path bug wiped and recreated the worktree on every re-dispatch,
 * throwing away the agent's edits each round so it could never build on prior work.
 * The fix is `ensureWorkspace(id, { preserve: true })` — this locks it in.
 *
 * The `git` seam is overridden (its documented test hook) and records calls, so we
 * can assert the preserve path performs NO destructive worktree ops.
 */
class RecordingWM extends WorkspaceManager {
  public readonly calls: string[][] = [];
  protected async git(args: string[], _cwd: string): Promise<string> {
    this.calls.push(args);
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return `${this.rootDir}\n`;
    return 'ok\n';
  }
  constructor(public rootDir: string) {
    super({ root: rootDir, baseRef: 'origin/main' } as WorkspaceConfig);
  }
}

let root: string;
let wm: RecordingWM;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-preserve-'));
  wm = new RecordingWM(root);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

/** Simulate an existing worktree with the agent's uncommitted work in it. */
function seedExistingWorktree(id: string): { wsPath: string; sentinel: string } {
  const wsPath = wm.resolvePath(id);
  fs.mkdirSync(path.join(wsPath, '.git'), { recursive: true });
  const sentinel = path.join(wsPath, 'partial-progress.ts');
  fs.writeFileSync(sentinel, 'export const inProgress = true;\n');
  return { wsPath, sentinel };
}

describe('WorkspaceManager.ensureWorkspace — within-run preservation', () => {
  it('preserve:true reuses the worktree and keeps the agent uncommitted work', async () => {
    const { wsPath, sentinel } = seedExistingWorktree('iss-1');

    const r = await wm.ensureWorkspace('iss-1', { preserve: true });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.reused).toBe(true);
      expect(path.resolve(r.value.path)).toBe(path.resolve(wsPath));
    }
    // The agent's partial progress survives the re-dispatch.
    expect(fs.existsSync(sentinel)).toBe(true);
    // And NO destructive worktree op ran (no remove, no add, no re-seed).
    expect(wm.calls).toEqual([]);
  });

  it('preserve:false wipes and recreates from base (fresh, not reused)', async () => {
    seedExistingWorktree('iss-1');

    const r = await wm.ensureWorkspace('iss-1', { preserve: false });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.reused).toBe(false);
    // The destructive path DID run — proving preserve is what protects progress.
    expect(wm.calls.some((c) => c[0] === 'worktree' && c[1] === 'remove')).toBe(true);
    expect(wm.calls.some((c) => c[0] === 'worktree' && c[1] === 'add')).toBe(true);
  });

  it('preserve:true with NO existing worktree falls through to a fresh create', async () => {
    // No seedExistingWorktree — preserve has nothing to keep, so it must create.
    const r = await wm.ensureWorkspace('iss-2', { preserve: true });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.reused).toBe(false);
    expect(wm.calls.some((c) => c[0] === 'worktree' && c[1] === 'add')).toBe(true);
  });
});
