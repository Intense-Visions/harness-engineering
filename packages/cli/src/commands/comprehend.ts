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
import { createStaticExtractor } from '../comprehension/static-extractor';
import { filesToModules, enumerateModules } from '../comprehension/invalidation';
import { maybeCreateGenerateSemantic } from '../comprehension/generate-semantic';
import {
  runComprehend,
  runComprehendCheck,
  runComprehendStats,
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
  config: HarnessConfig | undefined
): Promise<void> {
  const cconf = readComprehensionConfig(config);
  // SC4: only resolve a provider when semantic is enabled; else static-only.
  const provider = cconf.semantic
    ? ((await resolveAnalysisProvider(cconf.model ?? undefined)) as AnalysisProvider | null)
    : null;
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
  logger.success(
    `Compiled ${result.compiled.length} module(s): ` +
      `${result.semanticPresent} semantic, ${result.semanticAbsent} static-only` +
      (result.fresh.length > 0 ? `, ${result.fresh.length} fresh (skipped)` : '') +
      (result.skipped.length > 0 ? `, ${result.skipped.length} skipped` : '') +
      '.'
  );
  process.exit(ExitCode.SUCCESS);
}

async function runComprehendAction(mode: ComprehendMode, globalConfig?: string): Promise<void> {
  const projectRoot = process.cwd();
  const config = loadHarnessConfig(globalConfig);
  const store = new ComprehensionStore({ io: createNodeComprehensionIO() });
  const reader = createNodeModuleSourceReader(projectRoot);

  if (mode === 'check') return runCheckMode(store, reader);
  if (mode === 'stats') return runStatsMode(store, reader);
  return runCompileMode(mode, projectRoot, store, reader, config);
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
    .action(async (opts: ComprehendFlags, cmd: Command) => {
      const mode = resolveMode(opts);
      const globalOpts = cmd.optsWithGlobals() as { config?: string };
      await runComprehendAction(mode, globalOpts.config);
    });
}
