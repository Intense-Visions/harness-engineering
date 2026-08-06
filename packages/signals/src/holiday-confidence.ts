import { z } from 'zod';
import { defaultCommandRunner } from './command-runner';
import { ASSESSMENT_MARKER, DEFAULT_WINDOW_DAYS, round2 } from './shared';
import type { CommandRunner, SignalResult } from './types';

/**
 * Holiday Confidence — the composed "if the senior disappears for two weeks,
 * what holds?" KPI. It answers, over a rolling window, what fraction of merged
 * PRs cleared all four unwatched-safety gates:
 *
 *   (a) a multi-persona review fired for the PR;
 *   (b) its post-merge outcome-eval did not fail;
 *   (c) no baseline was silently auto-updated during the window;
 *   (d) no curated signal was in breach (warn/alert) during the window.
 *
 * (a) and (b) are evaluated per-PR and produce a graded pass fraction. (c) and
 * (d) are window-wide conditions — they are the same for every PR in the window,
 * so they act as gates: when either is breached the window was not safe to leave
 * unwatched and confidence collapses to 0 for that window, with a legible reason.
 *
 * The computation reuses the existing signal authorities rather than inventing a
 * parallel data pull: the per-PR review status and PR denominator come from the
 * same `gh pr list` authority the `pr-merged-without-multi-persona-review` signal
 * uses; per-PR outcome-eval verdicts come from the graph `execution_outcome`
 * nodes the `eval-fail-rate` signal consumes; and (c)/(d) are read off the curated
 * signal results themselves. It is repo-agnostic (gh runs against whatever repo
 * the resolved path points at) and parameterizable (window days, project path,
 * injectable command runner / graph store / signals), so an adopter project can
 * compute it too.
 */

/** Fetch cap for the single `gh pr list` call; mirrors the pr-review provider. */
const FETCH_LIMIT = 500;

/** Status thresholds on the confidence percentage. Higher is healthier. */
const THRESHOLD = { warn: 90, alert: 75 } as const;

const SOURCE = 'gh pr list (merged) + graph execution_outcome + curated signals';

export type HolidayConfidenceStatus = 'ok' | 'warn' | 'alert' | 'pending' | 'error';

/** Minimal graph surface needed for the per-PR outcome-eval linkage (criterion b). */
export interface OutcomeQueryStore {
  findNodes(query: { type: 'execution_outcome' }): Array<{ metadata: Record<string, unknown> }>;
}

export interface HolidayConfidenceInput {
  /** Resolved project root. `gh` runs here; the graph is loaded from here. */
  projectPath: string;
  /** Rolling window in days. Default {@link DEFAULT_WINDOW_DAYS} (30). */
  windowDays?: number;
  /** Clock injection for deterministic tests. Default `new Date()`. */
  now?: Date;
  /** Injectable gh/git runner. Default {@link defaultCommandRunner}. */
  runCommand?: CommandRunner;
  /**
   * Graph store for per-PR outcome-eval linkage (b). When omitted, the caller's
   * loader is used (real path) or — in tests — (b) is left undetermined and
   * degrades to pass-with-note.
   */
  graphStore?: OutcomeQueryStore;
  /**
   * Pre-gathered curated signals for the window gates (c)/(d). When omitted, the
   * caller is expected to supply them via {@link HolidayConfidenceInput.gatherSignals}.
   */
  signals?: SignalResult[];
  /**
   * Seam that gathers the curated signals when `signals` is not supplied. The CLI
   * wires this to the real `gatherSignals`; tests inject `signals` directly and
   * never reach it.
   */
  gatherSignals?: (projectPath: string) => Promise<{ signals: SignalResult[] }>;
}

export interface HolidayConfidenceCriteria {
  /** (a) merged PRs that carried a multi-persona review. */
  reviewFired: { passed: number; total: number };
  /** (b) merged PRs whose post-merge outcome-eval did not fail. */
  outcomeEvalPassed: { passed: number; total: number; degraded: boolean };
  /** (c) window gate: no baseline auto-update during the window. */
  noBaselineAutoUpdate: { held: boolean; count: number | null };
  /** (d) window gate: no curated signal in warn/alert during the window. */
  noSignalBreach: { held: boolean; breached: string[] };
}

export interface HolidayConfidenceResult {
  /** % of merged PRs clearing all four gates; `null` when undeterminable. */
  value: number | null;
  unit: '%';
  status: HolidayConfidenceStatus;
  /** Higher is healthier. */
  betterDirection: 'up';
  windowDays: number;
  mergedPrs: number;
  confidentPrs: number;
  criteria: HolidayConfidenceCriteria;
  threshold: { warn: number; alert: number };
  /** Degradation notes (e.g. missing graph, ungatherable signals). */
  notes: string[];
  detail: string;
  source: string;
  generatedAt: string;
}

