/**
 * Canonical health-signal vocabulary and its mapping to assess checks.
 *
 * `SIGNAL_REGISTRY` is the SINGLE SOURCE OF TRUTH for signal names and the
 * check each signal contradicts. `CHECK_SIGNAL_MAP` and `SignalName` are
 * DERIVED from it — never hand-maintain a second list. Adding a signal is a
 * single registry entry that flows to the name union, the check map, and the
 * cli's `SIGNAL_RULES` typing automatically.
 *
 * Layer rule: this contract lives in core; the cli imports it. core must not
 * import cli.
 */

export type CheckKey = 'deps' | 'entropy' | 'security' | 'perf' | 'docs' | 'lint';

/** The check vocabulary (NOT signal names — see SC4). Used to fully populate CHECK_SIGNAL_MAP. */
const CHECK_KEYS: readonly CheckKey[] = ['deps', 'entropy', 'security', 'perf', 'docs', 'lint'];

/**
 * THE single source of truth. `check: null` marks a metrics-only signal that
 * maps to no check (it must never affect any `passed` flag).
 */
export const SIGNAL_REGISTRY = [
  { name: 'circular-deps', check: 'deps' },
  { name: 'layer-violations', check: 'deps' },
  { name: 'dead-code', check: 'entropy' },
  { name: 'drift', check: 'entropy' },
  { name: 'security-findings', check: 'security' },
  { name: 'doc-gaps', check: 'docs' },
  { name: 'perf-regression', check: 'perf' },
  { name: 'anomaly-outlier', check: null },
  { name: 'articulation-point', check: null },
  { name: 'high-coupling', check: null },
  { name: 'high-complexity', check: null },
  { name: 'low-coverage', check: null },
] as const satisfies ReadonlyArray<{ name: string; check: CheckKey | null }>;

export type SignalName = (typeof SIGNAL_REGISTRY)[number]['name'];

/**
 * Derived: check -> contradicting signal names (many-to-one). Built by grouping
 * SIGNAL_REGISTRY on `check`, skipping null. Every CheckKey is present; a check
 * with no signals (e.g. `lint`) maps to `[]`.
 */
export const CHECK_SIGNAL_MAP: Record<CheckKey, SignalName[]> = Object.fromEntries(
  CHECK_KEYS.map((key) => [
    key,
    SIGNAL_REGISTRY.filter((s) => s.check === key).map((s) => s.name),
  ])
) as Record<CheckKey, SignalName[]>;

/**
 * Pure reconciliation: for each check, `passed` stays true only if assess passed
 * AND no contradicting signal is present. Conjunction, monotonic toward fail —
 * never flips false -> true. Returns a new object; does not mutate `checks`.
 */
export function reconcilePassed<C extends Record<keyof C, { passed: boolean }>>(
  checks: C,
  signals: readonly string[]
): C {
  const present = new Set(signals);
  const result = {} as C;
  for (const key of Object.keys(checks) as (keyof C)[]) {
    const check = checks[key];
    // `key` comes from Object.keys(checks), so `check` is always defined; the
    // guard satisfies noUncheckedIndexedAccess without skipping any real entry.
    if (!check) continue;
    const contradicting = CHECK_SIGNAL_MAP[key as CheckKey] ?? [];
    const hasContradiction = contradicting.some((s) => present.has(s));
    result[key] = { ...check, passed: check.passed && !hasContradiction };
  }
  return result;
}
