// packages/cli/src/shared/craft/scope.ts
//
// The two scope checks every craft MCP tool shares (#2625; same defect class
// as #2622 and the umbrella #2084, "reports success without running").
//
// 1. `craftPathError` — the `path` a craft tool is handed must be an existing
//    directory. Before this guard, a nonexistent path discovered zero files
//    and the run reported `findings: []`, the same output as a clean critique.
//    In in-session mode the only reason it errored was the run-state mkdir,
//    and under a writable parent that mkdir CREATED the missing directory.
//
// 2. `withCraftAbstention` — a run over an existing scope that examined zero
//    candidates abstains instead of reporting a clean result. The shape is
//    the one security-craft introduced for the same reason (#2234):
//    `{ reason: 'no-candidate-files', message }`, on the collect output and
//    on `summary` of the run/finalize output. Absent on every run that looked.

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Validate a craft tool's `path` input. Returns an error message, or `null`
 * when `path` names an existing directory. Relative paths resolve against the
 * process cwd, the same resolution `sanitizePath` applies downstream.
 */
export function craftPathError(tool: string, inputPath: unknown): string | null {
  if (typeof inputPath !== 'string' || inputPath.length === 0) {
    return `${tool}: \`path\` is required`;
  }
  const resolved = path.resolve(inputPath);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    return (
      `${tool}: path "${inputPath}" does not exist (resolved to ${resolved}). ` +
      'Pass the project root directory; nothing was critiqued.'
    );
  }
  if (!stat.isDirectory()) {
    return (
      `${tool}: path "${inputPath}" is not a directory (resolved to ${resolved}). ` +
      'Pass the project root directory, and scope individual files with `files`; ' +
      'nothing was critiqued.'
    );
  }
  return null;
}

/** Why a craft run's empty result says nothing about the code. */
export interface CraftAbstention {
  reason: 'no-candidate-files';
  message: string;
}

/**
 * Spread into a collect output or a run/finalize `summary`: yields
 * `{ abstention }` when the run examined zero candidates, `{}` otherwise.
 *
 * `candidates` is the number of units the run had to examine (discovered, or
 * passed as `files`) — the denominator, not the number that produced findings.
 */
export function withCraftAbstention(
  skill: string,
  candidates: number | undefined,
  unit = 'files'
): { abstention?: CraftAbstention } {
  if (candidates !== 0) return {};
  return {
    abstention: {
      reason: 'no-candidate-files',
      message:
        `${skill} examined 0 ${unit}: discovery found nothing to critique under the given ` +
        'path, and no files were passed. This is an abstention, not a clean result — pass ' +
        '`files` explicitly or point `path` at the directory that holds them.',
    },
  };
}
