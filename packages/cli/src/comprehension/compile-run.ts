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

import { compileModule, serveGate, renderServedUnit } from '@harness-engineering/core';
import type {
  ComprehensionSourceFile,
  ComprehensionListing,
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
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: workers }, run));
  return results;
}

/** Per-module compile outcome, aggregated in input order after the pool drains. */
type ModuleOutcome =
  | { kind: 'compiled'; module: string; semantic: 'present' | 'absent' }
  | { kind: 'skipped'; module: string };

async function compileOne(module: string, opts: ComprehendRunOptions): Promise<ModuleOutcome> {
  const sourceFiles = await opts.reader.readModuleSource(module);
  if (!sourceFiles) return { kind: 'skipped', module };
  const unit = await compileModule(module, sourceFiles, {
    extractStatic: opts.makeExtractStatic(module),
    ...(opts.generateSemantic ? { generateSemantic: opts.generateSemantic } : {}),
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

/** Self-contained, approximate token estimate (~4 chars/token). No telemetry. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
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
