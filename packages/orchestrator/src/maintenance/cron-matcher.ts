/**
 * Minimal 5-field cron expression matcher.
 *
 * Supports: exact values, wildcards (*), ranges (1-5), lists (1,3,5), and step values (star/N).
 * Does NOT support: L, W, #, ?, or 6/7-field expressions.
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

  return (
    minutes.has(minute) &&
    hours.has(hour) &&
    daysOfMonth.has(dayOfMonth) &&
    months.has(month) &&
    daysOfWeek.has(dayOfWeek)
  );
}
