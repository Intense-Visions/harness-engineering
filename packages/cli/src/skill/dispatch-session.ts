/**
 * Session-start dispatch integration.
 *
 * Detects HEAD delta since last dispatch and returns skill recommendations
 * when the codebase has changed. Uses cached health snapshot for speed.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { dispatchSkillsFromGit } from './dispatch-engine.js';
import type { DispatchResult } from './dispatch-types.js';

const LAST_HEAD_FILE = '.harness/dispatch-last-head.txt';

/**
 * Get the current git HEAD SHA, or null if not in a git repo.
 */
export function getCurrentHead(projectPath: string): string | null {
  try {
    return execSync('git rev-parse HEAD', {
      cwd: projectPath,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Read the last-seen HEAD from the dispatch tracking file.
 */
export function readLastHead(projectPath: string): string | null {
  const filePath = path.join(projectPath, LAST_HEAD_FILE);
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return null;
  }
}

/**
 * Write the current HEAD to the dispatch tracking file.
 */
export function writeLastHead(projectPath: string, head: string): void {
  const resolved = path.resolve(projectPath);
  const filePath = path.join(resolved, LAST_HEAD_FILE);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  // harness-ignore SEC-PTH-001: filePath is path.join(resolved, constant); concatenation is file content, not path
  fs.writeFileSync(filePath, head + '\n', 'utf8');
}

/**
 * Check if the HEAD has changed since last dispatch.
 * Returns the current HEAD if changed, null if unchanged or not available.
 */
export function detectHeadDelta(projectPath: string): string | null {
  const currentHead = getCurrentHead(projectPath);
  if (!currentHead) return null;

  const lastHead = readLastHead(projectPath);
  if (lastHead === null) {
    // First run — write HEAD but don't dispatch (no baseline to compare)
    writeLastHead(projectPath, currentHead);
    return null;
  }

  if (currentHead === lastHead) return null;
  return currentHead;
}

export interface SessionDispatchResult {
  dispatched: boolean;
  result?: DispatchResult;
  currentHead?: string;
}

/**
 * Run session-start dispatch if HEAD has changed.
 *
 * Returns the dispatch result if new recommendations were generated,
 * or { dispatched: false } if HEAD hasn't changed.
 *
 * Always uses cached health snapshot for speed.
 */
export async function sessionStartDispatch(projectPath: string): Promise<SessionDispatchResult> {
  const currentHead = detectHeadDelta(projectPath);
  if (!currentHead) {
    return { dispatched: false };
  }

  try {
    const result = await dispatchSkillsFromGit(projectPath, {});
    writeLastHead(projectPath, currentHead);
    return { dispatched: true, result, currentHead };
  } catch {
    // Non-fatal — write HEAD to avoid retrying next time
    writeLastHead(projectPath, currentHead);
    return { dispatched: false };
  }
}

/**
 * Format a session dispatch result as a human-readable advisory banner.
 */
export function formatDispatchBanner(result: SessionDispatchResult): string | null {
  if (!result.dispatched || !result.result || result.result.skills.length === 0) {
    return null;
  }

  const { context, skills } = result.result;
  const lines = [
    `Skill dispatch (${context.changeType} change, ${context.domains.length} domain(s)):`,
  ];

  for (const skill of skills.slice(0, 3)) {
    const parallel = skill.parallelSafe ? ' [parallel-safe]' : '';
    lines.push(
      `  ${skill.urgency === 'critical' ? '!' : '-'} ${skill.name} (${skill.estimatedImpact} impact)${parallel}`
    );
  }

  if (skills.length > 3) {
    lines.push(`  ... and ${skills.length - 3} more`);
  }

  return lines.join('\n');
}
