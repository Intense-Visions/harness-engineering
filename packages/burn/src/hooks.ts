import type { Summary } from './types';
import { human } from './units';

/**
 * Hook payload builders.
 *
 * Both hooks split their audience deliberately:
 *   additionalContext -> ALWAYS injected (model-only, costs the user nothing)
 *                        so the assistant knows the pace without being asked.
 *   systemMessage     -> ONLY when there is something to act on.
 * Noise is why the previous always-on reminder stopped being read, so the
 * visible channel stays quiet unless it has earned the interruption.
 */

export interface SessionBriefOutput {
  hookSpecificOutput: { hookEventName: 'SessionStart'; additionalContext: string };
  systemMessage?: string;
}

function formatPace(s: Summary): string {
  const budget = s.budget ?? { set: false };
  if (budget.set && budget.pct_projected != null) {
    return `${Math.round(budget.pct_projected)}% of the weekly budget`;
  }
  const ratio = s.projection?.ratio_vs_baseline;
  return ratio ? `${ratio}x your 4-week median` : 'no baseline yet';
}

function staleMinutes(s: Summary, now: Date, threshold = 90): number | null {
  const generated = Date.parse(s.generated_at ?? '');
  if (!Number.isFinite(generated)) return null;
  const age = (now.getTime() - generated) / 60_000;
  return age > threshold ? Math.floor(age) : null;
}

export function sessionBrief(
  summary: Summary | null,
  mergedBranch: string | null,
  now: Date = new Date()
): SessionBriefOutput {
  if (!summary) {
    // A cache that cannot be read is a finding, not an all-clear.
    return {
      systemMessage:
        'BURN HUD: no usage cache could be read — the HUD is blind, not clear. Run: harness burn scan',
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext:
          'BURN HUD UNAVAILABLE: the usage cache is missing or unreadable, so pace is UNKNOWN. ' +
          'Treat this as a finding, not an all-clear — say so if the user asks about usage.',
      },
    };
  }

  const status = summary.status ?? '?';
  const pace = formatPace(summary);
  const stale = staleMinutes(summary, now);
  const budget = summary.budget ?? { set: false };
  const base = summary.baseline?.median_units;

  const context: string[] = [
    `BURN HUD (local usage proxy, not Anthropic's real quota): status=${status}.`,
    `Week to date ${human(summary.wtd.units)} units ` +
      `(${summary.wtd.requests.toLocaleString('en-US')} requests); ` +
      `projected ${human(summary.projection.units_at_reset)} by reset in ` +
      `${summary.week.days_left.toFixed(1)}d; pace = ${pace} ` +
      `(forecast confidence: ${summary.projection.confidence}).`,
  ];
  if (base) context.push(`4-week median baseline: ${human(base)} units/week.`);
  if (!budget.set) {
    context.push(
      'No weekly budget is set, so there is no percentage-of-limit to report. ' +
        'Never invent one — the real limit is server-side; /usage is the authority.'
    );
  }
  if (stale) context.push(`WARNING: cache is ${stale} minutes stale.`);
  if (mergedBranch) {
    context.push(
      `The checked-out branch '${mergedBranch}' is ALREADY MERGED into its base. ` +
        "The task it belongs to is done, so this session's context is now pure cost. " +
        'Recommend /clear in your first message.'
    );
  }

  const visible: string[] = [];
  const labels: Record<string, string> = {
    WARM: 'above your usual pace',
    HOT: 'running hot',
    CRITICAL: 'over budget at this pace',
  };
  if (labels[status]) {
    visible.push(
      `🔥 Burn ${status} — ${labels[status]}: ${human(summary.wtd.units)} units used, ` +
        `${human(summary.projection.units_at_reset)} projected by reset (${pace}).`
    );
  } else if (status === 'NO_DATA') {
    visible.push('⚠ Burn HUD has NO usage data — blind, not clear.');
  }
  if (stale) visible.push(`⚠ Burn cache ${stale}m stale.`);
  if (mergedBranch) {
    visible.push(
      `✅ '${mergedBranch}' is already merged — good moment to /clear before starting the next task.`
    );
  }

  const out: SessionBriefOutput = {
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context.join(' ') },
  };
  if (visible.length) out.systemMessage = visible.join('\n');
  return out;
}

