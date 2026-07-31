#!/usr/bin/env node
/**
 * Scheduled health alarm for `main`'s CI.
 *
 * Driven by issue #987: `build-and-test` was red on `main` for eight days and
 * nothing noticed. Every PR inherited the red check, and the real cost was not
 * the broken test — it was that a permanently-red required check trains
 * contributors to read red as normal, so the next genuine regression in that
 * job lands invisibly. Nothing in the repo watched `main` itself; the failure
 * was only ever found by someone stumbling into it from a PR.
 *
 * What it does
 * ------------
 * 1. Reads the recent `push`-triggered runs of the CI workflow on `main`.
 * 2. Applies a deliberately quiet health rule (below).
 * 3. Alarms on a *transition* only — opens a tracking issue on green -> red,
 *    updates that same issue while it stays red (never opens a second one),
 *    and comments + closes it as an all-clear on red -> green.
 * 4. Writes a step summary on EVERY run regardless of verdict, so the check
 *    always shows its own working.
 *
 * The health rule, and why it is the quiet one
 * -------------------------------------------
 * `main` is unhealthy when the most recent N *decisive* runs all failed
 * (N = 2 by default, `MAIN_HEALTH_THRESHOLD`). The louder alternative —
 * "the most recent run failed" — alarms on any single flake, and an alarm that
 * fires on flakes is an alarm people mute. Two consecutive failures is already
 * far inside the eight-day window this exists to close, and a genuinely broken
 * `main` fails every run, so the quieter rule loses nothing real.
 *
 * "Decisive" excludes `cancelled` and `skipped` runs. CI sets
 * `cancel-in-progress: true`, so rapid merges leave a trail of cancelled runs
 * that say nothing about `main`'s health; counting them as failures would
 * manufacture streaks out of merge cadence alone.
 *
 * Denominator discipline
 * ----------------------
 * If fewer than N decisive runs can be resolved — wrong workflow filename,
 * API error, missing permission, or simply a quiet window — the check exits
 * INDETERMINATE (3). It never reports healthy. A health check that examined
 * nothing has abstained, not confirmed health, and the whole point of #987 is
 * that a green-looking gate which verified nothing is worse than no gate.
 *
 * Exit codes
 * ----------
 *   0  HEALTHY        — the most recent decisive runs are not a failing streak.
 *   1  INTERNAL_ERROR — unexpected exception; verdict unknown.
 *   2  UNHEALTHY      — failing streak met the threshold; alarm raised/updated.
 *   3  INDETERMINATE  — fewer than `threshold` decisive runs resolved (zero
 *                       runs, bad workflow name, API/permission failure).
 *                       Explicitly NOT a pass.
 *   4  ALARM_UNDELIVERED — verdict computed but the issue upsert failed, so the
 *                       alarm did not reach a human. Fails loudly rather than
 *                       letting silence read as health.
 *
 * Usage:
 *   node scripts/main-health-check.mjs [--dry-run]
 *
 * Env:
 *   GH_TOKEN                 required for the `gh` calls
 *   GITHUB_REPOSITORY        owner/repo (default: Intense-Visions/harness-engineering)
 *   MAIN_HEALTH_WORKFLOW     workflow filename (default: ci.yml)
 *   MAIN_HEALTH_BRANCH       branch to watch (default: main)
 *   MAIN_HEALTH_THRESHOLD    consecutive decisive failures to alarm (default: 2)
 *   MAIN_HEALTH_LOOKBACK     runs to fetch (default: 30)
 *   GITHUB_STEP_SUMMARY      appended to when present
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Exit codes. Documented in the module header; asserted in tests. */
export const EXIT = {
  HEALTHY: 0,
  INTERNAL_ERROR: 1,
  UNHEALTHY: 2,
  INDETERMINATE: 3,
  ALARM_UNDELIVERED: 4,
};

/** Marker embedded in the alarm issue body so the issue is identifiable by grep as well as by label. */
export const ALARM_MARKER = '<!-- main-health-alarm:v1 -->';

