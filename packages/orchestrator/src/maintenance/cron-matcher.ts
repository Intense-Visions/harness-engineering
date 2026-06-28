/**
 * Minimal 5-field cron expression matcher.
 *
 * Supports: exact values, wildcards (*), ranges (1-5), lists (1,3,5), and step values (star/N).
 * Does NOT support: L, W, #, ?, or 6/7-field expressions.
 *
 * DAY-OF-MONTH / DAY-OF-WEEK SEMANTICS — intentional divergence from POSIX cron:
 * when BOTH the day-of-month and day-of-week fields are restricted (neither is
 * `*`), this matcher ANDs them (a date must satisfy both), whereas standard cron
 * ORs them (a date fires if it satisfies EITHER). E.g. `0 0 13 * 5` matches only
 * a Friday that is also the 13th here, but every 13th OR every Friday under
 * POSIX. This is internally consistent across `cronMatchesNow`/`cronMatchesDate`
 * (so the overdue scan's day-skip and minute-match agree) and safe in practice:
 * no built-in/registry schedule restricts both fields. Pinned by the
 * "dom + dow AND semantics" tests. Custom tasks that need OR must split into two
 * task entries.
 */

/**
 * Parse a single cron field into the set of matching integer values.
 */
function validateRange(value: number, min: number, max: number, field: string): number {
  if (isNaN(value) || value < min || value > max) {
    throw new Error(`Invalid cron value ${value} in field "${field}": must be ${min}-${max}`);
  }
  return value;
}

function parseField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();

  for (const part of field.split(',')) {
    if (part.includes('/')) {
      // Step: */N or M-N/S
      const [rangeStr, stepStr] = part.split('/');
      const step = validateRange(parseInt(stepStr!, 10), 1, max, field);
      let start = min;
      let end = max;
      if (rangeStr !== '*') {
        if (rangeStr!.includes('-')) {
          const [a, b] = rangeStr!.split('-');
          start = validateRange(parseInt(a!, 10), min, max, field);
          end = validateRange(parseInt(b!, 10), min, max, field);
        } else {
          start = validateRange(parseInt(rangeStr!, 10), min, max, field);
        }
      }
      for (let i = start; i <= end; i += step) {
        values.add(i);
      }
    } else if (part === '*') {
      for (let i = min; i <= max; i++) {
        values.add(i);
      }
    } else if (part.includes('-')) {
      const [a, b] = part.split('-');
      const start = validateRange(parseInt(a!, 10), min, max, field);
      const end = validateRange(parseInt(b!, 10), min, max, field);
      for (let i = start; i <= end; i++) {
        values.add(i);
      }
    } else {
      validateRange(parseInt(part, 10), min, max, field);
      values.add(parseInt(part, 10));
    }
  }

  return values;
}

/**
 * Returns true if the given 5-field cron expression matches the provided Date.
 *
 * Fields: minute hour day-of-month month day-of-week
 * Month is 1-12, day-of-week is 0-6 (0 = Sunday).
 *
 * @throws {Error} If the expression does not have exactly 5 fields.
 */
export function cronMatchesNow(expression: string, now: Date): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Invalid cron expression: expected 5 fields, got ${fields.length}`);
  }

  const minute = now.getMinutes();
  const hour = now.getHours();
  const dayOfMonth = now.getDate();
  const month = now.getMonth() + 1; // JS months are 0-based
  const dayOfWeek = now.getDay(); // 0 = Sunday

  const [minField, hourField, domField, monthField, dowField] = fields as [
    string,
    string,
    string,
    string,
    string,
  ];

  // Parse all fields eagerly so invalid values always throw, regardless of short-circuit
  const minutes = parseField(minField, 0, 59);
  const hours = parseField(hourField, 0, 23);
  const daysOfMonth = parseField(domField, 1, 31);
  const months = parseField(monthField, 1, 12);
  const daysOfWeek = parseField(dowField, 0, 6);

  // dom AND dow when both restricted — see module header (diverges from POSIX OR).
  return (
    minutes.has(minute) &&
    hours.has(hour) &&
    daysOfMonth.has(dayOfMonth) &&
    months.has(month) &&
    daysOfWeek.has(dayOfWeek)
  );
}

/**
 * Returns true if the calendar date (day-of-month, month, day-of-week) of `date`
 * satisfies the cron expression, ignoring the minute/hour fields entirely.
 *
 * Used by the overdue scan to cheaply skip whole days that can never fire,
 * turning a flat minute-by-minute look-back into a coarse-to-fine (day → minute)
 * scan. Genuinely-impossible date combinations (e.g. `0 0 31 2 *` — Feb 31)
 * match no real calendar day, so callers stepping over real dates get `false`
 * for every day and resolve to "no fire".
 *
 * @throws {Error} If the expression does not have exactly 5 fields.
 */
export function cronMatchesDate(expression: string, date: Date): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Invalid cron expression: expected 5 fields, got ${fields.length}`);
  }
  const [, , domField, monthField, dowField] = fields as [string, string, string, string, string];
  const daysOfMonth = parseField(domField, 1, 31);
  const months = parseField(monthField, 1, 12);
  const daysOfWeek = parseField(dowField, 0, 6);

  // dom AND dow when both restricted — see module header (diverges from POSIX OR).
  return (
    daysOfMonth.has(date.getDate()) &&
    months.has(date.getMonth() + 1) &&
    daysOfWeek.has(date.getDay())
  );
}