/** Status -> escalation level. Everything below WARM is silence. */
const LEVEL: Record<string, number> = {
  NO_DATA: 0,
  EARLY: 0,
  NO_BASELINE: 0,
  OK: 0,
  WARM: 1,
  HOT: 2,
  CRITICAL: 3,
};

export interface NotifyState {
  level: number;
  status: string;
  ts: string;
}

export interface EscalationOutput {
  /** null when this turn has not earned an interruption. */
  message: string | null;
  /** Ladder state to persist, or null to leave the previous state untouched. */
  nextNotify: NotifyState | null;
}

function formatInZone(iso: string, tz: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'short',
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

/**
 * Decide whether the Stop hook speaks.
 *
 * It runs after EVERY assistant turn, so the bar is high: it notifies when the
 * status LEVEL RISES, or when an already-elevated level persists past the
 * cooldown. A warning repeated every turn becomes wallpaper, and wallpaper is
 * how a real limit gets hit anyway.
 */
export function escalation(
  summary: Summary,
  previous: NotifyState | null,
  now: Date = new Date(),
  cooldownMinutes = 45
): EscalationOutput {
  const status = summary.status ?? 'OK';
  const level = LEVEL[status] ?? 0;

  if (level === 0) {
    // Reset the ladder so a later re-entry into WARM notifies again.
    return { message: null, nextNotify: { level: 0, status, ts: now.toISOString() } };
  }

  const prevLevel = previous?.level ?? 0;
  const prevTs = previous?.ts ? Date.parse(previous.ts) : NaN;
  const escalated = level > prevLevel;
  const cooled = !Number.isFinite(prevTs) || (now.getTime() - prevTs) / 60_000 >= cooldownMinutes;
  if (!escalated && !cooled) return { message: null, nextNotify: null };

  const wtd = human(summary.wtd.units);
  const proj = human(summary.projection.units_at_reset);
  const budget = summary.budget ?? { set: false };
  const ratio = summary.projection?.ratio_vs_baseline;
  const headline = { 1: '🟠 Burn WARM', 2: '🔥 Burn HOT', 3: '🔴 Burn CRITICAL' }[level] ?? '';

  // Lead with what is actually spent. Quoting a projected percentage next to a
  // small absolute figure once produced "5.8M used ... 108% of your weekly
  // budget", which reads as self-contradictory and taught the reader to
  // discount the alarm.
  let spent: string;
  let forecast: string;
  if (budget.set && budget.pct_used != null) {
    spent = `${wtd} used — ${Math.round(budget.pct_used)}% of your weekly budget`;
    forecast =
      budget.pct_projected != null
        ? `; on current pace ~${Math.round(budget.pct_projected)}% by reset`
        : '';
  } else {
    spent = `${wtd} used this week`;
    forecast = `; projected ${proj} by reset${ratio ? ` (${ratio}x your 4-week median)` : ''}`;
  }

  let msg = `${headline} — ${spent}${forecast}. Reset in ${summary.week.days_left.toFixed(1)}d.`;
  if (summary.projection?.confidence === 'low') {
    msg += '\n   (Early in the week, so the forecast is weakly supported.)';
  }
  for (const m of summary.models_exhausted ?? []) {
    msg += `\n   ${m} is at 100% of its own separate limit — already spent.`;
  }
  if (level >= 2) {
    msg +=
      '\n   Worth slowing down: batch prompts, /clear finished work, and check /usage for real quota.';
  }
  if (budget.exhausts_before_reset && budget.exhausts_at) {
    // Report in the account's reset timezone; /usage speaks that timezone, and
    // a UTC time here would not line up with what the user reads there.
    const tz = summary.week?.tz || 'UTC';
    msg += `\n   At this rate the budget runs out ${formatInZone(budget.exhausts_at, tz)}, before reset.`;
  }
  if (summary.calibration?.expired) {
    msg +=
      `\n   NOTE: the budget calibration expired (${summary.calibration.valid_until}) — ` +
      "re-run 'harness burn calibrate <pct>'; until then this percentage may under-warn.";
  }

  return { message: msg, nextNotify: { level, status, ts: now.toISOString() } };
}
