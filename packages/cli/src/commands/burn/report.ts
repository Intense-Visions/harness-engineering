import {
  human,
  readSummary,
  refresh,
  resolvePaths,
  type AgentBlock,
  type Summary,
} from '@harness-engineering/burn';
import chalk from 'chalk';
import { Command } from 'commander';

import { bar, localTime, pad } from './format';

/**
 * The full burn report.
 *
 * Latency does not matter here (unlike the statusline), so this favours a
 * readable report over subprocess frugality — it always rescans first.
 *
 * Composed from one function per section. Each returns its own lines (empty
 * when the section has nothing to say), so a section can be read, changed or
 * tested without holding the whole page in your head.
 */
const STYLE: Record<string, { colour: (s: string) => string; icon: string; blurb: string }> = {
  CRITICAL: { colour: chalk.red, icon: '🔴', blurb: 'over budget at this pace' },
  HOT: { colour: chalk.red, icon: '🔥', blurb: 'running hot — ease off' },
  WARM: { colour: chalk.yellow, icon: '🟠', blurb: 'above your usual pace' },
  OK: { colour: chalk.green, icon: '🟢', blurb: 'on pace' },
  EARLY: { colour: chalk.cyan, icon: '🌱', blurb: 'too early to forecast' },
  NO_BASELINE: {
    colour: chalk.yellow,
    icon: '❔',
    blurb: 'no complete weeks to compare against',
  },
  NO_DATA: {
    colour: chalk.yellow,
    icon: '⚠',
    blurb: 'NO USAGE DATA — the HUD is blind, not clear',
  },
  UNDERCOUNT: {
    colour: chalk.red,
    icon: '⁉️',
    blurb: 'records were lost and NOT fully recovered — every figure below is a FLOOR, not a total',
  },
};

function headerSection(s: Summary, tz: string): string[] {
  const hoursLeft = s.week.hours_left;
  const left =
    hoursLeft != null && hoursLeft <= 48
      ? `${Math.round(hoursLeft)}h left`
      : `${s.week.days_left.toFixed(1)}d left`;
  const style = STYLE[s.status] ?? { colour: chalk.dim, icon: '·', blurb: s.status };

  return [
    '',
    `  ${chalk.bold('Claude burn')} ${chalk.dim(
      `· week began ${localTime(s.week.start, tz, false)} · resets ${localTime(s.week.reset_at, tz)} (${left})`
    )}`,
    '',
    `  ${style.colour(`${style.icon}  ${s.status}`)} ${chalk.dim(`— ${style.blurb}`)}`,
    '',
  ];
}

function spendSection(s: Summary): string[] {
  const out = [
    `  ${pad('week to date')} ${chalk.bold(human(s.wtd.units))} units ` +
      chalk.dim(
        `(${s.wtd.requests.toLocaleString('en-US')} requests, ${human(s.wtd.output_tokens)} output tokens)`
      ),
    `  ${pad('projected at reset')} ${chalk.bold(human(s.projection.units_at_reset))} units ` +
      chalk.dim(`(forecast confidence: ${s.projection.confidence})`),
  ];

  // Be explicit that the forecast is shrunk, and show the raw extrapolation.
  // Quietly adjusting a number the user reads daily would be its own way of
  // being untrustworthy, even when the adjustment is the sound one.
  if (s.projection.method === 'shrunk-to-baseline' && s.projection.confidence !== 'high') {
    out.push(
      `  ${pad('')} ` +
        chalk.dim(
          `↳ blended toward your baseline; raw extrapolation from ` +
            `${Math.round(s.week.elapsed_frac * 100)}% of the week was ${human(s.projection.units_at_reset_linear)}`
        )
    );
  }
  if (s.baseline.median_units) {
    out.push(
      `  ${pad('your 4wk median')} ${human(s.baseline.median_units)} units` +
        (s.projection.ratio_vs_baseline
          ? chalk.dim(`  → projected ${s.projection.ratio_vs_baseline}× that`)
          : '')
    );
  }
  return out;
}

