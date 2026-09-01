import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { glob } from 'glob';
import { skipDirGlobs } from '@harness-engineering/graph';
import type { CICheckName, CICheckResult, VerdictCacheStats } from '@harness-engineering/types';
import { computeSourceHash } from '../comprehension/source-hash';

/**
 * Content-addressed memoization cache for CI check verdicts (issue #1639) — an
 * action cache for gate results. Key each check by a content hash of its input
 * closure and return the stored verdict on an identical-input hit instead of
 * recomputing; on a miss, run and record. Opt-in, default OFF, local-only.
 *
 * Correct-by-construction: for the memoized checks (see {@link MEMOIZABLE_CHECKS})
 * the input closure is an honest *over-approximation* of what the check reads —
 * the whole tracked source/config/docs tree — so any change to a real input
 * changes the hash and forces a miss; a stale hit is impossible. It may over-miss
 * (an unrelated change busts the cache), which only wastes compute, never
 * correctness. Checks whose verdict also depends on state OUTSIDE that closure
 * (baselines/allowances/graph under `.harness`, or git base-ref history) are NOT
 * memoized at all, precisely because the tree hash is not a superset of their
 * inputs. Finer per-gate closures and the runtime access-recorder that would let
 * them opt in are deferred (see proposal / issue #1639).
 */

/** Resolved verdict-cache settings for one run. */
export interface VerdictCacheConfig {
  /** Master switch. Default false — cache is a no-op unless explicitly opted in. */
  enabled: boolean;
  /** Absolute directory the content-addressed entries are stored under. */
  dir: string;
}

/** Default location for cached verdict entries, relative to the project root. */
export const DEFAULT_VERDICT_CACHE_DIR = path.join('.harness', 'cache', 'verdicts');

/**
 * Per-check cache-schema version. Bump a check's number when its logic changes
 * in a way that could alter its verdict for unchanged inputs — that invalidates
 * every cached entry for the check by construction, independent of the input or
 * config hash. This is the "gate-version bumps miss by construction" invariant.
 */
export const GATE_VERSIONS: Record<CICheckName, number> = {
  validate: 1,
  deps: 1,
  docs: 1,
  entropy: 1,
  security: 1,
  perf: 1,
  'phase-gate': 1,
  arch: 1,
  traceability: 1,
};

/**
 * The checks safe to memoize under the current input closure. A check is
 * memoizable only when EVERYTHING that determines its verdict is covered by the
 * source/config/docs closure hash — otherwise it could return a stale hit,
 * violating the cardinal invariant. Two checks are deliberately EXCLUDED because
 * their verdict inputs live outside that closure:
 *
 * - `traceability` reads the derived graph under `.harness` (which the closure
 *   omits, see {@link computeProjectInputHash}), so a graph re-ingest with an
 *   unchanged source tree could serve a stale verdict.
 * - `arch` diffs against a baseline (`.harness/arch/baselines.json`) and per-PR
 *   allowances (also under `.harness`), and in a PR context resolves that
 *   baseline from the git BASE ref / `HARNESS_ARCH_BASE_REF` — none of which is
 *   a file in the working tree, so no tree hash can capture them. A regenerated
 *   baseline, a new allowance, or an advanced base ref changes the arch verdict
 *   with the source tree byte-identical.
 *
 * Non-memoizable checks always run and are never cached. Letting them opt in
 * needs the deferred per-gate closure declaration (folding the baseline/allowance
 * contents + base-ref SHA, or the graph digest, into the key) — issue #1639.
 */
export const MEMOIZABLE_CHECKS: ReadonlySet<CICheckName> = new Set<CICheckName>([
  'validate',
  'deps',
  'docs',
  'entropy',
  'security',
  'perf',
  'phase-gate',
]);

/**
 * Read the opt-in verdict-cache config from the raw project config. Shape:
 * `cache.verdicts.{ enabled?, dir? }`. Absent/malformed ⇒ disabled with the
 * default directory (a pure no-op, current behavior).
 */
