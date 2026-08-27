import { spawnSync } from 'node:child_process';
import { Command } from 'commander';
import {
  ComprehensionStore,
  createNodeComprehensionIO,
  createNodeModuleSourceReader,
} from '@harness-engineering/core';
import type { AnalysisProvider } from '@harness-engineering/intelligence';
import { resolveConfig } from '../config/loader';
import type { HarnessConfig } from '../config/schema';
import { readComprehensionConfig } from '../comprehension/config';
import { shouldRunComprehendHook } from '../comprehension/hook';
import type { ComprehensionConfig } from '../config/schema';
import { createStaticExtractor } from '../comprehension/static-extractor';
import { filesToModules, enumerateModules } from '../comprehension/invalidation';
import { maybeCreateGenerateSemantic } from '../comprehension/generate-semantic';
import {
  runComprehend,
  runComprehendCheck,
  runComprehendStats,
  type ComprehendRunResult,
} from '../comprehension/compile-run';
import { resolveAnalysisProvider } from '../mcp/utils/analysis-provider';
import { deriveChangedSurface, type ChangedSurface } from './validate-scope';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';

export type ComprehendMode = 'changed' | 'all' | 'check' | 'stats';

interface ComprehendFlags {
  changed?: boolean;
  all?: boolean;
  check?: boolean;
  stats?: boolean;
  /** SC4 — force static-only: never resolve a provider or call an LLM. */
  static?: boolean;
  /** git-add the compiled unit shards after a run (pre-commit posture). */
  stage?: boolean;
  /**
   * Pre-commit-hook posture: no-op (exit 0) unless the opt-in
   * `comprehension.hook` gate is enabled. Keeps the shell hook dumb.
   */
  hook?: boolean;
}

/** Resolve the run mode from the boolean flags: check > stats > all > changed. */
export function resolveMode(flags: ComprehendFlags): ComprehendMode {
  if (flags.check) return 'check';
  if (flags.stats) return 'stats';
  if (flags.all) return 'all';
  return 'changed';
}

/** Resolved compile scope: the effective run mode + optional changed-module set. */
export interface CompileScope {
  mode: 'changed' | 'all';
  changedModules?: string[];
}

/**
 * S1: resolve the `--changed` compile scope from the git-derived surface.
 *
 * When derivation SUCCEEDS, scope is the changed-module set (possibly empty —
 * nothing changed). When derivation FAILS (`ok:false` — detached HEAD, no
 * merge-base, git error) `deriveChangedSurface` returns an empty file list, which
 * would silently compile NOTHING — a false "everything is fresh" that skips real
 * work. Its own contract promises callers fall back to a full sweep, so we warn
 * loudly and promote the run to `--all` rather than a silent no-op.
 */
export function resolveChangedScope(
  surface: ChangedSurface,
  log: { warn: (m: string) => void }
): CompileScope {
  if (surface.ok) return { mode: 'changed', changedModules: filesToModules(surface.files) };
  log.warn(
    `comprehend: could not derive the changed surface (${surface.reason ?? 'git error'}); ` +
      'falling back to a full sweep (--all).'
  );
  return { mode: 'all' };
}

/**
 * SC4 — resolve the semantic provider for a compile run, or `null` for a
 * static-only run. A run is static-only when `--static` is set (the pre-commit /
 * CI posture) OR when `comprehension.semantic` is disabled; in BOTH cases the
 * provider resolver is NEVER invoked — no credential, no LLM on that path. The
 * resolver is injected (default: the real `resolveAnalysisProvider`) so the
 * decision is unit-testable with a spy that must stay uncalled under `--static`.
 */
export async function resolveCompileProvider(
  cconf: ComprehensionConfig,
  staticOnly: boolean,
  resolveProvider: (model?: string) => Promise<AnalysisProvider | null> = (model) =>
    resolveAnalysisProvider(model) as Promise<AnalysisProvider | null>
): Promise<AnalysisProvider | null> {
  if (staticOnly || !cconf.semantic) return null;
  return resolveProvider(cconf.model ?? undefined);
}

/**
 * Default `--stage` seam: `git add` the given unit shard paths. Passes EXPLICIT
 * posix paths (never a glob) so it is Windows-safe and cannot expand against the
 * cwd. Best-effort — a git failure is swallowed by the caller's non-blocking hook.
 */
function defaultStagePaths(paths: string[]): void {
  spawnSync('git', ['add', '--', ...paths], { stdio: 'ignore' });
}

/**
 * SF1.2 — `--stage`: git-add the compiled units' shard paths so a static-only
 * pre-commit recompile lands the refreshed `_module.md` shards IN the same commit
 * as the source change. Stages EXACTLY the compiled modules' shards (`store.path`)
 * and is a no-op when nothing compiled (never shells out). The git call is behind
 * an injectable seam so tests never touch git.
 */
export function stageCompiledUnits(
  result: Pick<ComprehendRunResult, 'compiled'>,
  store: { path: (module: string) => string },
  stage: (paths: string[]) => void = defaultStagePaths
): void {
  if (result.compiled.length === 0) return;
  stage(result.compiled.map((module) => store.path(module)));
}

/** Load the resolved HarnessConfig, or undefined when none resolves (best-effort). */
function loadHarnessConfig(configPath?: string): HarnessConfig | undefined {
  const resolved = resolveConfig(configPath);
  return resolved.ok ? resolved.value : undefined;
}

