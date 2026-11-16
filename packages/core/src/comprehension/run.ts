/**
 * The comprehension driver — diff-scoped compile + write. IO-injected (D5) so it
 * is unit-testable with in-memory fakes and disk-free. The whole run is wrapped
 * in `withComprehensionActive` (run-boundary reentrancy): if a run is already
 * active on entry it refuses (no compile/write). Modules compile under a
 * bounded-concurrency pool; the per-run token budget lives in the
 * `generateSemantic` closure (shared across module calls). With no
 * `generateSemantic` the units are static-only (`semantic: absent`, SC4 — no
 * credential, no LLM).
 *
 * Promoted into core (from the cli's `harness comprehend` command) so library
 * consumers drive the substrate through the same orchestration the CLI does.
 */

import { compileModule } from './compile';
import { serveGate } from './serve-gate';
import { renderServedUnit } from './render';
import { computeSourceHash } from './source-hash';
import { estimateTokens } from '../compaction/envelope';
import { withComprehensionActive, isComprehensionReentrant } from './reentrancy';
import type {
  SourceFile as ComprehensionSourceFile,
  ComprehensionProvenance,
  ComprehensionUnit,
  ExtractStatic,
  GenerateSemantic,
  ModuleIdentity,
} from './types';
import type { ComprehensionListing, SkippedUnit } from './store';
import type { Result } from '../shared/result';

export interface ComprehendModuleReader {
  readModuleSource(module: string): Promise<ComprehensionSourceFile[] | null>;
  /**
   * OPTIONAL (#319): the FULL-module source identity, for a reader that compiles from a lossy
   * SUBSET (e.g. scrub-blocked members dropped). Returns the sourceHash/members over the full
   * ORIGINAL member set plus the excluded basenames, so the compiled unit's provenance describes
   * the WHOLE module and a serve-time hash over the working tree still matches. Called per module
   * right after {@link readModuleSource} (a reader may compute both from one fetch and cache this).
   * Absent, or resolving `undefined`, ⇒ hash/members are derived from the returned files — a
   * complete unit, today's byte-identical behavior.
   */
  readModuleIdentity?(module: string): Promise<ModuleIdentity | undefined>;
}

export interface ComprehendUnitStore {
  write(unit: ComprehensionUnit): Promise<Result<void>>;
  /**
   * Read the committed unit for a module, or `Err` when absent/unreadable. Used
   * by the C1 freshness gate to skip recompiling an already-fresh unit — an
   * `Err` (not-found) simply means "compile it".
   */
  read(module: string): Promise<Result<ComprehensionUnit>>;
}

export interface ComprehendRunOptions {
  mode: 'changed' | 'all';
  projectRoot: string;
  reader: ComprehendModuleReader;
  store: ComprehendUnitStore;
  /** Per-module static-extractor factory (module-bound). */
  makeExtractStatic: (module: string) => ExtractStatic;
  /** Optional semantic half; absent ⇒ static-only (SC4). */
  generateSemantic?: GenerateSemantic;
  /** Required for `mode: 'changed'` — the changed-module set (SC3). */
  changedModules?: string[];
  /** Required for `mode: 'all'` — enumerates every module. */
  listModules?: () => Promise<string[]>;
  /** Bounded module concurrency (default 4). */
  concurrency?: number;
  /**
   * Bypass the C1 skip-if-fresh gate and recompile even an already-fresh unit.
   * Default false (skip-if-fresh preserved — no churn on the push/CI/serve path).
   * Set ONLY for an explicit leaf demand (`get_comprehension` forceRecompile),
   * where a recompile is requested, not incidental. A force-recompile of unchanged
   * source is byte-stable (ADR 0109 — no wall-clock in the shard, so identical
   * source ⇒ identical bytes ⇒ no git churn).
   */
  force?: boolean;
  /** Injected env for the reentrancy guard (defaults to process.env). */
  env?: NodeJS.ProcessEnv;
  logger?: { warn: (m: string) => void };
}

