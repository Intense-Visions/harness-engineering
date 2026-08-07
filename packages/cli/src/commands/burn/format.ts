import chalk from 'chalk';

/**
 * Render a UTC ISO stamp in the account's reset timezone.
 *
 * /usage speaks that timezone, so a UTC time here would not line up with what
 * the user reads there — and the whole point of the week window is matching
 * /usage exactly.
 */
export function localTime(iso: string, tz: string, withZone = true): string {
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
      ...(withZone ? { timeZoneName: 'short' as const } : {}),
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

/** Progress bar that goes red past 100% rather than silently clamping. */
export function bar(fraction: number, width = 28): string {
  const f = Math.max(0, Math.min(fraction, 1.5));
  const filled = Math.round(Math.min(f, 1) * width);
  const s = '█'.repeat(filled) + '░'.repeat(width - filled);
  if (f > 1) return chalk.red(s);
  return f < 0.65 ? chalk.green(s) : chalk.yellow(s);
}

export function pad(label: string, width = 18): string {
  return label.padEnd(width);
}
