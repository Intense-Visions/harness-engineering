/**
 * Normalize a shorthand lookback string (e.g. `7d`) into the form git's
 * `--since=` expects (`7 days ago`). Bare shorthand is rejected by git on
 * macOS, so this translation is required at the boundary.
 *
 * Accepted units:
 *   - `h`  — hours
 *   - `d`  — days
 *   - `w`  — weeks
 *   - `mo` — months
 *
 * Note: `m` is intentionally NOT accepted because it is ambiguous between
 * "minute" and "month". Any other input throws, so callers cannot pass
 * garbage to git — where `--since=foo` silently degrades to a no-op and
 * returns every commit in the repo.
 */
export function normalizeSince(since: string): string {
  const m = /^(\d+)(h|d|w|mo)$/i.exec(since.trim());
  if (!m) {
    throw new Error(
      `Invalid lookback "${since}": expected format like "24h", "7d", "4w", or "3mo"`
    );
  }
  const n = m[1];
  const unit = m[2]?.toLowerCase();
  switch (unit) {
    case 'h':
      return `${n} hours ago`;
    case 'd':
      return `${n} days ago`;
    case 'w':
      return `${n} weeks ago`;
    case 'mo':
      return `${n} months ago`;
    default:
      // Unreachable — regex guards the unit set — but TypeScript wants exhaustiveness.
      throw new Error(`Invalid lookback "${since}"`);
  }
}
