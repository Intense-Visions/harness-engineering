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

/** What a human needs to settle the fork: the blockers, and the positions from `concerns`. */
export interface HumanDecision {
  blockers: string[];
  concerns: string[];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function parseHandoff(raw: string): { blockers: string[]; concerns: string[] } {
  try {
    const parsed = JSON.parse(raw) as { blockers?: unknown; concerns?: unknown } | null;
    return { blockers: strings(parsed?.blockers), concerns: strings(parsed?.concerns) };
  } catch {
    return { blockers: [], concerns: [] };
  }
}

function subdirHandoffs(fs: HandoffFs, dir: string): string[] {
  try {
    return fs
      .readdir(dir)
      .sort()
      .map((name) => join(dir, name, 'handoff.json'));
  } catch {
    return [];
  }
}

/**
 * The human-decision blockers ({@link HUMAN_DECISION_PREFIXES}) a dispatched
 * agent left in its handoffs, plus that handoff's `concerns` (where the protocol
 * puts the options and both positions). Every state dir a handoff can resolve to
 * is scanned: `.harness/sessions/<slug>/`, `.harness/streams/<name>/` and the
 * global `.harness/`.
 *
 * A headless agent whose blind audit disagreed with its recommendation, or that
 * could not audit a judgment fork, must not choose (Pause Protocol): it writes
 * the blocker and stops. The orchestrator has no parent session to resolve it,
 * so it routes the run to needs-human instead of shipping the run or
 * re-dispatching it. Handoffs older than `sinceMs` (this dispatch's start) are
 * ignored, so a handoff left by an earlier attempt in a reused worktree does not
 * re-fire. Unreadable or malformed handoffs yield nothing: this scan adds an
 * escalation, it never blocks a run on its own.
 */
export function readHumanDecisionBlockers(
  workspacePath: string,
  sinceMs: number,
  fs: HandoffFs = nodeFs
): HumanDecision {
  const harness = join(workspacePath, '.harness');
  const files = [
    ...subdirHandoffs(fs, join(harness, 'sessions')),
    ...subdirHandoffs(fs, join(harness, 'streams')),
    join(harness, 'handoff.json'),
  ];
  const found: HumanDecision = { blockers: [], concerns: [] };
  for (const file of files) {
    let handoff: { blockers: string[]; concerns: string[] };
    try {
      if (fs.mtimeMs(file) < sinceMs) continue;
      handoff = parseHandoff(fs.readFile(file));
    } catch {
      continue; // No handoff here.
    }
    const blockers = handoff.blockers.filter((b) =>
      HUMAN_DECISION_PREFIXES.some((p) => b.startsWith(p))
    );
    if (blockers.length === 0) continue;
    found.blockers.push(...blockers);
    found.concerns.push(...handoff.concerns);
  }
  return found;
}
