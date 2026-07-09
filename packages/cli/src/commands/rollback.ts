import { classifyRevert } from '@harness-engineering/core';
import type { RollbackDecision, RollbackIO } from '@harness-engineering/core';
import { composeRevertPr, type ComposeGhSeam } from '../rollback/compose';
import { appendRollbackEvent } from '../rollback/breadcrumb';

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
