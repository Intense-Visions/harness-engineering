import type { BurnConfig, Summary } from './types';

/**
 * Statusline rendering.
 *
 * Ordering here is not cosmetic. The projected percentage once occupied the
 * headline slot, so a line reading `🔴 277.5M wtd → 381.1M proj · 133% of budget`
 * was taken to mean 133% consumed when actual spend was 7%. A forecast sitting
 * where a reader takes it for a measurement is a false reading even when every
 * number in it is correct — so what leads, and how the forecast is labelled, is
 * asserted in tests the same way the scanner's arithmetic is.
 *
 * Two invariants, both learned by breaking them:
 *   1. Actual spend leads; a forecast is always marked as one. `N% of budget`
 *      is banned outright — it names the budget without saying whether that is
 *      spent or predicted.
 *   2. A missing or stale cache is stated out loud. A silent HUD reads as "all
 *      clear" when it is really just blind.
 */

const RESET = '\u001b[0m';

function dim(s: string): string {
  return `\u001b[2m${s}${RESET}`;
}

function col(code: string, s: string): string {
  return `\u001b[${code}m${s}${RESET}`;
}

/**
 * Truncating unit format, deliberately distinct from `human()`.
 *
 * The statusline never rounds up: showing 250.0M when 249.96M was measured
 * reads as crossing a threshold that was not crossed.
 */
export function compactUnits(u: number): string {
  const v = Number(u) || 0;
  if (v >= 1e6) return `${Math.floor((v / 1e6) * 10) / 10}M`;
  if (v >= 1e3) return `${Math.floor(v / 1e3)}k`;
  return `${Math.floor(v)}`;
}

const STATUS_STYLE: Record<string, [string, string]> = {
  CRITICAL: ['31', '🔴'],
  HOT: ['31', '🔥'],
  WARM: ['33', '🟠'],
  OK: ['32', '🟢'],
  EARLY: ['36', '🌱'],
  UNDERCOUNT: ['31', '⁉️'],
  NO_DATA: ['33', '⚠'],
};

export interface GitSegment {
  /** `merged` means the branch is fully contained in its base — the /clear signal. */
  kind: 'merged' | 'plain';
  label: string;
}

export interface StatuslineInput {
  /** `null` when the cache is missing OR unparseable — both are "blind". */
  summary: Summary | null;
  config?: Partial<BurnConfig>;
  git?: GitSegment | null;
  modelName?: string | null;
  now?: Date;
}

/**
 * The pace phrase. ACTUAL SPEND LEADS; the forecast is marked with "proj".
 *
 * Order and labelling are the whole point — see the invariant above.
 */
function paceText(summary: Summary): string {
  const budget = summary.budget ?? { set: false };
  if (budget.set === true && budget.pct_used != null) {
    const used = `${Math.floor(budget.pct_used)}% used`;
    return budget.pct_projected != null
      ? `${used} · ~${Math.floor(budget.pct_projected)}% proj`
      : used;
  }
  if (summary.projection?.ratio_vs_baseline != null) {
    return `${summary.projection.ratio_vs_baseline}× 4wk median proj`;
  }
  return 'no baseline yet';
}

/** Minutes since the cache was written, or -1 when that cannot be determined. */
function cacheAgeMinutes(summary: Summary, now: Date): number {
  const generated = Date.parse(summary.generated_at ?? '');
  return Number.isFinite(generated) ? Math.floor((now.getTime() - generated) / 60_000) : -1;
}

function burnSegment(summary: Summary, staleAfter: number, now: Date): string {
  const [colour, icon] = STATUS_STYLE[summary.status] ?? ['33', '❔'];
  let out = col(colour, `${icon} ${compactUnits(summary.wtd?.units ?? 0)}`);
  if (summary.status === 'UNDERCOUNT') {
    out += col('31', '+ lost rows — UNDERCOUNT, run harness burn');
  }
  out += dim(
    ` wtd → ${compactUnits(summary.projection?.units_at_reset ?? 0)} proj · ${paceText(summary)}`
  );
  if (summary.projection?.confidence === 'low') out += dim(' (early)');

  const age = cacheAgeMinutes(summary, now);
  if (age > staleAfter) out += col('33', ` [stale ${age}m]`);
  return out;
}

/**
 * Reset countdown. Hours once inside two days: "2d" reads as plenty of runway
 * when it is really one working afternoon.
 */
function countdownSegment(summary: Summary): string {
  const hoursLeft = summary.week?.hours_left ?? (summary.week?.days_left ?? 0) * 24;
  if (hoursLeft > 48) return dim(`${Math.round(summary.week?.days_left ?? 0)}d to reset`);
  const label = `${Math.round(hoursLeft)}h to reset`;
  return hoursLeft <= 12 ? col('33', label) : dim(label);
}

/** A per-model limit can be exhausted while the pooled one still looks fine. */
function exhaustedSegment(summary: Summary): string | null {
  const exhausted = summary.models_exhausted ?? [];
  if (exhausted.length === 0) return null;
  return col('31', `⛔ ${exhausted.map((m) => m.replace(/^claude-/, '')).join(',')} spent`);
}

/** The 5h session window, only once it is worth knowing about. */
function sessionSegment(summary: Summary): string | null {
  const pct = summary.session?.pct_used ?? 0;
  return pct >= 70 ? col('33', `⏳ session ~${Math.round(pct)}%`) : null;
}

function gitText(git: GitSegment): string {
  return git.kind === 'merged' ? col('35', `✅ ${git.label} merged → /clear`) : dim(git.label);
}

export function renderStatusline(input: StatuslineInput): string {
  const { summary, config, git, modelName } = input;
  const now = input.now ?? new Date();

  const burnSegments: (string | null)[] = summary
    ? [
        burnSegment(summary, config?.stale_after_minutes ?? 90, now),
        countdownSegment(summary),
        exhaustedSegment(summary),
        sessionSegment(summary),
        // A calibration that outlived its basis must not be trusted silently.
        summary.calibration?.expired ? col('33', '⚠ recalibrate') : null,
      ]
    : [col('33', 'burn: no cache — run: harness burn scan')];

  const segments = [...burnSegments, git ? gitText(git) : null, modelName ? dim(modelName) : null];
  return segments.filter((s): s is string => s !== null).join(dim(' │ '));
}
