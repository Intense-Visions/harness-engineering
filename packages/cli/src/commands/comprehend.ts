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
export type CompileScope =
  | { mode: 'changed'; changedModules?: string[] }
  | { mode: 'all' }
  | { mode: 'skip'; reason: string };

/**
 * S1: resolve the `--changed` compile scope from the git-derived surface.
 *
 * When derivation SUCCEEDS, scope is the changed-module set (possibly empty —
 * nothing changed). When derivation FAILS (`ok:false` — detached HEAD, no
 * merge-base, git error) `deriveChangedSurface` returns an empty file list, which
 * would silently compile NOTHING — a false "everything is fresh" that skips real
 * work.
 *
 * FIX E.2 — the failure posture depends on WHO invoked us:
 *  - Non-hook `--changed` (a human/CI running `harness comprehend --changed`):
 *    keep the existing behavior — warn loudly and promote to a full sweep (`--all`)
 *    rather than a silent no-op, so an explicit run still does real work.
 *  - Hook posture (`--hook`, an OPT-IN pre-commit step): SKIP instead of full-sweep.
 *    A commit on a detached HEAD (or any merge-base failure) must NEVER surprise the
 *    committer by recompiling the WHOLE repo on the commit path; skipping keeps the
 *    opt-in hook unobtrusive and non-blocking.
 */
export function resolveChangedScope(
  surface: ChangedSurface,
  log: { warn: (m: string) => void },
  opts: { hook?: boolean } = {}
): CompileScope {
  if (surface.ok) return { mode: 'changed', changedModules: filesToModules(surface.files) };
  const reason = surface.reason ?? 'git error';
  if (opts.hook) {
    log.warn(
      `comprehend: could not derive the changed surface (${reason}); ` +
        'skipping the pre-commit recompile (the hook never full-sweeps).'
    );
    return { mode: 'skip', reason };
  }
  log.warn(
    `comprehend: could not derive the changed surface (${reason}); ` +
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
 * FIX D — default `--stage` FORMAT seam: prettier-format the shard files in place
 * (respecting the repo's prettier config) BEFORE they are git-added. The pre-commit
 * `--stage` step runs AFTER lint-staged, so a freshly-written `_module.md` shard
 * would otherwise be committed UN-formatted and later trip the whole-tree
 * `format:check` on push (a known repo hazard). Formatting the shards here keeps
 * them clean without adding `.harness/comprehension` to `.prettierignore`.
 *
 * Best-effort per file and overall: prettier may be absent (adopter without it) or a
 * shard may be unreadable — either way we swallow and fall through to git-add, so a
 * recompile+stage never blocks a commit.
 */
async function defaultFormatPaths(paths: string[]): Promise<void> {
  try {
    const prettier = await import('prettier');
    const fs = await import('node:fs/promises');
    for (const p of paths) {
      try {
        const src = await fs.readFile(p, 'utf8');
        const config = await prettier.resolveConfig(p);
        const formatted = await prettier.format(src, { ...config, filepath: p });
        if (formatted !== src) await fs.writeFile(p, formatted);
      } catch {
        /* per-file best-effort — an unformattable/unreadable shard is left as-is */
      }
    }
  } catch {
    /* prettier unavailable ⇒ skip formatting entirely (never block the commit) */
  }
}

/**
 * SF1.2 — `--stage`: git-add the compiled units' shard paths so a static-only
 * pre-commit recompile lands the refreshed `_module.md` shards IN the same commit
 * as the source change. Stages EXACTLY the compiled modules' shards (`store.path`)
 * and is a no-op when nothing compiled (never shells out). FIX D: the shards are
 * prettier-formatted (in place) BEFORE the git-add so they cannot trip the
 * whole-tree `format:check`. Both the format and git calls are behind injectable
 * seams so tests never touch prettier or git.
 */
export async function stageCompiledUnits(
  result: Pick<ComprehendRunResult, 'compiled'>,
  store: { path: (module: string) => string },
  stage: (paths: string[]) => void = defaultStagePaths,
  format: (paths: string[]) => void | Promise<void> = defaultFormatPaths
): Promise<void> {
  if (result.compiled.length === 0) return;
  const paths = result.compiled.map((module) => store.path(module));
  await format(paths); // FIX D: prettier the shards BEFORE they are staged
  stage(paths);
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
  opts: { staticOnly?: boolean; stage?: boolean; hook?: boolean } = {}
): Promise<void> {
  const cconf = readComprehensionConfig(config);

  const scope =
    mode === 'changed'
      ? resolveChangedScope(deriveChangedSurface(projectRoot), logger, { hook: opts.hook ?? false })
      : { mode: 'all' as const };

  // FIX E.2: a hook-posture run whose changed-surface derivation failed SKIPS
  // (never a whole-repo full sweep on the commit path). Return before resolving a
  // provider or compiling anything.
  if (scope.mode === 'skip') {
    logger.info('comprehend: nothing to recompile (changed-surface derivation skipped).');
    process.exit(ExitCode.SUCCESS);
  }

  // SC4: static-only (`--static`) or semantic-disabled ⇒ no provider is resolved
  // — no credential, no LLM on the push/CI path.
  const provider = await resolveCompileProvider(cconf, opts.staticOnly ?? false);
  const generateSemantic = maybeCreateGenerateSemantic(provider, {
    maxTokensPerRun: cconf.maxTokensPerRun,
    ...(cconf.model ? { model: cconf.model } : {}),
  });

  const result = await runComprehend({
    mode: scope.mode,
    projectRoot,
    store,
    reader,
    makeExtractStatic: (module) => createStaticExtractor({ projectRoot, module }),
    ...(generateSemantic ? { generateSemantic } : {}),
    ...(scope.mode === 'changed' && scope.changedModules
      ? { changedModules: scope.changedModules }
      : {}),
    listModules: () => enumerateModules(projectRoot),
    concurrency: cconf.concurrency,
  });

  if (result.reentrancyRefused) {
    logger.warn('comprehend: a comprehension run is already active — refusing to re-enter.');
    process.exit(ExitCode.SUCCESS);
  }
  // Pre-commit posture: stage the refreshed shards so they land in the SAME
  // commit as the source change (no-op when nothing compiled). Prettier-formats
  // the shards before git-add (FIX D) so they never trip the whole-tree format:check.
  if (opts.stage) await stageCompiledUnits(result, store);
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
