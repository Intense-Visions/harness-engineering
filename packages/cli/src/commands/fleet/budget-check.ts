import { evaluateSpendEnvelope } from '@harness-engineering/core';
import type {
  ObservedSpend,
  SpendEnvelope,
  SpendEnvelopeVerdict,
} from '@harness-engineering/types';
import { human, readSummary, refresh, resolvePaths, type Summary } from '@harness-engineering/burn';
import chalk from 'chalk';
import { Command } from 'commander';

/**
 * Exit code for an EXHAUSTED verdict. Distinct from the generic 1/2 error codes
 * so a fleet skill/agent can branch on "budget spent" without confusing it with
 * a command error. `within` and `unconfigured` both exit 0.
 */
export const BUDGET_EXHAUSTED_EXIT_CODE = 10;

export interface BudgetCheckOptions {
  /** Global spend envelope for the period, in burn units. Omit ⇒ unconfigured no-op. */
  envelope?: string;
  /** Fleet key (matches burn's invoking-skill attribution, e.g. `roadmap-fleet`). */
  fleet?: string;
  /** Per-fleet sub-allocation for `--fleet`, in burn units. */
  fleetEnvelope?: string;
  /** Emit the verdict as JSON instead of a human line. */
  json?: boolean;
  /** Skip the burn rescan (use the cached summary as-is). */
  noRefresh?: boolean;
}

function parseUnits(arg: string | undefined): number | undefined {
  if (arg === undefined) return undefined;
  const a = arg.trim().toLowerCase();
  const value = Number.parseFloat(a);
  if (!Number.isFinite(value)) return undefined;
  if (a.endsWith('b')) return value * 1e9;
  if (a.endsWith('m')) return value * 1e6;
  if (a.endsWith('k')) return value * 1e3;
  return value;
}

/**
 * Read observed spend from burn's existing per-fleet/per-lane attribution (#1270)
 * — never a new measurement pipeline. Global spend is the week-to-date units;
 * per-fleet spend is burn's per-skill units block, keyed by the fleet's invoking
 * skill (tried as the bare name and as `harness:<name>`).
 */
export function observedSpendFromSummary(
  summary: Summary | null,
  fleetKey?: string | null
): ObservedSpend {
  if (!summary) return { global: 0 };
  const global = summary.wtd?.units ?? 0;
  if (!fleetKey) return { global };
  const skills = summary.skills ?? {};
  const block =
    skills[fleetKey] ?? skills[`harness:${fleetKey}`] ?? skills[fleetKey.replace(/^harness:/, '')];
  const fleetUnits = block?.units ?? 0;
  return { global, perFleet: { [fleetKey]: fleetUnits } };
}

/** Resolve the spend envelope from flags. Absent global cap ⇒ unconfigured (no-op). */
export function envelopeFromOptions(opts: BudgetCheckOptions): SpendEnvelope | undefined {
  const envelopeTokens = parseUnits(opts.envelope);
  if (envelopeTokens === undefined) return undefined;
  const envelope: SpendEnvelope = { envelopeTokens };
  const fleetEnvelope = parseUnits(opts.fleetEnvelope);
  if (opts.fleet && fleetEnvelope !== undefined) {
    envelope.perFleet = { [opts.fleet]: fleetEnvelope };
  }
  return envelope;
}

/**
 * The dollar-cost overlay for the budget signal (Refs #1525). Derived from the
 * burn summary's {@link Summary.cost} block — itself reconciled from #1522's
 * `cost_price_table` — so tokens stay the source of truth and the `$` figure is
 * purely derived. Absent whenever no price table is configured (no-op).
 */
export interface BudgetCostOverlay {
  /** Accrued current-week spend in USD (from the summary's reconciled figure). */
  spent_usd: number;
  /** Remaining headroom in USD; `null` unless the verdict is `within`. */
  remaining_usd: number | null;
  /** The envelope in USD; `null` when unconfigured (no envelope to convert). */
  envelope_usd: number | null;
  /** Observed `$`/unit rate (`usd_wtd / wtd.units`, `0` when no units yet). */
  per_unit_usd: number;
  /** Distinct current-week models that had a price-table entry. */
  models_priced: number;
  /** Distinct current-week models seen (priced + unpriced). */
  models_total: number;
}

/**
 * Build the dollar-cost overlay from the burn summary and the units-based verdict.
 * Returns `null` when the summary carries no `cost` block (no price table
 * configured) — the caller then emits the bare, byte-identical verdict.
 *
 * The envelope is denominated in burn units, so remaining/envelope dollars are
 * derived from the week's own observed `$`/unit rate (`usd_wtd / wtd.units`) —
 * the faithful, model-mix-aware conversion, guarded against a zero-unit week.
 */