function budgetSection(s: Summary, tz: string): string[] {
  if (!s.budget.set || s.budget.pct_used == null || s.budget.pct_projected == null) {
    return [
      '',
      chalk.dim('  No weekly budget set — showing pace vs your own baseline only.'),
      chalk.dim('  Set one with: harness burn budget 1.2x   (or e.g. 250M)'),
    ];
  }

  const out = [
    '',
    `  ${pad('budget')} ${human(s.budget.units)} units`,
    `  ${pad('used')} ${bar(s.budget.pct_used / 100)} ${Math.round(s.budget.pct_used)}%`,
    `  ${pad('projected')} ${bar(s.budget.pct_projected / 100)} ${Math.round(s.budget.pct_projected)}%`,
  ];
  if (s.budget.remaining_units != null) {
    out.push(`  ${pad('remaining')} ${human(s.budget.remaining_units)} units`);
  }
  if (s.budget.exhausts_before_reset && s.budget.exhausts_at) {
    out.push(
      '',
      chalk.red(
        `  ⚠ At this pace you run dry ${localTime(s.budget.exhausts_at, tz)} — before the ${localTime(s.week.reset_at, tz)} reset.`
      )
    );
  }
  return out;
}

/**
 * Per-model. A family limit can be exhausted while the pooled bar looks OK, so
 * this is not decoration — Fable ran out at 29% of the pooled week.
 */
function modelsSection(s: Summary): string[] {
  const models = Object.entries(s.models ?? {});
  if (models.length === 0) return [];

  const out = ['', `  ${chalk.bold('by model')}`];
  for (const [name, e] of models.slice(0, 6)) {
    if (e.units < 1000) continue;
    let line = `  ${pad(name.replace(/^claude-/, ''))}${human(e.units).padStart(8)} ${chalk.dim(
      `(${Math.round(e.pct_of_week)}% of week)`
    )}`;
    if (e.pct_of_budget != null) {
      const p = e.pct_of_budget;
      const colour = p >= 100 ? chalk.red : p >= 85 ? chalk.yellow : chalk.green;
      line += `  ${colour(`${Math.round(p)}% of its own limit`)}`;
    }
    out.push(line);
  }
  for (const m of s.models_exhausted ?? []) {
    out.push(chalk.red(`  ⛔ ${m} is spent — its separate limit is at 100%.`));
  }
  return out;
}

/**
 * Per-agent. The pooled bar cannot tell you that a fleet run, not you, spent
 * the week — this is where a lane's cost becomes visible.
 *
 * Guarded exactly like `modelsSection`: a summary written before attribution
 * existed carries no `agents` key and must render without throwing. It
 * borrows that function's cosmetics but NOT its two elisions for the
 * `unattributed` row — see below.
 */
/**
 * Which labels earn a line.
 *
 * `unattributed` is exempt from the top-N cut and the unit floor. Applying
 * either would let a small — or merely seventh-ranked — unattributed bucket
 * vanish, which is precisely the "a fleet run reads as free" failure this
 * section exists to prevent. `pre-migration` takes the ordinary cut and
 * floor: it is history, not a live signal.
 */
function keptAgentLabels(s: Summary, all: [string, AgentBlock][]): Set<string> {
  const kept = new Set(
    all
      .filter(([name]) => name !== 'unattributed')
      .slice(0, 6)
      .filter(([, e]) => e.units >= 1000)
      .map(([name]) => name)
  );
  if ((s.agents?.unattributed?.units ?? 0) > 0) kept.add('unattributed');
  return kept;
}

/** What the section says about spend it could not attribute. */
function attributionCaution(s: Summary): string[] {
  const out: string[] = [];
  const unattributed = s.attribution?.unattributed_units ?? 0;
  if (s.attribution?.degraded) {
    // Every subagent unit this week lost its label. That is a broken scanner,
    // not a quiet week, and the two are indistinguishable from the numbers.
    out.push(
      '',
      chalk.red('  ⚠ ATTRIBUTION IS DEGRADED — subagent spend was seen this week and none of'),
      chalk.red('    it carried a readable agent label. The transcript shape has most likely'),
      chalk.red('    changed; read the breakdown above as unavailable, not as zero.')
    );
  } else if (unattributed > 0) {
    out.push(
      '',
      chalk.yellow(
        `  ⚠ ${human(unattributed)} units of subagent spend could not be attributed to an agent.`
      )
    );
  }
  return out;
}

