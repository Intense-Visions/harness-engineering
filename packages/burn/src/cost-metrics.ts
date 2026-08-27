import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { atomicWrite } from './store';
import type { CostReport } from './cost-per-pr';

/**
 * The repo-local metrics file the cost report is published to.
 *
 * This is `.harness/metrics/` under the project root — the same tree as
 * `adoption.jsonl` and `skill-events.jsonl` — NOT the HUD state dir (which is
 * per-machine under `~/.claude/hud`). Cost-per-PR is a property of a repo's
 * fleet runs, so it lives with the repo, and a fleet lane can commit it.
 */
export function costMetricsPath(repoRoot: string): string {
  return path.join(repoRoot, '.harness', 'metrics', 'cost-per-pr.json');
}

/** Publish the cost report atomically; the reader must never see a half file. */
export function writeCostReport(repoRoot: string, report: CostReport): string {
  const target = costMetricsPath(repoRoot);
  mkdirSync(path.dirname(target), { recursive: true });
  atomicWrite(target, `${JSON.stringify(report, null, 2)}\n`);
  return target;
}
