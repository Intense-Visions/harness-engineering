import type { RollbackDecision } from '@harness-engineering/core';

export const ROLLBACK_LABEL = 'harness:rollback';

/** Injected gh seam for the composer (real impl shells `gh` in the command). */
export interface ComposeGhSeam {
  /**
   * The OPEN revert PR labeled ROLLBACK_LABEL for `targetPr` (number + url), or
   * null when none exists. A single lookup drives the idempotency skip — the
   * real seam runs `gh pr list` once instead of twice (Phase-2 review polish).
   */
  findOpenRevertPr(
    targetPr: number,
    label: string
  ): Promise<{ number: number; url: string } | null>;
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

  const existing = await opts.gh.findOpenRevertPr(decision.targetPr, ROLLBACK_LABEL);
  if (existing !== null) {
    return { action: 'skipped', ...(existing.url ? { prUrl: existing.url } : {}) };
  }

  const prUrl = await opts.gh.openPr({
    title: `revert: ${originalTitle} (automated rollback)`,
    body,
    label: ROLLBACK_LABEL,
    targetPr: decision.targetPr,
  });
  return { action: 'proposed', prUrl };
}
