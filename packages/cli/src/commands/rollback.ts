import { execFileSync } from 'node:child_process';
import { Command, Option, InvalidArgumentError } from 'commander';
import { classifyRevert } from '@harness-engineering/core';
import type { RollbackDecision, RollbackIO } from '@harness-engineering/core';
import { composeRevertPr, ROLLBACK_LABEL, type ComposeGhSeam } from '../rollback/compose';
import { appendRollbackEvent, linkRollbackEventToGraph } from '../rollback/breadcrumb';
import { createNodeRollbackIO } from '../rollback/io';
import {
  runRollbackSweep,
  createTimelineReader,
  createPrResolver,
  type SweepSignalRule,
  type SweepSignalReport,
} from '../rollback/sweep';
import { resolveConfig } from '../config/loader';
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
    ...(args.reason !== undefined ? { reason: args.reason } : {}),
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
      // #4: record the human-provided reason on the breadcrumb (help text promises it).
      ...(args.reason !== undefined ? { reason: args.reason } : {}),
    },
    deps.root !== undefined ? { root: deps.root } : {}
  );

  return finalDecision;
}

/** Trimmed stdout of `gh <args>` (no shell). */
const gh = (args: string[]): string => execFileSync('gh', args, { encoding: 'utf-8' }).toString();

/**
 * Whether `text` references PR number `targetPr` on a non-digit boundary
 * (finding #2). A bare `includes('#' + targetPr)` collides with longer numbers
 * that share the prefix (evaluating PR 42 would match a body referencing 420,
 * 421, or 4200). This anchors on the number NOT preceded or followed by another
 * digit, so 42 never matches 420. The composer also writes a structured
 * `Target PR: <n>` marker line, which this reliably matches.
 */
export function referencesTargetPr(text: string | undefined, targetPr: number): boolean {
  if (!text) return false;
  return new RegExp(`(?<!\\d)#${targetPr}(?!\\d)`).test(text);
}

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
    // finding #2: non-digit-boundary match so PR 42 does NOT match a revert PR
    // whose body references 420, 421, or 4200.
    const match = list.find(
      (p) => referencesTargetPr(p.body, targetPr) || referencesTargetPr(p.title, targetPr)
    );
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
      return findOpenRevertPrNode(targetPr);
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
 * One-line, human-readable summary of a single signal's sweep outcome (finding
 * S4). Non-crossings render "no crossing"; crossings list each forwarded PR and
 * its resulting action (and prUrl when a revert was proposed), so the hourly
 * Actions log shows exactly what the breaker did.
 */
export function summarizeSweepReport(r: SweepSignalReport): string {
  if (!r.crossed) {
    return `rollback sweep: ${r.signal} (${r.window}) — no crossing`;
  }
  if (r.forwarded.length === 0) {
    return `rollback sweep: ${r.signal} (${r.window}) — crossed, no PRs in window`;
  }
  const parts = r.forwarded.map((f) => `#${f.pr} → ${f.action}${f.prUrl ? ` (${f.prUrl})` : ''}`);
  return `rollback sweep: ${r.signal} (${r.window}) — crossed; forwarded ${parts.join(', ')}`;
}

/** Injectable seams for the sweep command action (finding I2/S4 testability). */
export interface RollbackSweepCommandDeps {
  resolveConfig: typeof resolveConfig;
  runSweep: typeof runRollbackSweep;
  makeReader: (root: string) => ReturnType<typeof createTimelineReader>;
  makeResolver: () => ReturnType<typeof createPrResolver>;
  evaluate: (pr: number) => Promise<RollbackDecision>;
  root: string;
  /** stdout observability line (finding S4). */
  info: (line: string) => void;
  /** stderr disarm warning (finding I2). */
  warn: (line: string) => void;
}

/**
 * `harness rollback sweep` core, over injected seams. On a config error it warns
 * (stderr) that the breaker is inactive — never silently disarming (finding I2)
 * — and still returns normally (exit 0). For each configured signal it emits a
 * per-signal summary line (finding S4).
 */
export async function runRollbackSweepCommand(deps: RollbackSweepCommandDeps): Promise<void> {
  const cfg = deps.resolveConfig();
  if (!cfg.ok) {
    deps.warn(`rollback sweep: config error, breaker inactive: ${cfg.error.message}`);
  }
  const signals: Record<string, SweepSignalRule> = cfg.ok
    ? (cfg.value.rollback?.signals ?? {})
    : {};
  await deps.runSweep(signals, {
    readTimeline: deps.makeReader(deps.root),
    resolveMergedPrs: deps.makeResolver(),
    evaluate: deps.evaluate,
    report: (r) => deps.info(summarizeSweepReport(r)),
  });
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
    .requiredOption('--pr <n>', 'target merged PR number', (v) => {
      const n = Number.parseInt(v, 10);
      if (Number.isNaN(n)) throw new InvalidArgumentError('--pr must be a number');
      return n;
    })
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

  rollback
    .command('sweep')
    .description(
      'Read the signal timeline and propose reverts for threshold crossings (signal arm)'
    )
    .action(async () => {
      await runRollbackSweepCommand({
        resolveConfig,
        runSweep: runRollbackSweep,
        makeReader: createTimelineReader,
        makeResolver: createPrResolver,
        evaluate: (pr) =>
          runRollbackEvaluate(
            { pr, trigger: 'signal' },
            { io: createNodeRollbackIO(), gh: createGhSeam() }
          ),
        root: process.cwd(),
        // #S4: per-signal summary on stdout so the sweep's work is auditable.
        info: (line) => logger.info(line),
        // #I2: config error → disarm warning on stderr, never silent.
        warn: (line) => logger.error(line),
      });
    });
  return rollback;
}