export interface ComprehendRunResult {
  mode: string;
  compiled: string[];
  semanticPresent: number;
  semanticAbsent: number;
  skipped: string[];
  /**
   * C1: modules skipped because their committed unit is already source-fresh (and
   * semantically sufficient for this run) — neither recompiled nor re-written, so
   * no git churn and no provider cost. Distinct from `skipped` (missing source /
   * write failure), which is a degraded outcome.
   */
  fresh: string[];
  reentrancyRefused?: boolean;
}

/**
 * Bounded-concurrency map preserving input order. Peak in-flight never exceeds
 * `limit` (a fixed worker pool draining a shared cursor).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Math.max(1, Math.min(limit, items.length || 1));
  const run = async (): Promise<void> => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i] as T, i);
    }
  };
  await Promise.all(Array.from({ length: workers }, run));
  return results;
}

/** Per-module compile outcome, aggregated in input order after the pool drains. */
type ModuleOutcome =
  | { kind: 'compiled'; module: string; semantic: 'present' | 'absent' }
  | { kind: 'fresh'; module: string }
  | { kind: 'skipped'; module: string };

/**
 * C1 — is the committed unit already fresh enough to skip a recompile? Fresh iff
 * its `sourceHash` matches the just-computed one AND it is semantically
 * sufficient for this run: a static-only run (no `generateSemantic`) needs no
 * semantic, and a semantic run is satisfied only when the unit already has
 * `semantic:present` (a `semantic:absent` unit must recompile to add it).
 */
function isReusableFresh(
  prior: ComprehensionProvenance | undefined,
  currentHash: string,
  runAddsSemantic: boolean
): boolean {
  if (!prior || prior.sourceHash !== currentHash) return false;
  return !runAddsSemantic || prior.semantic === 'present';
}

async function compileOne(module: string, opts: ComprehendRunOptions): Promise<ModuleOutcome> {
  const sourceFiles = await opts.reader.readModuleSource(module);
  if (!sourceFiles) return { kind: 'skipped', module };

  // C1 — "fresh units never re-run". Compute the current hash from EXACTLY the
  // files the compile would use (the canonical reader's output), so the freshness
  // check can never diverge from the compile-time hash. When the committed unit is
  // already fresh, skip entirely — no recompile, no write, no provider call, no
  // git churn.
  // #319: a reader that compiled from a lossy subset supplies the FULL-module identity so the
  // freshness hash + the unit provenance describe the whole module (parity with a serve-time hash
  // over the working tree). Absent ⇒ derive from the subset — today's behavior.
  const identity = await opts.reader.readModuleIdentity?.(module);
  const currentHash = identity?.sourceHash ?? computeSourceHash(sourceFiles);
  const existing = await opts.store.read(module);
  const prior = existing.ok ? existing.value.provenance : undefined;
  if (!opts.force && isReusableFresh(prior, currentHash, Boolean(opts.generateSemantic))) {
    return { kind: 'fresh', module };
  }

  const unit = await compileModule(module, sourceFiles, {
    extractStatic: opts.makeExtractStatic(module),
    ...(opts.generateSemantic ? { generateSemantic: opts.generateSemantic } : {}),
    ...(identity ? { provenance: identity } : {}),
  });
  const written = await opts.store.write(unit);
  if (!written.ok) {
    opts.logger?.warn(`comprehend: write failed for "${module}": ${written.error.message}`);
    return { kind: 'skipped', module };
  }
  return { kind: 'compiled', module, semantic: unit.provenance.semantic };
}

/** Resolve the module set for this run: the changed set, or the full enumeration. */
async function resolveModules(opts: ComprehendRunOptions): Promise<string[]> {
  if (opts.mode === 'changed') return opts.changedModules ?? [];
  return opts.listModules ? opts.listModules() : [];
}

