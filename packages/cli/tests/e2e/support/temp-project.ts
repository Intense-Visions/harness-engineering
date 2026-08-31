// Shared E2E helper: scaffold a REAL temp project and (optionally) a REAL git repo.
//
// Part of the tiered E2E framework (ADR 0111). Replaces the `mkdtemp` + write-tree
// + `git init` logic that was copy-pasted inline across ~20 E2E/integration tests.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** A file tree keyed by project-relative POSIX path → file contents. */
export type FileTree = Record<string, string>;

/**
 * Create a fresh temp directory and write `files` into it (creating parent dirs).
 * Returns the absolute project root. Pair with {@link cleanup} in `afterAll`.
 */
export function scaffoldProject(files: FileTree, prefix = 'harness-e2e-'): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  for (const [rel, contents] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, contents);
  }
  return dir;
}

/**
 * Initialise a real, committed git repo in `dir` (quiet, deterministic identity).
 * Realistic for flows that derive a change surface from git; also makes the temp
 * project a valid repo for hooks/branch resolution.
 */
export function initGitRepo(dir: string): void {
  const git = (args: string[]) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  git(['init', '-q']);
  git(['config', 'user.email', 'e2e@test']);
  git(['config', 'user.name', 'e2e']);
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'init']);
}

/** Recursively remove a scaffolded dir. Safe to call with a falsy/absent path. */
export function cleanup(dir: string | undefined): void {
  if (dir) rmSync(dir, { recursive: true, force: true });
}