const PrSchema = z.object({
  number: z.number(),
  mergedAt: z.string(),
  reviews: z.array(z.object({ body: z.string() })),
  headRefOid: z.string().optional(),
  mergeCommit: z.object({ oid: z.string() }).nullable().optional(),
});
const PrListSchema = z.array(PrSchema);
type PrRow = z.infer<typeof PrSchema>;

/** Build a degraded result that never throws. */
function baseResult(
  windowDays: number,
  generatedAt: string,
  overrides: Partial<HolidayConfidenceResult>
): HolidayConfidenceResult {
  return {
    value: null,
    unit: '%',
    status: 'error',
    betterDirection: 'up',
    windowDays,
    mergedPrs: 0,
    confidentPrs: 0,
    criteria: {
      reviewFired: { passed: 0, total: 0 },
      outcomeEvalPassed: { passed: 0, total: 0, degraded: true },
      noBaselineAutoUpdate: { held: true, count: null },
      noSignalBreach: { held: true, breached: [] },
    },
    threshold: { ...THRESHOLD },
    notes: [],
    detail: '',
    source: SOURCE,
    generatedAt,
    ...overrides,
  };
}

/** Fetch merged PRs (with inline reviews + commit shas) for the window. */
async function fetchMergedPrs(
  cutoffDate: string,
  runCommand: CommandRunner
): Promise<{ ok: true; prs: PrRow[] } | { ok: false; detail: string }> {
  let stdout: string;
  try {
    stdout = await runCommand('gh', [
      'pr',
      'list',
      '--state',
      'merged',
      '--limit',
      String(FETCH_LIMIT),
      '--search',
      `merged:>=${cutoffDate}`,
      '--json',
      'number,mergedAt,reviews,headRefOid,mergeCommit',
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, detail: `gh unavailable or not authenticated: ${message}` };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(stdout);
  } catch {
    return { ok: false, detail: 'Could not parse gh PR list output; ensure gh is authenticated.' };
  }
  const parsed = PrListSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, detail: 'Could not parse gh PR list output; ensure gh is authenticated.' };
  }
  return { ok: true, prs: parsed.data };
}

/** The set of commit shas by which a PR can be matched to an `execution_outcome` node. */
function prShas(pr: PrRow): string[] {
  const shas: string[] = [];
  if (pr.headRefOid) shas.push(pr.headRefOid);
  if (pr.mergeCommit?.oid) shas.push(pr.mergeCommit.oid);
  return shas;
}

/**
 * Build the set of commit shas that carry a FAILED outcome-eval verdict, from the
 * graph `execution_outcome` nodes. Mirrors the sha-keyed lookup the pre-merge brief
 * uses (`metadata.commit` / `metadata.headSha`). A node counts as failed when its
 * `result` is `'failure'` (the connector maps a non-SATISFIED verdict to `'failure'`).
 */
function failedOutcomeShas(store: OutcomeQueryStore): Set<string> {
  const failed = new Set<string>();
  const nodes = store.findNodes({ type: 'execution_outcome' });
  for (const node of nodes) {
    const m = node.metadata ?? {};
    if (m.result !== 'failure') continue;
    const sha = typeof m.commit === 'string' ? m.commit : undefined;
    const headSha = typeof m.headSha === 'string' ? m.headSha : undefined;
    if (sha) failed.add(sha);
    if (headSha) failed.add(headSha);
  }
  return failed;
}

/** Read the baseline-auto-update-count signal value (criterion c). */
function readBaselineGate(signals: SignalResult[]): { held: boolean; count: number | null } {
  const sig = signals.find((s) => s.id === 'baseline-auto-update-count');
  if (!sig || sig.value === null) return { held: true, count: null };
  return { held: sig.value === 0, count: sig.value };
}

/** Read which curated signals are in breach (criterion d). warn/alert = breach. */
function readSignalBreachGate(signals: SignalResult[]): { held: boolean; breached: string[] } {
  const breached = signals
    .filter((s) => s.status === 'warn' || s.status === 'alert')
    .map((s) => s.id);
  return { held: breached.length === 0, breached };
}

function statusForValue(value: number): HolidayConfidenceStatus {
  if (value < THRESHOLD.alert) return 'alert';
  if (value < THRESHOLD.warn) return 'warn';
  return 'ok';
}

