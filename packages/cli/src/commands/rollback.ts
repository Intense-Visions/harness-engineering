import { execFileSync } from 'node:child_process';
import { Command, Option } from 'commander';
import { classifyRevert } from '@harness-engineering/core';
import type { RollbackDecision, RollbackIO } from '@harness-engineering/core';
import { composeRevertPr, ROLLBACK_LABEL, type ComposeGhSeam } from '../rollback/compose';
import { appendRollbackEvent, linkRollbackEventToGraph } from '../rollback/breadcrumb';
import { createNodeRollbackIO } from '../rollback/io';
import { logger } from '../output/logger';

export interface RollbackEvaluateArgs {
  pr: number;
  trigger?: 'signal' | 'eval';
  reason?: string;
  dryRun?: boolean;
}

export interface RollbackEvaluateDeps {
  io: RollbackIO;
  gh: ComposeGhSeam;
  root?: string;
  print?: (line: string) => void;
}

/** resolve → classify → compose → breadcrumb, all over injected seams (testable). */
export async function runRollbackEvaluate(
  args: RollbackEvaluateArgs,
  deps: RollbackEvaluateDeps
): Promise<RollbackDecision> {
  const trigger = args.trigger ?? 'signal';
  const target = await deps.io.resolveTarget(args.pr);
  const laterMerges = await deps.io.listLaterMerges(args.pr);

  const decision = await classifyRevert(
    {
      targetPr: args.pr,
      trigger,
      mergeSha: target.mergeSha,
      changedFiles: target.changedFiles,
      laterMerges,
    },
    deps.io
  );

  const composed = await composeRevertPr(decision, target.title, {
    gh: deps.gh,
    ...(args.dryRun ? { dryRun: true } : {}),
    ...(deps.print ? { print: deps.print } : {}),
  });

  // Composer may downgrade proposed->skipped (idempotent existing PR); reflect it.
  const finalDecision: RollbackDecision = {
    ...decision,
    action: composed.action,
    ...(composed.prUrl ? { prUrl: composed.prUrl } : {}),
  };

  await appendRollbackEvent(
    {
      targetPr: finalDecision.targetPr,
      trigger: finalDecision.trigger,
      revertReady: finalDecision.revertReady,
      action: finalDecision.action,
      ...(finalDecision.prUrl ? { prUrl: finalDecision.prUrl } : {}),
    },
    deps.root !== undefined ? { root: deps.root } : {}
  );

  return finalDecision;
}

/** Trimmed stdout of `gh <args>` (no shell). */
const gh = (args: string[]): string => execFileSync('gh', args, { encoding: 'utf-8' }).toString();

/** A pre-existing OPEN revert PR labeled ROLLBACK_LABEL that references `targetPr`. */
function findOpenRevertPrNode(targetPr: number): { number: number; url: string } | null {
  try {
    const raw = gh([
      'pr',
      'list',
      '--state',
      'open',
      '--label',
      ROLLBACK_LABEL,
      '--search',
      `#${targetPr}`,
      '--json',
      'number,url,body,title',
    ]);
    const list = JSON.parse(raw) as {
      number: number;
      url: string;
      body: string;
      title: string;
    }[];
    const ref = `#${targetPr}`;
    const match = list.find((p) => p.body?.includes(ref) || p.title?.includes(ref));
    return match ? { number: match.number, url: match.url } : null;
  } catch {
    return null; // gh unavailable / no match — treat as "no existing PR"
  }
}

/**
 * Real gh seam for the composer. Untested-by-design (thin process shim); all
 * branching lives in the tested `composeRevertPr`. `openPr` shells `gh pr create`
 * with the body on stdin (`--body-file -`) so long bodies never hit the arg limit.
 */
export function createGhSeam(): ComposeGhSeam {
  return {
    async findOpenRevertPr(targetPr) {
      return findOpenRevertPrNode(targetPr)?.number ?? null;
    },
    async findOpenRevertPrUrl(targetPr) {
      return findOpenRevertPrNode(targetPr)?.url ?? null;
    },
    async openPr({ title, body, label }) {
      return execFileSync(
        'gh',
        ['pr', 'create', '--title', title, '--body-file', '-', '--label', label],
        { input: body, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      )
        .toString()
        .trim();
    },
  };
}

/**
 * `harness rollback evaluate` — classify a merged PR for revert-readiness and, if
 * ready, propose a full-context revert PR (or print its body under `--dry-run`).
 * All verdicts (proposed/skipped/blocked) exit 0 — they are legitimate outcomes.
 */
export function createRollbackCommand(): Command {
  const rollback = new Command('rollback').description(
    'Post-ship revert circuit breaker (propose-only in v1)'
  );
  rollback
    .command('evaluate')
    .description('Classify a merged PR for revert-readiness and, if ready, propose a revert PR')
    .requiredOption('--pr <n>', 'target merged PR number', (v) => Number.parseInt(v, 10))
    .addOption(
      new Option('--trigger <trigger>', 'what fired this evaluation')
        .choices(['signal', 'eval'])
        .default('signal')
    )
    .option('--reason <str>', 'human-readable reason recorded on the proposal')
    .option('--dry-run', 'print the revert PR body without opening a PR', false)
    .action(async (opts: Record<string, unknown>) => {
      const reason = opts.reason as string | undefined;
      const dryRun = opts.dryRun as boolean | undefined;
      const decision = await runRollbackEvaluate(
        {
          pr: opts.pr as number,
          trigger: opts.trigger as 'signal' | 'eval',
          ...(reason !== undefined ? { reason } : {}),
          ...(dryRun !== undefined ? { dryRun } : {}),
        },
        { io: createNodeRollbackIO(), gh: createGhSeam() }
      );
      // Best-effort graph link (never blocks the verdict).
      await linkRollbackEventToGraph({
        targetPr: decision.targetPr,
        trigger: decision.trigger,
        revertReady: decision.revertReady,
        action: decision.action,
        ...(decision.prUrl ? { prUrl: decision.prUrl } : {}),
      });
      logger.info(JSON.stringify(decision, null, 2));
      // Non-proposed verdicts are legitimate outcomes, not failures — exit 0.
    });
  return rollback;
}