/** Label that makes the alarm issue findable without relying on the search index. */
export const ALARM_LABEL = 'main-health-alarm';

/**
 * Conclusions that say something about `main`'s health. `cancelled` and
 * `skipped` are deliberately absent — see the header.
 */
const DECISIVE_CONCLUSIONS = new Set(['success', 'failure', 'timed_out', 'startup_failure']);

/**
 * Keep only runs that carry a health signal, newest first.
 *
 * @param {Array<{status?: string, conclusion?: string, created_at?: string}>} runs
 * @returns {Array<object>} decisive runs, newest first
 */
export function selectDecisiveRuns(runs) {
  return (Array.isArray(runs) ? runs : [])
    .filter((r) => r && r.status === 'completed' && DECISIVE_CONCLUSIONS.has(r.conclusion))
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/**
 * Apply the health rule to a run list.
 *
 * @param {Array<object>} runs raw workflow runs (any order)
 * @param {{threshold?: number}} [opts]
 * @returns {{
 *   state: 'healthy'|'unhealthy'|'indeterminate',
 *   threshold: number,
 *   decisiveCount: number,
 *   failingStreak: number,
 *   latest: object|null,
 *   streakRuns: Array<object>,
 *   reason: string,
 * }}
 */
export function evaluateHealth(runs, opts = {}) {
  const threshold = Math.max(1, Number(opts.threshold ?? 2));
  const decisive = selectDecisiveRuns(runs);

  if (decisive.length < threshold) {
    return {
      state: 'indeterminate',
      threshold,
      decisiveCount: decisive.length,
      failingStreak: 0,
      latest: decisive[0] ?? null,
      streakRuns: [],
      reason:
        decisive.length === 0
          ? 'Zero decisive runs resolved — nothing was inspected, so health is unknown (not healthy).'
          : `Only ${decisive.length} decisive run(s) resolved; the rule needs ${threshold} to decide.`,
    };
  }

  let failingStreak = 0;
  for (const run of decisive) {
    if (run.conclusion === 'success') break;
    failingStreak += 1;
  }

  const unhealthy = failingStreak >= threshold;
  return {
    state: unhealthy ? 'unhealthy' : 'healthy',
    threshold,
    decisiveCount: decisive.length,
    failingStreak,
    latest: decisive[0] ?? null,
    streakRuns: decisive.slice(0, failingStreak),
    reason: unhealthy
      ? `The ${failingStreak} most recent decisive run(s) failed (threshold ${threshold}).`
      : failingStreak === 0
        ? 'The most recent decisive run succeeded.'
        : `Only ${failingStreak} consecutive failure(s); below the alarm threshold of ${threshold} (treated as a flake).`,
  };
}

/**
 * Decide what to do about the alarm issue, given the verdict and whether an
 * alarm issue is already open. This is the transition rule: notify on change,
 * stay quiet otherwise.
 *
 * @param {'healthy'|'unhealthy'|'indeterminate'} state
 * @param {boolean} hasOpenAlarm
 * @returns {'open'|'update'|'resolve'|'none'}
 */
export function decideAction(state, hasOpenAlarm) {
  if (state === 'unhealthy') return hasOpenAlarm ? 'update' : 'open';
  if (state === 'healthy') return hasOpenAlarm ? 'resolve' : 'none';
  // Indeterminate: the check cannot see `main`, so it must not close a live
  // alarm (that would fake an all-clear) and must not open one either.
  return 'none';
}

/** @param {object|null} run */
function runLine(run) {
  if (!run) return '_none_';
  return `[${run.created_at ?? '?'} — ${run.conclusion ?? '?'}](${run.html_url ?? '#'})`;
}

/**
 * Body of the tracking issue. Rewritten (not appended to) on every update so
 * the issue always shows current state rather than a scroll of nightly noise.
 *
 * @param {ReturnType<typeof evaluateHealth>} verdict
 * @param {{repo: string, workflow: string, branch: string, runUrl?: string}} ctx
 * @returns {string}
 */
export function renderIssueBody(verdict, ctx) {
  const streak = verdict.streakRuns.map((r) => `- ${runLine(r)} — ${r.display_title ?? ''}`);
  return [
    ALARM_MARKER,
    `## \`${ctx.branch}\` CI is red`,
    '',
    `The **${verdict.failingStreak}** most recent decisive runs of \`${ctx.workflow}\` on ` +
      `\`${ctx.branch}\` failed. Alarm threshold is ${verdict.threshold} consecutive failures.`,
    '',
    '### Failing runs (newest first)',
    ...(streak.length ? streak : ['- _none recorded_']),
    '',
    '### Why this issue exists',
    '',
    'Every PR inherits a red `main`. Two costs, and the second is the expensive one:',
    'a broken PR cannot be told apart from the ambient failure, and a permanently-red',
    'required check teaches contributors to read red as normal — so the next real',
    'regression in that job lands unnoticed. See #987.',
    '',
    '### What closes this',
    '',
    `A green run of \`${ctx.workflow}\` on \`${ctx.branch}\`. The scheduled check closes this`,
    'issue automatically with an all-clear comment; do not close it by hand while',
    '`main` is still red.',
    '',
    '---',
    '',
    `_Maintained by \`.github/workflows/main-health.yml\` (\`scripts/main-health-check.mjs\`)._`,
    ctx.runUrl ? `_Last updated by [this run](${ctx.runUrl})._` : '',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

/**
 * The step summary, written on every run — healthy, unhealthy, or abstained.
 * Silence is the failure mode being fixed, so the check always says what it
 * looked at and how many runs it resolved.
 *
 * @param {ReturnType<typeof evaluateHealth>} verdict
 * @param {'open'|'update'|'resolve'|'none'} action
 * @param {{repo: string, workflow: string, branch: string, issueNumber?: number|null}} ctx
 * @returns {string}
 */
export function renderSummary(verdict, action, ctx) {
  const badge = {
    healthy: '✅ HEALTHY',
    unhealthy: '🚨 UNHEALTHY',
    indeterminate: '❓ INDETERMINATE (abstained — not a pass)',
  }[verdict.state];

  const actionText = {
    open: 'Opened a tracking issue (green → red transition).',
    update: 'Updated the existing tracking issue (still red — no new notification).',
    resolve: 'Commented an all-clear and closed the tracking issue (red → green transition).',
    none:
      verdict.state === 'indeterminate'
        ? 'No issue action: the check could not see `main`, so it neither alarms nor clears.'
        : 'No issue action: steady state, nothing changed.',
  }[action];

  return [
    `## main CI health: ${badge}`,
    '',
    `| | |`,
    `| --- | --- |`,
    `| Repo | \`${ctx.repo}\` |`,
    `| Workflow | \`${ctx.workflow}\` on \`${ctx.branch}\` |`,
    `| Decisive runs resolved | **${verdict.decisiveCount}** (threshold ${verdict.threshold}) |`,
    `| Consecutive failures | **${verdict.failingStreak}** |`,
    `| Latest decisive run | ${runLine(verdict.latest)} |`,
    `| Tracking issue | ${ctx.issueNumber ? `#${ctx.issueNumber}` : '_none_'} |`,
    '',
    `**Verdict:** ${verdict.reason}`,
    '',
    `**Alarm:** ${actionText}`,
    '',
    '_Decisive = a completed run concluding success / failure / timed_out / startup_failure._',
    '_`cancelled` and `skipped` runs are excluded: CI cancels in-progress runs on rapid_',
    '_merges, and counting those as failures would invent streaks out of merge cadence._',
  ].join('\n');
}

/* ------------------------------------------------------------------ *
 * Everything below is I/O. The pure logic above is what tests cover. *
 * ------------------------------------------------------------------ */

/**
 * Invoke `gh`. Injectable so tests never touch the network.
 *
 * @param {string[]} args
 * @returns {string} stdout
 */
function ghExec(args) {
  return execFileSync('gh', args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * @param {{gh: (args: string[]) => string, repo: string, workflow: string, branch: string, lookback: number}} deps
 * @returns {Array<object>} raw runs
 * @throws when the API call fails or returns an unusable shape (caller maps this to INDETERMINATE)
 */
export function fetchRuns(deps) {
  const { gh, repo, workflow, branch, lookback } = deps;
  const path =
    `/repos/${repo}/actions/workflows/${workflow}/runs` +
    `?branch=${encodeURIComponent(branch)}&event=push&per_page=${lookback}`;
  const raw = gh(['api', path]);
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.workflow_runs)) {
    throw new Error(`Unexpected response shape from ${path} (no workflow_runs array).`);
  }
  return parsed.workflow_runs;
}

/**
 * Find the currently-open alarm issue, if any. Looked up by label rather than
 * by search query: `gh search` is index-backed and lags, and a lagging lookup
 * is exactly how an upsert turns into a nightly duplicate.
 *
 * @param {{gh: (args: string[]) => string, repo: string}} deps
 * @returns {{number: number}|null}
 */
export function findOpenAlarmIssue(deps) {
  const { gh, repo } = deps;
  let raw;
  try {
    raw = gh([
      'issue',
      'list',
      '--repo',
      repo,
      '--label',
      ALARM_LABEL,
      '--state',
      'open',
      '--limit',
      '10',
      '--json',
      'number,title',
    ]);
  } catch {
    // The label may not exist yet on a first run; that is indistinguishable
    // from "no open alarm", and both mean the same thing here.
    return null;
  }
  const issues = JSON.parse(raw || '[]');
  if (!Array.isArray(issues) || issues.length === 0) return null;
  // Lowest number = the original incident issue if a human opened extras.
  return issues.slice().sort((a, b) => a.number - b.number)[0];
}

/** Create the alarm label if it is missing. Idempotent. */
function ensureLabel(gh, repo) {
  try {
    gh([
      'label',
      'create',
      ALARM_LABEL,
      '--repo',
      repo,
      '--color',
      'B60205',
      '--description',
      'Automated alarm: main branch CI health',
      '--force',
    ]);
  } catch {
    // Label creation needs write scope we may not have on a fork; the issue
    // upsert still works without the label, it just loses the fast lookup.
  }
}

/**
 * Deliver the alarm. Returns true when the intended side effect landed.
 *
 * @param {{
 *   gh: (args: string[]) => string,
 *   repo: string, workflow: string, branch: string, runUrl?: string,
 *   action: 'open'|'update'|'resolve'|'none',
 *   verdict: ReturnType<typeof evaluateHealth>,
 *   issue: {number: number}|null,
 *   dryRun?: boolean,
 * }} args
 * @returns {{delivered: boolean, issueNumber: number|null, error?: string}}
 */
export function deliverAlarm(args) {
  const { gh, repo, action, verdict, issue, dryRun } = args;
  const ctx = {
    repo,
    workflow: args.workflow,
    branch: args.branch,
    runUrl: args.runUrl,
  };

  if (action === 'none') return { delivered: true, issueNumber: issue?.number ?? null };
  if (dryRun) {
    console.log(`[dry-run] would ${action} the alarm issue`);
    return { delivered: true, issueNumber: issue?.number ?? null };
  }

  try {
    if (action === 'open') {
      ensureLabel(gh, repo);
      const url = gh([
        'issue',
        'create',
        '--repo',
        repo,
        '--title',
        `🚨 ${args.branch} CI is red (${verdict.failingStreak} consecutive failures)`,
        '--body',
        renderIssueBody(verdict, ctx),
        '--label',
        ALARM_LABEL,
      ]).trim();
      const num = Number(url.split('/').pop());
      return { delivered: true, issueNumber: Number.isFinite(num) ? num : null };
    }

    if (action === 'update') {
      // Edit the body in place instead of commenting: a nightly comment on a
      // long-running outage is how an alarm gets muted.
      gh([
        'issue',
        'edit',
        String(issue.number),
        '--repo',
        repo,
        '--body',
        renderIssueBody(verdict, ctx),
      ]);
      return { delivered: true, issueNumber: issue.number };
    }

    // resolve
    gh([
      'issue',
      'comment',
      String(issue.number),
      '--repo',
      repo,
      '--body',
      `✅ All clear — \`${args.workflow}\` is green again on \`${args.branch}\`.\n\n` +
        `Latest decisive run: ${runLine(verdict.latest)}\n\n` +
        `_Closed automatically by \`.github/workflows/main-health.yml\`._`,
    ]);
    gh(['issue', 'close', String(issue.number), '--repo', repo, '--reason', 'completed']);
    return { delivered: true, issueNumber: issue.number };
  } catch (err) {
    return {
      delivered: false,
      issueNumber: issue?.number ?? null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function writeSummary(text) {
  console.log(text);
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (!target) return;
  try {
    appendFileSync(target, `${text}\n`);
  } catch (err) {
    console.error(`Could not write the step summary: ${String(err)}`);
  }
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const repo = process.env.GITHUB_REPOSITORY || 'Intense-Visions/harness-engineering';
  const workflow = process.env.MAIN_HEALTH_WORKFLOW || 'ci.yml';
  const branch = process.env.MAIN_HEALTH_BRANCH || 'main';
  const threshold = Number(process.env.MAIN_HEALTH_THRESHOLD || 2);
  const lookback = Number(process.env.MAIN_HEALTH_LOOKBACK || 30);
  const runUrl =
    process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : undefined;

  let runs;
  try {
    runs = fetchRuns({ gh: ghExec, repo, workflow, branch, lookback });
  } catch (err) {
    // A failed fetch is an abstention, never a pass: the check saw nothing.
    const verdict = evaluateHealth([], { threshold });
    verdict.reason = `Could not resolve any runs: ${err instanceof Error ? err.message : String(err)}`;
    writeSummary(renderSummary(verdict, 'none', { repo, workflow, branch, issueNumber: null }));
    console.error(
      `INDETERMINATE: the health check resolved zero runs and therefore verified nothing.\n` +
        `Check that \`${workflow}\` still exists, that the token can read Actions, and that\n` +
        `\`${branch}\` is the right branch. Exiting ${EXIT.INDETERMINATE}.`
    );
    process.exit(EXIT.INDETERMINATE);
  }

  const verdict = evaluateHealth(runs, { threshold });
  const openIssue = verdict.state === 'indeterminate' ? null : findOpenAlarmIssue({ gh: ghExec, repo });
  const action = decideAction(verdict.state, Boolean(openIssue));
  const delivery = deliverAlarm({
    gh: ghExec,
    repo,
    workflow,
    branch,
    runUrl,
    action,
    verdict,
    issue: openIssue,
    dryRun,
  });

  writeSummary(
    renderSummary(verdict, action, { repo, workflow, branch, issueNumber: delivery.issueNumber })
  );

  if (!delivery.delivered) {
    console.error(
      `ALARM UNDELIVERED: verdict is ${verdict.state} but the issue ${action} failed: ${delivery.error}\n` +
        `Failing loudly — an undelivered alarm must not read as health. Exiting ${EXIT.ALARM_UNDELIVERED}.`
    );
    process.exit(EXIT.ALARM_UNDELIVERED);
  }

  if (verdict.state === 'indeterminate') {
    console.error(
      `INDETERMINATE: resolved ${verdict.decisiveCount} decisive run(s), fewer than the ` +
        `threshold of ${threshold}. Nothing was confirmed. Exiting ${EXIT.INDETERMINATE}.`
    );
    process.exit(EXIT.INDETERMINATE);
  }

  if (verdict.state === 'unhealthy') {
    console.error(`UNHEALTHY: ${verdict.reason} Exiting ${EXIT.UNHEALTHY}.`);
    process.exit(EXIT.UNHEALTHY);
  }

  console.log(`HEALTHY: ${verdict.reason}`);
  process.exit(EXIT.HEALTHY);
}

// Only run the gate when invoked as a script; importing exposes the pure
// helpers to tests without side effects.
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (err) {
    console.error(`INTERNAL ERROR: ${err instanceof Error ? err.stack : String(err)}`);
    process.exit(EXIT.INTERNAL_ERROR);
  }
}