export function parseVerdictCacheConfig(
  config: Record<string, unknown>,
  projectRoot: string
): VerdictCacheConfig {
  const cache = (config.cache as Record<string, unknown> | undefined) ?? {};
  const verdicts = (cache.verdicts as Record<string, unknown> | undefined) ?? {};
  const enabled = verdicts.enabled === true;
  const rawDir = typeof verdicts.dir === 'string' ? verdicts.dir : DEFAULT_VERDICT_CACHE_DIR;
  const dir = path.isAbsolute(rawDir) ? rawDir : path.join(projectRoot, rawDir);
  return { enabled, dir };
}

/**
 * Canonicalize an arbitrary JSON-ish value into a stable string: object keys are
 * sorted recursively so two configs that differ only in key order hash equal.
 * Non-plain values (functions, symbols) are dropped by JSON semantics.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = canonicalize(obj[key]);
    }
    return out;
  }
  return value;
}

/**
 * SHA-256 of the canonicalized effective config, EXCLUDING the cache's own
 * `cache` subtree (toggling the cache must not change other checks' keys — that
 * would guarantee a cold cache on the very run that turns it on). Any other
 * config change ⇒ a different hash ⇒ a miss by construction.
 */
export function computeConfigHash(config: Record<string, unknown>): string {
  const { cache: _cache, ...rest } = config;
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalize(rest)))
    .digest('hex');
}

/**
 * Extensions that make up the memoization input closure: source code across the
 * languages the checks scan, plus the config/doc formats they read. A broad,
 * safe superset — including a file a check never reads only costs extra misses.
 */
const INPUT_CLOSURE_GLOB =
  '**/*.{ts,tsx,js,jsx,mjs,cjs,cts,mts,py,rb,java,go,rs,php,cs,kt,swift,scala,md,mdx,json,jsonc,yaml,yml,toml}';

/**
 * Content hash of the project's tracked source/config/docs tree — the shared
 * input closure for every memoized check on a run. Reuses the membership +
 * content digest discipline of {@link computeSourceHash} (path-length-prefixed,
 * sorted, full SHA-256), so adding, removing, renaming, or editing any closure
 * file changes the hash.
 *
 * The `.harness` runtime dir (volatile state + the cache itself) and the usual
 * build/vendor dirs are excluded: hashing the cache's own entries would make the
 * hash self-referential (every write busts the next read), and hashing volatile
 * run state would drive the hit rate to zero. The consequence — that a check
 * reading state under `.harness` (the traceability graph, the arch baseline and
 * allowances) is not covered by this closure — is exactly why those checks are
 * excluded from {@link MEMOIZABLE_CHECKS} rather than served a possibly-stale
 * verdict. Dotfiles ARE hashed (`dot: true`) so a hidden source/config input
 * never silently drops out of the closure.
 */
export async function computeProjectInputHash(
  projectRoot: string,
  cacheDir: string,
  extraExcludes: string[] = []
): Promise<string> {
  const relCacheDir = path.relative(projectRoot, cacheDir).replaceAll('\\', '/');
  const ignore = [
    ...skipDirGlobs(),
    '**/.harness/**',
    // Exclude the cache dir explicitly in case it lives outside `.harness`.
    `${relCacheDir || '.'}/**`,
    ...extraExcludes,
  ];
  const matches = await glob(INPUT_CLOSURE_GLOB, {
    cwd: projectRoot,
    ignore,
    absolute: true,
    nodir: true,
    // Hash dotfiles too: the excludes above already drop `.git`/`.harness`/etc,
    // and omitting hidden source/config would be a silent closure gap.
    dot: true,
  });
  const files = matches
    .map((abs) => {
      let content: string;
      try {
        content = fs.readFileSync(abs, 'utf8');
      } catch {
        // A file that vanished between glob and read simply drops out of the
        // closure; its absence is itself reflected on the next run's membership.
        return undefined;
      }
      return { path: path.relative(projectRoot, abs).replaceAll('\\', '/'), content };
    })
    .filter((f): f is { path: string; content: string } => f !== undefined);
  return computeSourceHash(files);
}

