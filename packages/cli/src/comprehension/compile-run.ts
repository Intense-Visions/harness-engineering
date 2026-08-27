/**
 * The `harness comprehend` driver — diff-scoped compile + write. IO-injected
 * (D5) so it is unit-testable with in-memory fakes and disk-free. The whole run
 * is wrapped in `withComprehensionActive` (run-boundary reentrancy): if a run is
 * already active on entry it refuses (no compile/write). Modules compile under a
 * bounded-concurrency pool; the per-run token budget lives in the phase-3
 * `generateSemantic` closure (shared across module calls). With no
 * `generateSemantic` the units are static-only (`semantic: absent`, SC4 — no
 * credential, no LLM).
 */

import {
  compileModule,
  serveGate,
  renderServedUnit,
  computeSourceHash,
  estimateTokens,
} from '@harness-engineering/core';
import type {
  ComprehensionSourceFile,
  ComprehensionListing,
  ComprehensionProvenance,
  ComprehensionUnit,
  ExtractStatic,
  GenerateSemantic,
  Result,
  SkippedUnit,
} from '@harness-engineering/core';
import { withComprehensionActive, isComprehensionReentrant } from './generate-semantic';

export interface ComprehendModuleReader {
  readModuleSource(module: string): Promise<ComprehensionSourceFile[] | null>;
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
   * where a recompile is requested, not incidental. A force-recompile of
   * unchanged source still preserves `compiledAt` (identical hash ⇒ no git churn).
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
  // git churn (spec proposal.md:384).
  const currentHash = computeSourceHash(sourceFiles);
  const existing = await opts.store.read(module);
  const prior = existing.ok ? existing.value.provenance : undefined;
  if (!opts.force && isReusableFresh(prior, currentHash, Boolean(opts.generateSemantic))) {
    return { kind: 'fresh', module };
  }

  const unit = await compileModule(module, sourceFiles, {
    extractStatic: opts.makeExtractStatic(module),
    ...(opts.generateSemantic ? { generateSemantic: opts.generateSemantic } : {}),
    // Preserve the prior `compiledAt` when the source is unchanged (a semantic
    // upgrade): the timestamp moves only when the sourceHash moves.
    ...(prior ? { prior: { sourceHash: prior.sourceHash, compiledAt: prior.compiledAt } } : {}),
  });
  const written = await opts.store.write(unit);
  if (!written.ok) {
    opts.logger?.warn(`comprehend: write failed for "${module}": ${written.error.message}`);
    return { kind: 'skipped', module };
  }
  return { kind: 'compiled', module, semantic: unit.provenance.semantic };
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

  const modules =
    opts.mode === 'changed'
      ? (opts.changedModules ?? [])
      : opts.listModules
        ? await opts.listModules()
        : [];

  const outcomes = await withComprehensionActive(
    () => mapWithConcurrency(modules, opts.concurrency ?? 4, (module) => compileOne(module, opts)),
    env
  );

  for (const o of outcomes) {
    if (o.kind === 'skipped') {
      base.skipped.push(o.module);
      continue;
    }
    if (o.kind === 'fresh') {
      base.fresh.push(o.module);
      continue;
    }
    base.compiled.push(o.module);
    if (o.semantic === 'present') base.semanticPresent++;
    else base.semanticAbsent++;
  }
  return base;
}

// --- --check (token-free freshness) + --stats (savings, SC6) ---------------

export interface ComprehendListStore {
  list(): Promise<Result<ComprehensionListing>>;
}

export interface ComprehendCheckResult {
  /** Modules whose committed unit is source-stale (recompile needed). */
  stale: string[];
  /** Units store.list() could not read/parse (surfaced, not silently dropped). */
  skipped: SkippedUnit[];
  /** True iff no unit is source-stale. */
  ok: boolean;
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
}): Promise<ComprehendCheckResult> {
  const listing = await opts.store.list();
  if (!listing.ok) {
    return {
      stale: [],
      skipped: [{ path: '<listing>', reason: listing.error.message }],
      ok: false,
    };
  }
  const stale: string[] = [];
  for (const unit of listing.value.units) {
    const verdict = await serveGate(unit, opts.reader);
    if (!verdict.serve) stale.push(verdict.module);
  }
  return { stale, skipped: listing.value.skipped, ok: stale.length === 0 };
}

export interface ComprehendStatsResult {
  rawTokens: number;
  servedTokens: number;
  savedTokens: number;
  /** Percentage saved vs raw (0 when raw is 0). */
  savedPct: number;
  /** Number of fresh (serveable) units counted. */
  units: number;
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
  return { rawTokens, servedTokens, savedTokens, savedPct, units };
}
