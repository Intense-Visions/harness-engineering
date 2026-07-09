import type { RollbackDecision } from '@harness-engineering/core';

export const ROLLBACK_LABEL = 'harness:rollback';

/** Injected gh seam for the composer (real impl shells `gh` in the command). */
export interface ComposeGhSeam {
  /** PR number of an OPEN revert PR labeled ROLLBACK_LABEL for `targetPr`, else null. */
  findOpenRevertPr(targetPr: number, label: string): Promise<number | null>;
  /** URL of that existing open revert PR, else null. */
  findOpenRevertPrUrl(targetPr: number, label: string): Promise<string | null>;
  /** Open the revert PR; returns its URL. */
  openPr(args: { title: string; body: string; label: string; targetPr: number }): Promise<string>;
}

export interface ComposeOptions {
  gh: ComposeGhSeam;
  dryRun?: boolean;
  print?: (line: string) => void;
  /** Human-readable reason (from `--reason`), rendered into the PR body (#4). */
  reason?: string;
}

export interface ComposeResult {
  action: RollbackDecision['action'];
  prUrl?: string;
}

/** Full-context revert PR body (SC3): trigger, target, blast-radius, warnings, reasons. */
export function buildRevertBody(
  d: RollbackDecision,
  originalTitle: string,
  reason?: string
): string {
  const lines: (string | undefined)[] = [
    `## Automated rollback proposal`,
    ``,
    `**Trigger:** ${d.trigger}`,
    `**Target PR:** #${d.targetPr} — ${originalTitle}`,
    `**Revert-ready:** ${d.revertReady}`,
    d.blastRadius !== undefined ? `**Blast radius:** ${d.blastRadius}` : undefined,
    // #4: surface the human-provided --reason when present (help text promises it).
    reason && reason.trim() !== '' ? `**Reason:** ${reason.trim()}` : undefined,
    ``,
    `### Classification`,
    ...d.reasons.map((r) => `- ${r}`),
  ];
  if (d.migrationWarnings.length > 0) {
    lines.push(
      ``,
      `### Migration / irreversibility warnings`,
      ...d.migrationWarnings.map((w) => `- ${w}`)
    );
  }
  if (d.dependentMerges.length > 0) {
    lines.push(
      ``,
      `### Dependent later merges`,
      `- ${d.dependentMerges.map((n) => `#${n}`).join(', ')}`
    );
  }
  return lines.filter((l): l is string => l !== undefined).join('\n');
}

/**
 * Compose (or dry-run) the revert PR. Only revert-ready decisions compose; the
 * ROLLBACK_LABEL makes re-runs idempotent (skip if an open revert PR exists).
 */
export async function composeRevertPr(
  decision: RollbackDecision,
  originalTitle: string,
  opts: ComposeOptions
): Promise<ComposeResult> {
  if (!decision.revertReady) return { action: decision.action };

  const body = buildRevertBody(decision, originalTitle, opts.reason);

  if (opts.dryRun) {
    const print = opts.print ?? ((s: string) => process.stdout.write(`${s}\n`));
    print(body);
    return { action: 'proposed' };
  }

  const existingUrl = await opts.gh.findOpenRevertPrUrl(decision.targetPr, ROLLBACK_LABEL);
  const existing = await opts.gh.findOpenRevertPr(decision.targetPr, ROLLBACK_LABEL);
  if (existing !== null) {
    return { action: 'skipped', ...(existingUrl ? { prUrl: existingUrl } : {}) };
  }

  const prUrl = await opts.gh.openPr({
    title: `revert: ${originalTitle} (automated rollback)`,
    body,
    label: ROLLBACK_LABEL,
    targetPr: decision.targetPr,
  });
  return { action: 'proposed', prUrl };
}