/**
 * The content-addressed cache key for a check: SHA-256 over the canonical tuple
 * of (check identity × gate version × config hash × input hash). Any change to
 * any component yields a different key, so a stored verdict is returned only for
 * a byte-identical (check, logic, config, inputs) tuple.
 */
export function computeVerdictKey(params: {
  check: CICheckName;
  gateVersion: number;
  configHash: string;
  inputHash: string;
}): string {
  const canonical = JSON.stringify({
    check: params.check,
    gateVersion: params.gateVersion,
    configHash: params.configHash,
    inputHash: params.inputHash,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/** Envelope stored on disk for one cached verdict. */
interface VerdictCacheRecord {
  /** Store-schema version, so a format change can be ignored rather than misread. */
  schema: 1;
  /** The check this verdict is for (sanity cross-check against the key). */
  check: CICheckName;
  /** ISO timestamp the entry was written (diagnostics only). */
  storedAt: string;
  /** The memoized check result. */
  result: CICheckResult;
}

/**
 * A check result is safe to cache unless the check itself THREW — a thrown check
 * surfaces as an `error` issue whose message carries the orchestrator's sentinel
 * (`Check '<name>' threw:`). Such failures may be transient (a racing graph load,
 * a transient IO error), so memoizing one would durably pin a false failure.
 * Deterministic pass/fail verdicts are always cacheable.
 */
export function shouldCacheResult(result: CICheckResult): boolean {
  return !result.issues.some(
    (i) => i.severity === 'error' && i.message.startsWith(`Check '${result.name}' threw:`)
  );
}

/**
 * Local, content-addressed store of `{ key → CICheckResult }`, one JSON file per
 * key under {@link VerdictCacheConfig.dir}. Reads tolerate a missing or corrupt
 * entry by returning `undefined` (treated as a miss) rather than throwing, so a
 * damaged cache degrades to recomputation, never to a crash.
 */
export class VerdictCache {
  private readonly dir: string;

  constructor(config: VerdictCacheConfig) {
    this.dir = config.dir;
  }

  private entryPath(key: string): string {
    return path.join(this.dir, `${key}.json`);
  }

  /** Return the memoized result for `key`, or `undefined` on a miss / unreadable entry. */
  get(key: string): CICheckResult | undefined {
    let raw: string;
    try {
      raw = fs.readFileSync(this.entryPath(key), 'utf8');
    } catch {
      return undefined;
    }
    try {
      const record = JSON.parse(raw) as VerdictCacheRecord;
      if (record?.schema !== 1 || !record.result) return undefined;
      return record.result;
    } catch {
      // Corrupt entry — treat as a miss; it will be overwritten on the recompute.
      return undefined;
    }
  }

  /** Store `result` under `key`. Best-effort: a write failure never fails the run. */
  set(key: string, result: CICheckResult): void {
    if (!shouldCacheResult(result)) return;
    const record: VerdictCacheRecord = {
      schema: 1,
      check: result.name,
      storedAt: new Date().toISOString(),
      result,
    };
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      // Write to a unique temp file then atomically rename into place, so a
      // crash or a concurrent writer can never leave a half-written entry that
      // would read as corrupt (and always-miss) on the next run.
      const finalPath = this.entryPath(key);
      const tmpPath = `${finalPath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(record));
      fs.renameSync(tmpPath, finalPath);
    } catch {
      // A cache that cannot be written simply yields future misses.
    }
  }
}

/**
 * Accumulates per-check hit/miss outcomes across a run and renders the
 * {@link VerdictCacheStats} attached to the report.
 */
export class VerdictCacheStatsCollector {
  private readonly entries: VerdictCacheStats['entries'] = [];

  record(check: CICheckName, outcome: 'hit' | 'miss', key: string): void {
    this.entries.push({ check, outcome, key });
  }

  toStats(): VerdictCacheStats {
    return {
      enabled: true,
      hits: this.entries.filter((e) => e.outcome === 'hit').length,
      misses: this.entries.filter((e) => e.outcome === 'miss').length,
      entries: [...this.entries],
    };
  }
}