/** Fold per-module outcomes into the result tally (compiled / fresh / skipped). */
function tallyOutcomes(outcomes: readonly ModuleOutcome[], base: ComprehendRunResult): void {
  for (const o of outcomes) {
    if (o.kind === 'skipped') {
      base.skipped.push(o.module);
    } else if (o.kind === 'fresh') {
      base.fresh.push(o.module);
    } else {
      base.compiled.push(o.module);
      if (o.semantic === 'present') base.semanticPresent++;
      else base.semanticAbsent++;
    }
  }
}

/**
 * Compile + write the resolved module set. Refuses when already reentrant; wraps
 * the compile loop in `withComprehensionActive` so the semantic seam sees an
 * active run; tallies static-only vs semantic units.
 */
export async function runComprehend(opts: ComprehendRunOptions): Promise<ComprehendRunResult> {
  const env = opts.env ?? process.env;
  const base: ComprehendRunResult = {
    mode: opts.mode,
    compiled: [],
    semanticPresent: 0,
    semanticAbsent: 0,
    skipped: [],
    fresh: [],
  };

  if (isComprehensionReentrant(env)) {
    return { ...base, reentrancyRefused: true };
  }

  const modules = await resolveModules(opts);
  const outcomes = await withComprehensionActive(
    () => mapWithConcurrency(modules, opts.concurrency ?? 4, (module) => compileOne(module, opts)),
    env
  );
  tallyOutcomes(outcomes, base);
  return base;
}

// --- --check (token-free freshness) + --stats (savings, SC6) ---------------

export interface ComprehendListStore {
  list(): Promise<Result<ComprehensionListing>>;
}

/**
 * #2063 — the committed substrate's semantic coverage: how many units carry the
 * LLM-generated semantic half (`semantic: present`) versus static-only
 * (`semantic: absent`). Counted over EVERY parseable committed unit, fresh or
 * stale — a stale unit is still committed debt. Reporting-only: nothing here
 * decides a verdict (the CLI owns any warning/threshold).
 */
export interface SemanticCoverage {
  total: number;
  present: number;
  absent: number;
  /** `absent / total` as a fraction in [0, 1]; 0 (never NaN) for an empty substrate. */
  absentRatio: number;
}

/** Pure tally of {@link SemanticCoverage} over a set of committed units (#2063). */
export function summarizeSemanticCoverage(
  units: readonly Pick<ComprehensionUnit, 'provenance'>[]
): SemanticCoverage {
  let present = 0;
  for (const unit of units) if (unit.provenance.semantic === 'present') present++;
  const total = units.length;
  const absent = total - present;
  return { total, present, absent, absentRatio: total > 0 ? absent / total : 0 };
}

export interface ComprehendCheckResult {
  /** Modules whose committed unit is source-stale (recompile needed). */
  stale: string[];
  /**
   * #2578 — modules whose committed unit has no enumerable module any more (the
   * directory was deleted, or it is one `--all` never walks, e.g. a git-ignored
   * dot-directory cache). Recompiling cannot clear these; `--prune` deletes them.
   * Disjoint from `stale`. Always `[]` when `listModules` is not supplied.
   */
  orphans: string[];
  /** Units store.list() could not read/parse (surfaced, not silently dropped). */
  skipped: SkippedUnit[];
  /** True iff no unit is source-stale and no unit is an orphan. */
  ok: boolean;
  /** #2063 — semantic present/absent coverage of the committed substrate (advisory). */
  semantic: SemanticCoverage;
}

/**
 * `--check`: the token-free CI backstop. Recomputes each committed unit's
 * `sourceHash` via the canonical reader (reusing core `serveGate`), reports every
 * source-stale unit plus any unreadable/unparseable `skipped` unit, NEVER calls
 * an LLM and NEVER writes. `ok` is false when any unit is source-stale — the
 * caller exits non-zero. When `store.list()` itself fails, the run is reported
 * `ok:false` with the enumeration error surfaced as a skipped entry.
 */
