import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Handoff blocker prefixes the Pause Protocol writes for a decision only a human
 * (or an auditing parent session) can make: a headless audit disagreement, and a
 * judgment fork a dispatched agent could not audit itself.
 */
export const HUMAN_DECISION_PREFIXES = ['audit-disagreement:', 'judgment-fork:'] as const;

/** Injectable fs seam so the scan is testable without a real worktree. */
export interface HandoffFs {
  readdir(dir: string): string[];
  readFile(file: string): string;
  mtimeMs(file: string): number;
}

const nodeFs: HandoffFs = {
  readdir: (dir) => readdirSync(dir),
  readFile: (file) => readFileSync(file, 'utf-8'),
  mtimeMs: (file) => statSync(file).mtimeMs,
};

function blockersOf(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    const blockers = (parsed as { blockers?: unknown } | null)?.blockers;
    return Array.isArray(blockers)
      ? blockers.filter((b): b is string => typeof b === 'string')
      : [];
  } catch {
    return [];
  }
}

/**
 * The human-decision blockers ({@link HUMAN_DECISION_PREFIXES}) a dispatched
 * agent left in its session handoffs (`<workspace>/.harness/sessions/<slug>/handoff.json`).
 *
 * A headless agent whose blind audit disagreed with its recommendation, or that
 * could not audit a judgment fork, must not choose (Pause Protocol): it writes
 * the blocker and stops. The orchestrator has no parent session to resolve it,
 * so it routes the run to needs-human instead of
 * shipping the run or re-dispatching it. Handoffs older than `sinceMs` (the
 * dispatch start) are ignored, so a handoff left by an earlier attempt in a
 * reused worktree never re-fires. Unreadable or malformed handoffs yield
 * nothing: this scan adds an escalation, it never blocks a run on its own.
 */
export function readHumanDecisionBlockers(
  workspacePath: string,
  sinceMs: number,
  fs: HandoffFs = nodeFs
): string[] {
  const sessionsDir = join(workspacePath, '.harness', 'sessions');
  let slugs: string[];
  try {
    slugs = fs.readdir(sessionsDir);
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const slug of slugs.sort()) {
    const handoff = join(sessionsDir, slug, 'handoff.json');
    try {
      if (fs.mtimeMs(handoff) < sinceMs) continue;
      for (const blocker of blockersOf(fs.readFile(handoff))) {
        if (HUMAN_DECISION_PREFIXES.some((p) => blocker.startsWith(p))) found.push(blocker);
      }
    } catch {
      // No handoff in this session dir.
    }
  }
  return found;
}
