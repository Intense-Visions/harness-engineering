import * as fs from 'fs';
import * as path from 'path';

/**
 * The knowledge graph lives under `<projectRoot>/.harness/graph/`. This subpath
 * is gitignored, which has a subtle consequence for git worktrees: `git
 * worktree add` only materializes *tracked* files, so a freshly-created linked
 * worktree has no `.harness/graph/` of its own. Every graph consumer that
 * resolved the dir relative to the worktree therefore saw "No graph found".
 *
 * These helpers centralize graph-dir resolution so reads can transparently
 * borrow the main worktree's graph while writes stay worktree-local.
 */

/** The graph directory local to a given project root (no worktree fallback). */
export function localGraphDir(projectRoot: string): string {
  return path.join(projectRoot, '.harness', 'graph');
}

/** True when a directory contains a persisted graph (`graph.json`). */
function hasGraph(graphDir: string): boolean {
  return fs.existsSync(path.join(graphDir, 'graph.json'));
}

/**
 * If `projectRoot` is a *linked* git worktree, return the main worktree's root;
 * otherwise return null (primary worktree, plain clone, or no git at all).
 *
 * Reads git's own on-disk metadata — no subprocess:
 *   - A linked worktree's `.git` is a FILE `gitdir: <worktree-gitdir>`, whereas
 *     the primary worktree's `.git` is a directory.
 *   - `<worktree-gitdir>/commondir` records the common git dir (typically
 *     `../..`), which is `<mainRoot>/.git`; the main root is its parent.
 */
export function findMainWorktreeRoot(projectRoot: string): string | null {
  const dotGit = path.join(projectRoot, '.git');

  let stat: fs.Stats;
  try {
    stat = fs.statSync(dotGit);
  } catch {
    return null; // no .git — not a worktree
  }
  if (stat.isDirectory()) return null; // primary worktree / plain clone

  let contents: string;
  try {
    contents = fs.readFileSync(dotGit, 'utf8');
  } catch {
    return null;
  }
  const match = contents.match(/^gitdir:\s*(.+?)\s*$/m);
  if (!match) return null;

  let gitdir = match[1]!.trim();
  if (!path.isAbsolute(gitdir)) gitdir = path.resolve(projectRoot, gitdir);

  let commonGitDir: string;
  try {
    const rel = fs.readFileSync(path.join(gitdir, 'commondir'), 'utf8').trim();
    commonGitDir = path.resolve(gitdir, rel);
  } catch {
    // Fallback: <gitdir> is `<common>/.git/worktrees/<name>` ⇒ up two levels.
    commonGitDir = path.resolve(gitdir, '..', '..');
  }

  // commonGitDir is `<mainRoot>/.git` ⇒ mainRoot is its parent.
  return path.dirname(commonGitDir);
}

export type GraphDirMode = 'read' | 'write';

/**
 * Resolve the graph directory for a project root, transparently supporting git
 * worktrees.
 *
 * - `'write'` (scans, ingests): always the worktree-local dir, so building a
 *   graph inside a worktree never clobbers the main worktree's graph.
 * - `'read'` (default): the worktree-local dir when it already holds a graph
 *   (an explicit in-worktree `harness graph scan` takes precedence); otherwise
 *   the main worktree's graph when running in a linked worktree; otherwise the
 *   local dir (preserving the existing "no graph found" behavior for non-git or
 *   truly ungraphed projects).
 */
export function resolveGraphDir(projectRoot: string, mode: GraphDirMode = 'read'): string {
  const local = localGraphDir(projectRoot);
  if (mode === 'write') return local;
  if (hasGraph(local)) return local;

  const mainRoot = findMainWorktreeRoot(projectRoot);
  if (mainRoot) {
    const mainGraph = localGraphDir(mainRoot);
    if (hasGraph(mainGraph)) return mainGraph;
  }
  return local;
}
