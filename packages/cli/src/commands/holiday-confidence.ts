// packages/cli/src/commands/holiday-confidence.ts
//
// `harness holiday-confidence` — the composed "if the senior disappears for two
// weeks, what holds?" KPI. Reports the % of merged PRs in a rolling window that
// cleared all four unwatched-safety gates (multi-persona review fired, outcome-eval
// did not fail, no baseline auto-update, no curated signal in breach).
//
// The computation lives in `@harness-engineering/signals` (computeHolidayConfidence)
// and reuses the existing signal authorities; this command only resolves the project
// path, wires the real graph store + signal gatherer, and renders.
import { Command } from 'commander';
import {
  computeHolidayConfidence,
  gatherSignals,
  type HolidayConfidenceResult,
  type OutcomeQueryStore,
} from '@harness-engineering/signals';
import { logger } from '../output/logger';

interface HolidayConfidenceOptions {
  window?: string;
  path?: string;
  json?: boolean;
}

/** Best-effort graph load for the per-PR outcome-eval linkage; never throws. */
async function loadOutcomeStore(projectPath: string): Promise<OutcomeQueryStore | undefined> {
  try {
    const { GraphStore, resolveGraphDir } = await import('@harness-engineering/graph');
    const store = new GraphStore();
    const loaded = await store.load(resolveGraphDir(projectPath));
    return loaded ? (store as unknown as OutcomeQueryStore) : undefined;
  } catch {
    return undefined;
  }
}

function parseWindow(raw: string | undefined): number {
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 30;
}

function renderPretty(r: HolidayConfidenceResult): void {
  const pct = r.value === null ? 'n/a' : `${r.value}%`;
  logger.info(`Holiday Confidence: ${pct} (${r.status.toUpperCase()})`);
  logger.info(
    `Window: last ${r.windowDays} days · ${r.confidentPrs}/${r.mergedPrs} merged PRs confident\n`
  );
  const c = r.criteria;
  console.log(`  (a) multi-persona review fired : ${c.reviewFired.passed}/${c.reviewFired.total}`);
  console.log(
    `  (b) outcome-eval passed        : ${c.outcomeEvalPassed.passed}/${c.outcomeEvalPassed.total}` +
      (c.outcomeEvalPassed.degraded ? ' (degraded: no outcome data)' : '')
  );
  console.log(
    `  (c) no baseline auto-update    : ${c.noBaselineAutoUpdate.held ? 'held' : 'BREACHED'}` +
      (c.noBaselineAutoUpdate.count !== null ? ` (count=${c.noBaselineAutoUpdate.count})` : '')
  );
  console.log(
    `  (d) no signal in breach        : ${c.noSignalBreach.held ? 'held' : `BREACHED (${c.noSignalBreach.breached.join(', ')})`}`
  );
  console.log(`\n${r.detail}`);
  if (r.notes.length > 0) {
    console.log('\nNotes:');
    for (const n of r.notes) console.log(`  - ${n}`);
  }
}

export function createHolidayConfidenceCommand(): Command {
  return new Command('holiday-confidence')
    .description(
      'Holiday Confidence KPI — % of merged PRs in the window that cleared review, outcome-eval, and the no-drift window gates.'
    )
    .option('--window <days>', 'Rolling window in days (default 30)')
    .option('--path <dir>', 'Project root (default: cwd)')
    .option('--json', 'Emit JSON to stdout instead of pretty text')
    .action(async (_opts: HolidayConfidenceOptions, cmd: Command) => {
      // `optsWithGlobals()`, not the action's own `opts`: the root program also
      // declares a `--json` flag (src/index.ts), and commander binds a repeated
      // flag to the FIRST command that declared it — so `harness
      // holiday-confidence --json` stores `json: true` on the PROGRAM and leaves
      // the subcommand's own `opts.json` undefined. Reading only `opts` made
      // `--json` a silent no-op: the command rendered pretty text, the weekly
      // tracker's `JSON.parse` threw, and it abstained on every single run.
      // `optsWithGlobals()` merges both stores and is the repo's existing idiom
      // for exactly this (snapshot.ts, usage.ts, scan-config.ts, create-skill.ts).
      const opts = cmd.optsWithGlobals() as HolidayConfidenceOptions;
      const projectPath = opts.path ?? process.cwd();
      const windowDays = parseWindow(opts.window);
      const graphStore = await loadOutcomeStore(projectPath);

      const result = await computeHolidayConfidence({
        projectPath,
        windowDays,
        gatherSignals,
        ...(graphStore ? { graphStore } : {}),
      });

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      renderPretty(result);
    });
}