function agentsSection(s: Summary): string[] {
  const all = Object.entries(s.agents ?? {});
  if (all.length === 0) return [];

  const kept = keptAgentLabels(s, all);

  const out = ['', `  ${chalk.bold('by agent')}`];
  // Iterate `all`, which summary.ts already sorted by units descending, so an
  // exempt row keeps its true rank rather than being appended at the bottom.
  for (const [name, e] of all) {
    if (!kept.has(name)) continue;
    const lanes = e.lanes > 0 ? `, ${e.lanes} lane${e.lanes === 1 ? '' : 's'}` : '';
    out.push(
      `  ${pad(name)}${human(e.units).padStart(8)} ${chalk.dim(
        `(${Math.round(e.pct_of_week)}% of week${lanes})`
      )}`
    );
  }

  out.push(...attributionCaution(s));
  return out;
}

function sessionSection(s: Summary): string[] {
  if (s.session?.pct_used == null) return [];
  return [
    '',
    `  ${pad(`session (${Math.round(s.session.window_hours)}h)`)}${bar(s.session.pct_used / 100)} ` +
      `${Math.round(s.session.pct_used)}%  ${chalk.dim(`${human(s.session.units)} units`)}`,
  ];
}

function calibrationSection(s: Summary): string[] {
  const cal = s.calibration ?? {};
  if (Object.keys(cal).length === 0) return [];

  const out = [''];
  if (cal.expired) {
    out.push(
      chalk.red(
        `  ⚠ Calibration expired ${cal.valid_until} — re-run: harness burn calibrate <pct>`
      ),
      chalk.dim('    Until then these percentages may under-warn.')
    );
  } else if (cal.days_left != null) {
    out.push(
      chalk.dim(
        `  calibrated ${(cal.at ?? '').slice(0, 10)} at ${cal.reported_pct}% · valid ${cal.days_left}d more (until ${cal.valid_until})`
      )
    );
  }
  if (cal.note) {
    out.push(chalk.dim(`    ${cal.note.slice(0, 96)}${cal.note.length > 96 ? '...' : ''}`));
  }
  return out;
}

/** Degraded tooling is a headline, not a footnote. */
function dataLossSection(s: Summary): string[] {
  if (!s.scan.data_loss_detected) return [];

  const out = [
    '',
    chalk.yellow(
      `  ⚠ record store had lost ${(s.scan.records_lost ?? 0).toLocaleString('en-US')} rows; ` +
        `recovered ${(s.scan.records_recovered ?? 0).toLocaleString('en-US')} by re-reading transcripts.`
    ),
  ];
  if ((s.scan.unrecovered ?? 0) > 0) {
    out.push(
      chalk.red(
        `    ${s.scan.unrecovered!.toLocaleString('en-US')} rows are UNRECOVERABLE (their transcripts are gone) — treat the figures above as a floor.`
      )
    );
  }
  return out;
}

/** What the numbers are and are not. Never omitted, however healthy the report. */
function footerSection(s: Summary): string[] {
  return [
    '',
    chalk.dim(
      `  window: ${s.week.reset_spec} · ${s.scan.records_total.toLocaleString('en-US')} deduped requests across ${s.scan.files_total} transcripts`
    ),
    chalk.dim('  THIS MACHINE ONLY — excludes your other devices and claude.ai.'),
    chalk.dim('  Units are a weighted proxy (out×5 + in×1 + cache_wr×1.25 + cache_rd×0.1),'),
    chalk.dim("  not Anthropic's real quota. For actual limit status run /usage."),
    '',
  ];
}

export function renderReport(s: Summary): string[] {
  const tz = s.week.tz || 'UTC';
  return [
    ...headerSection(s, tz),
    ...spendSection(s),
    ...budgetSection(s, tz),
    ...modelsSection(s),
    ...agentsSection(s),
    ...sessionSection(s),
    ...calibrationSection(s),
    ...dataLossSection(s),
    ...footerSection(s),
  ];
}

/** Rescan, then print. Returns a process exit code. */
export function printReport(): number {
  const paths = resolvePaths();
  refresh(paths);
  const summary = readSummary(paths);
  if (!summary) {
    console.log(chalk.yellow('No summary — run: harness burn scan'));
    return 1;
  }
  for (const line of renderReport(summary)) console.log(line);
  return 0;
}

export function createReportCommand(): Command {
  return new Command('report')
    .description('Rescan and print the full burn report (default)')
    .action(() => {
      process.exitCode = printReport();
    });
}
