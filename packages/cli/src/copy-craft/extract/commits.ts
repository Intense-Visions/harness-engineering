/**
 * Commit subject extractor — shells out to `git log` to capture recent
 * commit subjects with their hashes. Returns [] when not in a git repo
 * (caller records the skip in summary.skippedSurfaces).
 *
 * Source: docs/changes/craft-pipeline/copy-craft/proposal.md
 *   (Technical Design → Git / GitHub extractors).
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ExtractedCopyItem } from '../findings/schema.js';

const GIT_TIMEOUT_MS = 10_000;

export interface ExtractCommitsInput {
  projectRoot: string;
  since?: string;
  limit?: number;
}

export interface ExtractCommitsResult {
  items: ExtractedCopyItem[];
  skipReason?: string;
}

export function extractCommits(input: ExtractCommitsInput): ExtractCommitsResult {
  const { projectRoot, since = '1 month ago', limit = 100 } = input;

  if (!isGitRepo(projectRoot)) {
    return { items: [], skipReason: 'not a git repo' };
  }

  let raw: string;
  try {
    raw = execSync(
      `git log --pretty=format:'%H%x09%s' --since="${escapeShell(since)}" -n ${limit}`,
      {
        cwd: projectRoot,
        encoding: 'utf-8',
        timeout: GIT_TIMEOUT_MS,
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    );
  } catch (err) {
    return {
      items: [],
      skipReason: `git log failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const items: ExtractedCopyItem[] = [];
  for (const line of raw.split('\n')) {
    if (line.trim().length === 0) continue;
    const [hash, subject] = line.split('\t', 2);
    if (hash === undefined || subject === undefined) continue;
    items.push({
      file: `git:${hash}`,
      surface: 'commit',
      snippet: subject.trim(),
      context: { ref: hash },
    });
  }
  return { items };
}

function isGitRepo(projectRoot: string): boolean {
  // Walk up to find .git directory or file (worktrees use a file).
  let dir = projectRoot;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, '.git'))) return true;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return false;
}

function escapeShell(s: string): string {
  // Escape double quotes for the -- argument; we wrap in double quotes
  // already in the command string above.
  return s.replace(/"/g, '\\"');
}