async function runCheckMode(
  store: ComprehensionStore,
  reader: ReturnType<typeof createNodeModuleSourceReader>
): Promise<void> {
  const result = await runComprehendCheck({ store, reader });
  for (const s of result.skipped) {
    logger.warn(`skipped ${s.path}: ${s.reason}`);
  }
  if (result.stale.length > 0) {
    logger.error(`${result.stale.length} source-stale unit(s): ${result.stale.join(', ')}`);
  } else {
    logger.success('All comprehension units are source-fresh.');
  }
  process.exit(result.ok ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
}

async function runStatsMode(
  store: ComprehensionStore,
  reader: ReturnType<typeof createNodeModuleSourceReader>
): Promise<void> {
  const stats = await runComprehendStats({ store, reader });
  logger.info(
    `${stats.units} fresh unit(s): raw≈${stats.rawTokens} tok, served≈${stats.servedTokens} tok, ` +
      `saved≈${stats.savedTokens} tok (${stats.savedPct.toFixed(1)}%).`
  );
  process.exit(ExitCode.SUCCESS);
}

async function runCompileMode(
  mode: 'changed' | 'all',
  projectRoot: string,
  store: ComprehensionStore,
  reader: ReturnType<typeof createNodeModuleSourceReader>,
  config: HarnessConfig | undefined,
  opts: { staticOnly?: boolean; stage?: boolean } = {}
): Promise<void> {
  const cconf = readComprehensionConfig(config);
  // SC4: static-only (`--static`) or semantic-disabled ⇒ no provider is resolved
  // — no credential, no LLM on the push/CI path.
  const provider = await resolveCompileProvider(cconf, opts.staticOnly ?? false);
  const generateSemantic = maybeCreateGenerateSemantic(provider, {
    maxTokensPerRun: cconf.maxTokensPerRun,
    ...(cconf.model ? { model: cconf.model } : {}),
  });

  const scope =
    mode === 'changed'
      ? resolveChangedScope(deriveChangedSurface(projectRoot), logger)
      : { mode: 'all' as const };

  const result = await runComprehend({
    mode: scope.mode,
    projectRoot,
    store,
    reader,
    makeExtractStatic: (module) => createStaticExtractor({ projectRoot, module }),
    ...(generateSemantic ? { generateSemantic } : {}),
    ...(scope.changedModules ? { changedModules: scope.changedModules } : {}),
    listModules: () => enumerateModules(projectRoot),
    concurrency: cconf.concurrency,
  });

  if (result.reentrancyRefused) {
    logger.warn('comprehend: a comprehension run is already active — refusing to re-enter.');
    process.exit(ExitCode.SUCCESS);
  }
  // Pre-commit posture: stage the refreshed shards so they land in the SAME
  // commit as the source change (no-op when nothing compiled).
  if (opts.stage) stageCompiledUnits(result, store);
  logger.success(
    `Compiled ${result.compiled.length} module(s): ` +
      `${result.semanticPresent} semantic, ${result.semanticAbsent} static-only` +
      (result.fresh.length > 0 ? `, ${result.fresh.length} fresh (skipped)` : '') +
      (result.skipped.length > 0 ? `, ${result.skipped.length} skipped` : '') +
      '.'
  );
  process.exit(ExitCode.SUCCESS);
}

async function runComprehendAction(
  mode: ComprehendMode,
  globalConfig?: string,
  opts: { staticOnly?: boolean; stage?: boolean; hook?: boolean } = {}
): Promise<void> {
  const projectRoot = process.cwd();
  const config = loadHarnessConfig(globalConfig);

  // Pre-commit-hook posture: no-op unless the opt-in gate is enabled, so the
  // shell hook can invoke unconditionally and the CLI owns the gating.
  if (opts.hook && !shouldRunComprehendHook(config)) {
    process.exit(ExitCode.SUCCESS);
  }

  const store = new ComprehensionStore({ io: createNodeComprehensionIO() });
  const reader = createNodeModuleSourceReader(projectRoot);

  if (mode === 'check') return runCheckMode(store, reader);
  if (mode === 'stats') return runStatsMode(store, reader);
  return runCompileMode(mode, projectRoot, store, reader, config, opts);
}

/**
 * `harness comprehend` — compile/maintain the per-module comprehension substrate.
 *
 * `--changed` (default) recompiles only the modules owning git-diff'd files (SC3);
 * `--all` backfills every module; `--check` is a token-free CI backstop that
 * reports source-stale units (exit non-zero); `--stats` reports served-vs-raw
 * token savings. All modules enumerate through the SAME canonical reader the serve
 * gate uses, so a freshly compiled unit serves immediately (hash-equal).
 */
export function createComprehendCommand(): Command {
  return new Command('comprehend')
    .description('Compile and maintain the per-module comprehension substrate')
    .option('--changed', 'Recompile only modules owning changed files (default)')
    .option('--all', 'Recompile every module (backfill)')
    .option('--check', 'Token-free: report source-stale units, exit non-zero if any')
    .option('--stats', 'Report served-vs-raw token savings (token-free)')
    .option(
      '--static',
      'Static-only: never resolve a provider or call an LLM (pre-commit/CI posture)'
    )
    .option('--stage', 'git-add the compiled unit shards after a run (pre-commit posture)')
    .option('--hook', 'Pre-commit-hook posture: no-op unless comprehension.hook is enabled')
    .action(async (opts: ComprehendFlags, cmd: Command) => {
      const mode = resolveMode(opts);
      const globalOpts = cmd.optsWithGlobals() as { config?: string };
      await runComprehendAction(mode, globalOpts.config, {
        staticOnly: opts.static ?? false,
        stage: opts.stage ?? false,
        hook: opts.hook ?? false,
      });
    });
}