export async function runComprehendCheck(opts: {
  store: ComprehendListStore;
  reader: ComprehendModuleReader;
  /**
   * #2578 — the canonical module enumerator (the one `--all` uses). When given, a
   * unit whose module it does not return is reported as an ORPHAN instead of being
   * hash-checked. Token-free: enumeration only.
   */
  listModules?: () => Promise<string[]>;
}): Promise<ComprehendCheckResult> {
  const listing = await opts.store.list();
  if (!listing.ok) {
    return {
      stale: [],
      orphans: [],
      skipped: [{ path: '<listing>', reason: listing.error.message }],
      ok: false,
      semantic: summarizeSemanticCoverage([]),
    };
  }
  const orphanSet = opts.listModules
    ? new Set(findOrphanModules(listing.value.units, await opts.listModules()))
    : new Set<string>();
  const stale: string[] = [];
  for (const unit of listing.value.units) {
    if (orphanSet.has(unit.provenance.module)) continue;
    const verdict = await serveGate(unit, opts.reader);
    if (!verdict.serve) stale.push(verdict.module);
  }
  const orphans = [...orphanSet];
  return {
    stale,
    orphans,
    skipped: listing.value.skipped,
    ok: stale.length === 0 && orphans.length === 0,
    semantic: summarizeSemanticCoverage(listing.value.units),
  };
}

/**
 * #2578 — the modules of committed `units` that are absent from `enumerable` (the
 * canonical `--all` module set): orphans no recompile can refresh. Sorted,
 * de-duplicated, posix. Pure.
 */
export function findOrphanModules(
  units: readonly ComprehensionUnit[],
  enumerable: readonly string[]
): string[] {
  const live = new Set(enumerable.map((m) => m.replaceAll('\\', '/')));
  const orphans = new Set<string>();
  for (const unit of units) {
    const module = unit.provenance.module.replaceAll('\\', '/');
    if (!live.has(module)) orphans.add(module);
  }
  return [...orphans].sort();
}

export interface ComprehendStatsResult {
  rawTokens: number;
  servedTokens: number;
  savedTokens: number;
  /** Percentage saved vs raw (0 when raw is 0). */
  savedPct: number;
  /** Number of fresh (serveable) units counted. */
  units: number;
  /**
   * #2063 — semantic present/absent coverage over ALL committed units (fresh or
   * stale), unlike the savings figures above which count fresh units only.
   */
  semantic: SemanticCoverage;
}

/**
 * `--stats`: report the served-unit token estimate vs the raw-source token
 * estimate and the saved delta/percent across fresh units. Token-free: it reads
 * only committed units and current source via the canonical reader, and renders
 * the served form with `renderServedUnit`. Only fresh (serveable) units count —
 * a stale unit's served form would not be what a consumer receives.
 */
export async function runComprehendStats(opts: {
  store: ComprehendListStore;
  reader: ComprehendModuleReader;
}): Promise<ComprehendStatsResult> {
  const listing = await opts.store.list();
  let rawTokens = 0;
  let servedTokens = 0;
  let units = 0;
  if (listing.ok) {
    for (const unit of listing.value.units) {
      const verdict = await serveGate(unit, opts.reader);
      if (!verdict.serve) continue;
      const source = await opts.reader.readModuleSource(unit.provenance.module);
      if (!source) continue;
      rawTokens += estimateTokens(source.map((f) => f.content).join('\n'));
      servedTokens += estimateTokens(renderServedUnit(unit));
      units++;
    }
  }
  const savedTokens = rawTokens - servedTokens;
  const savedPct = rawTokens > 0 ? (savedTokens / rawTokens) * 100 : 0;
  const semantic = summarizeSemanticCoverage(listing.ok ? listing.value.units : []);
  return { rawTokens, servedTokens, savedTokens, savedPct, units, semantic };
}