function buildDetail(r: HolidayConfidenceResult): string {
  const { value, mergedPrs, windowDays, criteria } = r;
  const pct = value === null ? 'n/a' : `${value}%`;
  const gates: string[] = [];
  if (!criteria.noBaselineAutoUpdate.held) {
    gates.push(`baseline auto-updates present (${criteria.noBaselineAutoUpdate.count})`);
  }
  if (!criteria.noSignalBreach.held) {
    gates.push(`signals in breach: ${criteria.noSignalBreach.breached.join(', ')}`);
  }
  const gateNote = gates.length > 0 ? ` Window gate breached — ${gates.join('; ')}.` : '';
  return (
    `${pct} of ${mergedPrs} merged PR${mergedPrs === 1 ? '' : 's'} in the last ${windowDays} days ` +
    `cleared all four holiday-confidence gates ` +
    `(${criteria.reviewFired.passed}/${criteria.reviewFired.total} reviewed, ` +
    `${criteria.outcomeEvalPassed.passed}/${criteria.outcomeEvalPassed.total} eval-clean).${gateNote}`
  );
}

/**
 * Compute Holiday Confidence for a project over a rolling window. Never throws:
 * gh unavailability yields `status: 'error'` with a null value; an empty window
 * yields `status: 'pending'`; any other degradation is recorded in `notes`.
 */
export async function computeHolidayConfidence(
  input: HolidayConfidenceInput
): Promise<HolidayConfidenceResult> {
  const windowDays = input.windowDays ?? DEFAULT_WINDOW_DAYS;
  const now = input.now ?? new Date();
  const runCommand = input.runCommand ?? defaultCommandRunner;
  const generatedAt = now.toISOString();
  const notes: string[] = [];

  const cutoffMs = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const cutoffDate = new Date(cutoffMs).toISOString().slice(0, 10);

  // ── Denominator + per-PR review status (a), from the gh authority ──────────
  const fetched = await fetchMergedPrs(cutoffDate, runCommand);
  if (!fetched.ok) {
    return baseResult(windowDays, generatedAt, { status: 'error', detail: fetched.detail });
  }
  const prs = fetched.prs.filter((p) => {
    const ms = Date.parse(p.mergedAt);
    return !Number.isNaN(ms) && ms >= cutoffMs;
  });
  const mergedPrs = prs.length;

  // ── Window gates (c)/(d), from the curated signal authority ────────────────
  let signals: SignalResult[] = input.signals ?? [];
  if (!input.signals) {
    if (input.gatherSignals) {
      try {
        signals = (await input.gatherSignals(input.projectPath)).signals;
      } catch (err) {
        notes.push(
          `signals ungatherable (${err instanceof Error ? err.message : String(err)}); window gates assumed to hold`
        );
      }
    } else {
      notes.push('no signals supplied; window gates assumed to hold');
    }
  }
  const noBaselineAutoUpdate = readBaselineGate(signals);
  const noSignalBreach = readSignalBreachGate(signals);
  if (signals.length === 0) {
    // Already noted above; keep the gates non-punitive but explicit.
  }

  // ── Per-PR outcome-eval status (b), from the graph authority ───────────────
  const store = input.graphStore;
  const failedShas = store ? failedOutcomeShas(store) : new Set<string>();
  const evalDegraded = !store || failedShas.size === 0;
  if (!store) notes.push('graph unavailable; outcome-eval gate (b) assumed passed');

  let reviewed = 0;
  let evalClean = 0;
  let perPrConfident = 0;
  for (const pr of prs) {
    const didReview = pr.reviews.some((rev) => rev.body.includes(ASSESSMENT_MARKER));
    const evalFailed = prShas(pr).some((sha) => failedShas.has(sha));
    if (didReview) reviewed += 1;
    if (!evalFailed) evalClean += 1;
    if (didReview && !evalFailed) perPrConfident += 1;
  }

  const windowGateHeld = noBaselineAutoUpdate.held && noSignalBreach.held;
  const confidentPrs = windowGateHeld ? perPrConfident : 0;

  const criteria: HolidayConfidenceCriteria = {
    reviewFired: { passed: reviewed, total: mergedPrs },
    outcomeEvalPassed: { passed: evalClean, total: mergedPrs, degraded: evalDegraded },
    noBaselineAutoUpdate,
    noSignalBreach,
  };

  if (mergedPrs === 0) {
    const pending = baseResult(windowDays, generatedAt, {
      status: 'pending',
      mergedPrs: 0,
      confidentPrs: 0,
      criteria,
      notes,
      detail: `No PRs merged in the last ${windowDays} days — Holiday Confidence is undefined until PRs land.`,
    });
    return pending;
  }

  const value = round2((confidentPrs / mergedPrs) * 100);
  const result: HolidayConfidenceResult = {
    value,
    unit: '%',
    status: statusForValue(value),
    betterDirection: 'up',
    windowDays,
    mergedPrs,
    confidentPrs,
    criteria,
    threshold: { ...THRESHOLD },
    notes,
    detail: '',
    source: SOURCE,
    generatedAt,
  };
  result.detail = buildDetail(result);
  return result;
}