export function costOverlayFromSummary(
  summary: Summary | null,
  verdict: SpendEnvelopeVerdict
): BudgetCostOverlay | null {
  const cost = summary?.cost;
  if (!cost) return null;
  const wtdUnits = summary?.wtd?.units ?? 0;
  const perUnit = wtdUnits > 0 ? cost.usd_wtd / wtdUnits : 0;
  const envelopeTokens = verdict.status === 'unconfigured' ? null : verdict.envelopeTokens;
  const remainingUsd = verdict.status === 'within' ? verdict.remainingTokens * perUnit : null;
  return {
    spent_usd: cost.usd_wtd,
    remaining_usd: remainingUsd,
    envelope_usd: envelopeTokens === null ? null : envelopeTokens * perUnit,
    per_unit_usd: perUnit,
    models_priced: cost.models_priced,
    models_total: cost.models_total,
  };
}

/** The dim `$` suffix appended to the human verdict line when an overlay exists. */
function renderCostSuffix(overlay: BudgetCostOverlay): string {
  const parts = [`~$${overlay.spent_usd.toFixed(2)} spent`];
  if (overlay.remaining_usd !== null && overlay.envelope_usd !== null) {
    parts.push(
      `~$${overlay.remaining_usd.toFixed(2)} of ~$${overlay.envelope_usd.toFixed(2)} remaining`
    );
  } else if (overlay.envelope_usd !== null) {
    parts.push(`envelope ~$${overlay.envelope_usd.toFixed(2)}`);
  }
  let suffix = ` ${chalk.cyan(`(${parts.join(', ')})`)}`;
  if (overlay.models_priced < overlay.models_total) {
    suffix += chalk.dim(` partial: ${overlay.models_priced}/${overlay.models_total} models priced`);
  }
  return suffix;
}

function renderHuman(verdict: SpendEnvelopeVerdict): string {
  switch (verdict.status) {
    case 'unconfigured':
      return chalk.dim('unconfigured — no spend envelope set; dispatch is unbounded (no-op).');
    case 'within':
      return chalk.green(
        `within — ${human(verdict.spentTokens)} of ${human(verdict.envelopeTokens)} spent, ` +
          `${human(verdict.remainingTokens)} remaining. Safe to dispatch the next lane.`
      );
    case 'exhausted':
      return chalk.red(`exhausted — ${verdict.reason}`);
  }
}

/**
 * The concrete DISPATCH-time callable the fleet-family / `fleet-command` skill
 * invokes before scheduling each lane (#1600). It compares burn-observed spend
 * against the configured envelope via the SAME `evaluateSpendEnvelope` primitive
 * the orchestrator engine's `budget-governor` delegates to — one implementation,
 * two governed paths.
 *
 * Returns the exit code: {@link BUDGET_EXHAUSTED_EXIT_CODE} when exhausted, 0
 * otherwise.
 */
export function runBudgetCheck(opts: BudgetCheckOptions): number {
  const envelope = envelopeFromOptions(opts);
  const fleetKey = opts.fleet ?? null;

  const paths = resolvePaths();
  if (!opts.noRefresh) {
    try {
      refresh(paths);
    } catch {
      // A failed rescan must not fake a green: fall through to the cached
      // summary (or the zero-spend floor), and let the verdict speak.
    }
  }
  const summary = readSummary(paths);
  const observed = observedSpendFromSummary(summary, fleetKey);

  const verdict = evaluateSpendEnvelope(observed, envelope, fleetKey);

  // Reconcile accrued token spend to dollars when the adopter configured a price
  // table (Refs #1525); byte-identical output when they did not.
  const overlay = costOverlayFromSummary(summary, verdict);

  if (opts.json) {
    console.log(JSON.stringify(overlay ? { ...verdict, cost: overlay } : verdict));
  } else {
    console.log(renderHuman(verdict) + (overlay ? renderCostSuffix(overlay) : ''));
  }

  return verdict.status === 'exhausted' ? BUDGET_EXHAUSTED_EXIT_CODE : 0;
}

export function createBudgetCheckCommand(): Command {
  return new Command('budget-check')
    .description(
      'Consult the fleet spend envelope at DISPATCH (#1600): compare burn-observed spend ' +
        'against the envelope and report within | exhausted | unconfigured. When a burn ' +
        'cost_price_table is configured, also surfaces the spend/remaining in dollars (Refs #1525).'
    )
    .option(
      '--envelope <units>',
      'global spend envelope for the period, in burn units (250M, 1.2B)'
    )
    .option('--fleet <name>', "fleet key (matches burn's invoking-skill, e.g. roadmap-fleet)")
    .option('--fleet-envelope <units>', 'per-fleet sub-allocation for --fleet, in burn units')
    .option('--json', 'emit the verdict as JSON')
    .option('--no-refresh', 'use the cached burn summary without rescanning')
    .action((opts: BudgetCheckOptions & { refresh?: boolean }, cmd: Command) => {
      // `--json` is also a GLOBAL option on the root program, so merge globals in
      // (a bare `harness --json fleet budget-check` sets it on the parent).
      // Commander maps `--no-refresh` to `refresh: false`; normalize to noRefresh.
      const globals = cmd.optsWithGlobals() as BudgetCheckOptions;
      process.exitCode = runBudgetCheck({
        ...opts,
        json: Boolean(opts.json ?? globals.json),
        noRefresh: opts.refresh === false,
      });
    });
}
