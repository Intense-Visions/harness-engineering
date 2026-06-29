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
 * Parallel-safety category for a health signal. A `null` category marks a
 * signal that the dispatch engine never groups for parallel safety (metrics-only
 * or otherwise uncategorized). See SC4: this is single-sourced here in core; the
 * cli derives `SIGNAL_CATEGORIES` from `SIGNAL_CATEGORY_MAP`.
 */
export type SignalCategory = 'structure' | 'quality' | 'security' | 'performance' | 'coverage';

/**
 * THE single source of truth. `check: null` marks a metrics-only signal that
 * maps to no check (it must never affect any `passed` flag). `category` is the
 * parallel-safety bucket (null = uncategorized); it is INDEPENDENT of `check`.
 *
 * Order matters: `HEALTH_SIGNAL_NAMES` (and therefore the cli's `HEALTH_SIGNALS`
 * health portion) is derived from this array in declaration order.
 */
export const SIGNAL_REGISTRY = [
  { name: 'circular-deps', check: 'deps', category: 'structure' },
  { name: 'layer-violations', check: 'deps', category: 'structure' },
  { name: 'high-coupling', check: null, category: 'structure' },
  { name: 'high-complexity', check: null, category: null },
  { name: 'low-coverage', check: null, category: 'coverage' },
  { name: 'dead-code', check: 'entropy', category: 'quality' },
  { name: 'drift', check: 'entropy', category: 'quality' },
  { name: 'security-findings', check: 'security', category: 'security' },
  { name: 'doc-gaps', check: 'docs', category: 'quality' },
  { name: 'perf-regression', check: 'perf', category: 'performance' },
  { name: 'anomaly-outlier', check: null, category: null },
  { name: 'articulation-point', check: null, category: null },
] as const satisfies ReadonlyArray<{
  name: string;
  check: CheckKey | null;
  category: SignalCategory | null;
}>;

export type SignalName = (typeof SIGNAL_REGISTRY)[number]['name'];

/**
 * Derived: the ordered list of all health-signal names. The cli spreads this
 * into its `HEALTH_SIGNALS` const (followed by its cli-local change/domain
 * signals) so the health vocabulary is never hand-maintained twice.
 */
export const HEALTH_SIGNAL_NAMES: readonly SignalName[] = SIGNAL_REGISTRY.map((s) => s.name);

/**
 * Derived: check -> contradicting signal names (many-to-one). Built by grouping
 * SIGNAL_REGISTRY on `check`, skipping null. Every CheckKey is present; a check
 * with no signals (e.g. `lint`) maps to `[]`.
 */
export const CHECK_SIGNAL_MAP: Record<CheckKey, SignalName[]> = Object.fromEntries(
  CHECK_KEYS.map((key) => [key, SIGNAL_REGISTRY.filter((s) => s.check === key).map((s) => s.name)])
) as Record<CheckKey, SignalName[]>;

/**
 * Derived: signal name -> parallel-safety category, EXCLUDING signals whose
 * `category` is null. Built by filtering SIGNAL_REGISTRY on a non-null category.
 * This is the single source the cli re-exports as `SIGNAL_CATEGORIES`; a signal
 * absent here (e.g. high-complexity, anomaly-outlier, articulation-point, or any
 * change/domain signal) is uncategorized and `getSignalCategory` returns null.
 */
export const SIGNAL_CATEGORY_MAP: Record<string, SignalCategory> = Object.fromEntries(
  SIGNAL_REGISTRY.filter(
    (s): s is typeof s & { category: SignalCategory } => s.category !== null
  ).map((s) => [s.name, s.category])
);

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
