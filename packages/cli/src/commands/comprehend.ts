import { spawnSync } from 'node:child_process';
import { Command } from 'commander';
import {
  ComprehensionStore,
  COMPREHENSION_ROOT,
  createNodeComprehensionIO,
  createNodeModuleSourceReader,
} from '@harness-engineering/core';
import type { AnalysisProvider } from '@harness-engineering/intelligence';
import { resolveConfig } from '../config/loader';
import type { HarnessConfig } from '../config/schema';
import {
  readComprehensionConfig,
  comprehensionEndpoint,
  comprehensionCli,
  selectSemanticModel,
  resolveComprehensionCiMode,
} from '../comprehension/config';
import { shouldRunComprehendHook } from '../comprehension/hook';
import { committedSemanticAllowed } from '../comprehension/policy';
import {
  resolveRefreshJobGate,
  explainInactiveRefreshGate,
  type RefreshJobGateReason,
} from '../comprehension/refresh-gate';
import {
  detectSemanticRegressions,
  detectCommittedSemanticOnBranch,
  readSemanticMapAtRef,
  defaultRefReadDeps,
  type RegressionContext,
} from '../comprehension/regression';
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

export type ComprehendMode = 'changed' | 'all' | 'check' | 'stats' | 'refresh';

interface ComprehendFlags {
  changed?: boolean;
  all?: boolean;
  check?: boolean;
  stats?: boolean;
  /**
   * #1689 / ADR 0116 §3 — the opt-in token-gated CI **refresh** entrypoint. On the
   * single-writer main-pass with a provider credential AND `comprehension.ci:
   * refresh` configured, regenerate + stage committed semantic (the automated
   * equivalent of the maintainer-local `comprehend --all`). A clean no-op (exit 0)
   * on every other configuration — off by default, never reds a merge.
   */
  refresh?: boolean;
  /**
   * With `--check`: also fail when any module regressed `semantic: present →
   * absent` versus this git ref (ADR 0109 slice 4). Token-free — frontmatter reads
   * only. A red result means "regenerate locally and push," never "CI needs a key".
   */
  since?: string;
  /**
   * ADR 0116 §4 — which path the `--since` regression gate guards. `'main'`
   * (default, post-merge): `present → absent` is a real regression. `'pr'` (the
   * static-only PR path): `present → absent` is EXPECTED, never flagged.
   */
  context?: RegressionContext;
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

/** Resolve the run mode from the boolean flags: refresh > check > stats > all > changed. */
export function resolveMode(flags: ComprehendFlags): ComprehendMode {
  if (flags.refresh) return 'refresh';
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
  // ADR 0109 slice 3 — the default resolver threads a config-declared
  // OpenAI-compatible endpoint so the backstop is provider-neutral (any vendor via
  // its gateway) without an Anthropic key or orchestrator env. Env stays the
  // fallback inside `resolveAnalysisProvider`.
  resolveProvider: (model?: string) => Promise<AnalysisProvider | null> = (model) =>
    resolveAnalysisProvider(model, {
      endpoint: comprehensionEndpoint(cconf),
      ...(comprehensionCli(cconf) ? { cli: comprehensionCli(cconf)! } : {}),
    }) as Promise<AnalysisProvider | null>
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
 * FIX #1697 — prettier-format the freshly-written shards for a compile run
 * REGARDLESS of the `--stage` path. Write-time formatting used to live ONLY inside
 * `stageCompiledUnits` (the pre-commit `--stage`/hook posture), so a bulk
 * `harness comprehend --all` (or any non-stage run) followed by a manual
 * `git add` + commit landed RAW, double-quoted shards that an adopter's own
 * prettier-on-markdown lint-staged step then reflows at commit time — producing
 * the "dribble" (a rotating handful of shards left modified-but-uncommitted after
 * every commit) and a whole-tree `format:check` risk on push. Applying the same
 * format step here makes shard formatting PATH-INDEPENDENT: every freshly-compiled
 * shard lands already prettier-stable no matter how it was produced. No-op when
 * nothing compiled; best-effort (the `format` seam swallows its own errors, so a
 * missing prettier or an unreadable shard never blocks the run).
 */
export async function formatCompiledUnits(
  result: Pick<ComprehendRunResult, 'compiled'>,
  store: { path: (module: string) => string },
  format: (paths: string[]) => void | Promise<void> = defaultFormatPaths
): Promise<void> {
  if (result.compiled.length === 0) return;
  await format(result.compiled.map((module) => store.path(module)));
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
  await formatCompiledUnits(result, store, format); // FIX D: prettier the shards BEFORE staging
  stage(result.compiled.map((module) => store.path(module)));
}

/** Load the resolved HarnessConfig, or undefined when none resolves (best-effort). */
function loadHarnessConfig(configPath?: string): HarnessConfig | undefined {
  const resolved = resolveConfig(configPath);
  return resolved.ok ? resolved.value : undefined;
}

async function runCheckMode(
  store: ComprehensionStore,
  reader: ReturnType<typeof createNodeModuleSourceReader>,
  opts: {
    projectRoot: string;
    since?: string;
    context?: RegressionContext;
    config?: HarnessConfig | undefined;
  } = { projectRoot: process.cwd() }
): Promise<void> {
  // ADR 0116 §2 — consume the (previously dormant) `comprehension.ci` seam.
  const ciMode = resolveComprehensionCiMode(opts.config);
  if (ciMode === 'off') {
    logger.info('comprehension.ci: off — the comprehension gate is disabled (ADR 0116 §2).');
    process.exit(ExitCode.SUCCESS);
  }

  const result = await runComprehendCheck({ store, reader });
  for (const s of result.skipped) {
    logger.warn(`skipped ${s.path}: ${s.reason}`);
  }
  if (result.stale.length > 0) {
    logger.error(`${result.stale.length} source-stale unit(s): ${result.stale.join(', ')}`);
  } else {
    logger.success('All comprehension units are source-fresh.');
  }

  // ADR 0109 slice 4 / ADR 0116 §4 — token-free semantic-regression gate vs a base
  // ref. Base and head are read the SAME way (committed shards via git + lenient
  // frontmatter parse), so a shard cannot be counted as "present" on one side and
  // dropped on the other. An unreadable ref fails LOUD — never a silent pass.
  //
  // The `context` reframes WHAT is a regression (ADR 0116 §4):
  //  - `'main'` (default, post-merge): `present → absent` means `main` LOST
  //    semantic — a real regression the single-writer main-pass must never produce.
  //  - `'pr'` (the static-only PR path): `present → absent` is EXPECTED (semantic
  //    deferred to `main`) and NEVER a regression — killing the per-PR false
  //    positive. Instead we advisory-warn on any committed-semantic ADDITION, which
  //    a static-only PR should not carry (single-writer, ADR 0116 §1).
  const context: RegressionContext = opts.context ?? 'main';
  let regressed: string[] = [];
  let refUnreadable = false;
  if (opts.since) {
    const deps = defaultRefReadDeps(opts.projectRoot);
    const base = readSemanticMapAtRef(opts.since, deps);
    const head = readSemanticMapAtRef('HEAD', deps);
    if (base === null || head === null) {
      refUnreadable = true;
      const which = base === null ? `base ref '${opts.since}'` : "'HEAD'";
      logger.error(
        `Could not read ${which} for the semantic-regression check (unfetched / bad ref / ` +
          `git error). Refusing to report a pass — fetch the ref and re-run.`
      );
    } else {
      regressed = detectSemanticRegressions(base, head, context);
      if (context === 'pr') {
        const committed = detectCommittedSemanticOnBranch(base, head);
        if (committed.length > 0) {
          logger.warn(
            `${committed.length} module(s) COMMITTED semantic on a branch vs ${opts.since}: ` +
              `${committed.join(', ')}. Under single-writer (ADR 0116 §1) PRs are static-only — ` +
              `semantic belongs to the \`main\` main-pass. This is advisory (not a failure).`
          );
        }
        logger.success(
          `Static-only PR path: \`present → absent\` is expected (semantic deferred to \`main\`, ` +
            `ADR 0116 §4) — no semantic regression flagged.`
        );
      } else if (regressed.length > 0) {
        logger.error(
          `${regressed.length} module(s) regressed semantic present→absent on \`main\` vs ` +
            `${opts.since}: ${regressed.join(', ')}. The single-writer main-pass must never lose ` +
            `semantic — regenerate (provider-backed 'harness comprehend --all') and commit to main.`
        );
      } else {
        logger.success(`No semantic regressions on \`main\` vs ${opts.since}.`);
      }
    }
  }

  // ADR 0116 §2 — refresh main-pass seam (best-effort; never changes the verdict).
  if (ciMode === 'refresh') {
    const cconf = readComprehensionConfig(opts.config);
    await runRefreshMainPass(opts.projectRoot, store, reader, cconf, opts.since);
  }

  const ok = result.ok && regressed.length === 0 && !refUnreadable;
  process.exit(ok ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
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

/**
 * ADR 0116 §1 — resolve whether THIS compile run may write COMMITTED semantic.
 * A run is static-only when `--static` / `semantic:false` (the existing SC4
 * posture) OR when this is NOT the main-pass (the PR path): on a feature branch,
 * semantic is deferred to the `main` main-pass, so the provider is never resolved
 * and only the deterministic static skeleton is (re)written — the byte-stable half
 * that cannot conflict. Returns the effective static-only flag plus whether the
 * downgrade was policy-driven (so the caller can explain it once). Pure.
 */
export function resolveStaticOnlyPosture(
  cconf: ComprehensionConfig,
  requestedStatic: boolean,
  isMainPass: boolean
): { staticOnly: boolean; deferredToMain: boolean } {
  if (requestedStatic || !cconf.semantic) return { staticOnly: true, deferredToMain: false };
  // Semantic WOULD be generated, but the single-writer policy suppresses committed
  // semantic off the main-pass ⇒ force static-only and flag the deferral.
  if (!isMainPass) return { staticOnly: true, deferredToMain: true };
  return { staticOnly: false, deferredToMain: false };
}

/**
 * Core compile: apply the single-writer static-only policy, resolve the provider,
 * run the compiler, optionally stage/format, and RETURN the result (never exits).
 * Shared by the `--changed`/`--all` command path and the `ci: refresh` main-pass
 * seam. Returns null when nothing ran (hook-skip / re-entrancy refused). The
 * main-pass decision is injectable (`opts.isMainPass`) so the refresh seam and
 * tests can drive it without env/git.
 */
async function compileComprehension(
  mode: 'changed' | 'all',
  projectRoot: string,
  store: ComprehensionStore,
  reader: ReturnType<typeof createNodeModuleSourceReader>,
  cconf: ComprehensionConfig,
  opts: {
    staticOnly?: boolean;
    stage?: boolean;
    hook?: boolean;
    isMainPass?: boolean;
    /**
     * A pre-resolved provider to REUSE (the `--refresh` seam already probed one to
     * gate on credential presence). Honoured only when the run is NOT static-only —
     * an explicit `--static` / `semantic:false` posture always wins and stays
     * provider-free. Omit to resolve lazily via `resolveCompileProvider`.
     */
    provider?: AnalysisProvider | null;
  } = {}
): Promise<ComprehendRunResult | null> {
  const scope =
    mode === 'changed'
      ? resolveChangedScope(deriveChangedSurface(projectRoot), logger, { hook: opts.hook ?? false })
      : { mode: 'all' as const };

  // FIX E.2: a hook-posture run whose changed-surface derivation failed SKIPS
  // (never a whole-repo full sweep on the commit path).
  if (scope.mode === 'skip') {
    logger.info('comprehend: nothing to recompile (changed-surface derivation skipped).');
    return null;
  }

  // ADR 0116 §1 — committed semantic only on the main-pass. Off it (the PR path),
  // force static-only regardless of provider availability so a branch never writes
  // committed (non-deterministic) semantic that would conflict on the merge button.
  const isMainPass = opts.isMainPass ?? committedSemanticAllowed();
  const posture = resolveStaticOnlyPosture(cconf, opts.staticOnly ?? false, isMainPass);
  if (posture.deferredToMain) {
    logger.info(
      'comprehend: PR path is static-only — committed semantic is deferred to the `main` ' +
        'main-pass (single writer, ADR 0116 §1). Writing the byte-stable static skeleton only.'
    );
  }

  // SC4: static-only (`--static`), semantic-disabled, or off the main-pass ⇒ no
  // provider is resolved — no credential, no LLM on the push/CI/PR path. When the
  // caller already probed a provider (the `--refresh` gate) reuse it rather than
  // resolve twice, but never when the posture is static-only (that must stay
  // provider-free regardless of what was passed).
  const provider =
    opts.provider !== undefined && !posture.staticOnly
      ? opts.provider
      : await resolveCompileProvider(cconf, posture.staticOnly);
  // Provider-aware model via the shared helper — resolved from the SAME config
  // endpoint the provider was constructed with, so the model and provider decisions
  // cannot diverge (ADR 0109 slice 3 fix).
  const semanticModel = selectSemanticModel(cconf);
  const generateSemantic = maybeCreateGenerateSemantic(provider, {
    maxTokensPerRun: cconf.maxTokensPerRun,
    ...(semanticModel ? { model: semanticModel } : {}),
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
    return null;
  }
  // Pre-commit posture: stage the refreshed shards so they land in the SAME
  // commit as the source change (no-op when nothing compiled). Prettier-formats
  // the shards before git-add (FIX D) so they never trip the whole-tree format:check.
  // FIX #1697: on every OTHER path (bulk `--all`, plain `--changed`, no `--stage`)
  // still prettier-format the freshly-written shards so a later manual `git add` +
  // commit lands them already-formatted — otherwise an adopter's prettier-on-markdown
  // lint-staged reflows the double-quoted frontmatter at commit time (dribble +
  // format:check risk). `stageCompiledUnits` already formats, so don't double up.
  if (opts.stage) await stageCompiledUnits(result, store);
  else await formatCompiledUnits(result, store);
  return result;
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
  const result = await compileComprehension(mode, projectRoot, store, reader, cconf, opts);
  if (result === null) {
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

/**
 * ADR 0116 §2 — the `comprehension.ci: refresh` main-pass seam. When `refresh` is
 * configured, after the token-free verify gate we ATTEMPT the provider-backed
 * regeneration + commit of semantic. Guarded so it stays adopter-safe:
 *  - Only on the main-pass context (committed semantic belongs to `main`). Off it,
 *    skip — a PR must never commit semantic.
 *  - Only when a provider actually resolves. With the default maintainer-local
 *    provider (ADR 0116 §3) CI has no credential, so this degrades gracefully to a
 *    no-op and the maintainer's local `comprehend --all` remains the writer.
 * Provider-neutral (never forces a Claude model — reuses `resolveCompileProvider`).
 * The opt-in token-gated runner (#1689) plugs its provider into exactly this path.
 * Best-effort: never changes the gate's exit code (regeneration is remediation,
 * not a pass/fail signal). Returns the number of modules recompiled (0 when the
 * seam no-ops), so the caller can report it.
 */
async function runRefreshMainPass(
  projectRoot: string,
  store: ComprehensionStore,
  reader: ReturnType<typeof createNodeModuleSourceReader>,
  cconf: ComprehensionConfig,
  since?: string
): Promise<number> {
  if (!committedSemanticAllowed()) {
    logger.warn(
      'comprehension.ci: refresh requested off the main-pass — committed semantic is written ' +
        'only on `main` (single writer, ADR 0116). Skipping the refresh regeneration.'
    );
    return 0;
  }
  // Probe for a provider first (never forcing a model): no provider ⇒ token-free
  // context ⇒ defer to the maintainer-local main pass rather than fail.
  const provider = await resolveCompileProvider(cconf, false);
  if (!provider) {
    logger.info(
      'comprehension.ci: refresh is configured, but no analysis provider is available in this ' +
        'context (CI stays token-free). Deferring semantic to the maintainer-local `harness ' +
        'comprehend --all` main pass (ADR 0116 §3); configure #1689 to automate it.'
    );
    return 0;
  }
  // A base ref ⇒ refresh only the changed surface; otherwise a full sweep.
  const mode: 'changed' | 'all' = since ? 'changed' : 'all';
  const result = await compileComprehension(mode, projectRoot, store, reader, cconf, {
    stage: true,
    isMainPass: true,
  });
  if (result === null) return 0;
  logger.success(
    `comprehension.ci: refresh regenerated ${result.compiled.length} module(s) ` +
      `(${result.semanticPresent} semantic) on the main-pass — commit the staged shards.`
  );
  return result.compiled.length;
}

/**
 * Emit a GitHub Actions workflow annotation (`::warning::` / `::notice::`) so an
 * operator sees the refresh outcome on the run summary, not just buried in the log.
 * A NO-OP outside Actions (guarded by `GITHUB_ACTIONS`) so local `comprehend
 * --refresh` output stays clean. Best-effort formatting only — never throws.
 */
function emitGithubAnnotation(level: 'warning' | 'notice', message: string): void {
  if (process.env.GITHUB_ACTIONS !== 'true') return;
  // Newlines break the single-line annotation grammar; collapse to spaces.
  process.stdout.write(`::${level}::${message.replace(/\s*\n\s*/g, ' ')}\n`);
}

/**
 * #1689 / ADR 0116 §3 — the opt-in token-gated CI **refresh** entrypoint
 * (`comprehend --refresh`). This is the automated ALTERNATIVE to the default
 * maintainer-local provider: the post-merge `main` CI job invokes it to perform
 * the single-writer main-pass and commit the refreshed semantic units via a bot.
 *
 * OFF BY DEFAULT and provider-neutral. It runs only when ALL THREE gate signals
 * hold (see {@link ../comprehension/refresh-gate!resolveRefreshJobGate}):
 *  - `comprehension.ci: refresh` is configured (the opt-in switch),
 *  - this is the single-writer main-pass (committed semantic belongs to `main`),
 *  - a provider credential resolves (Anthropic key / config endpoint / claude CLI).
 *
 * Every inactive branch is a CLEAN no-op (exit 0) — the refresh is remediation,
 * never a pass/fail signal, so a default adopter (or one who forgot the secret)
 * never reds a merge. The credential-absent case is surfaced as an ACTIONABLE
 * `::warning::` so the misconfiguration is visible without failing the build. When
 * active, it recompiles the STALE surface with `--all` (a full sweep — post-merge
 * `main` has no meaningful merge-base diff; `runComprehend` skips already-fresh
 * modules, so only genuinely stale units cost tokens, bounded by
 * `comprehension.maxTokensPerRun`) and STAGES the shards for the workflow to commit.
 */
async function runRefreshMode(
  projectRoot: string,
  store: ComprehensionStore,
  reader: ReturnType<typeof createNodeModuleSourceReader>,
  config: HarnessConfig | undefined
): Promise<void> {
  const cconf = readComprehensionConfig(config);
  const ciMode = resolveComprehensionCiMode(config);
  const isMainPass = committedSemanticAllowed();

  // The token gate: probe for a provider WITHOUT forcing a model (provider-neutral).
  // A null provider ⇒ no credential in this context ⇒ the gate degrades to a no-op.
  const provider = await resolveCompileProvider(cconf, false);

  const gate = resolveRefreshJobGate({
    ciMode,
    isMainPass,
    credentialPresent: provider !== null,
  });

  if (!gate.active) {
    const reason: RefreshJobGateReason = gate.reason;
    const explanation = explainInactiveRefreshGate(reason);
    logger.info(explanation);
    // Only the misconfiguration (opted in but no secret) is worth a loud, actionable
    // annotation; `not-enabled` (default adopter) and `not-main-pass` (a branch)
    // are expected quiet no-ops.
    if (reason === 'no-credential') emitGithubAnnotation('warning', explanation);
    process.exit(ExitCode.SUCCESS);
  }

  // Active: run the single-writer main-pass and stage the refreshed shards. Reuse
  // the SAME provider already resolved above (isMainPass:true is authoritative here
  // — the gate proved it — so compileComprehension will not re-derive it).
  const result = await compileComprehension('all', projectRoot, store, reader, cconf, {
    stage: true,
    isMainPass: true,
    provider,
  });

  if (result === null || result.compiled.length === 0) {
    const msg =
      'comprehension.ci: refresh ran on the main-pass — all committed semantic is already ' +
      'source-fresh, nothing to regenerate. No shards staged.';
    logger.success(msg);
    emitGithubAnnotation('notice', msg);
    process.exit(ExitCode.SUCCESS);
  }

  const msg =
    `comprehension.ci: refresh regenerated ${result.compiled.length} module(s) ` +
    `(${result.semanticPresent} semantic) on the main-pass — the staged shards are ready ` +
    'for the bot commit.';
  logger.success(msg);
  emitGithubAnnotation('notice', msg);
  process.exit(ExitCode.SUCCESS);
}

async function runComprehendAction(
  mode: ComprehendMode,
  globalConfig?: string,
  opts: {
    staticOnly?: boolean;
    stage?: boolean;
    hook?: boolean;
    since?: string;
    context?: RegressionContext;
  } = {}
): Promise<void> {
  const projectRoot = process.cwd();
  const config = loadHarnessConfig(globalConfig);

  // Pre-commit-hook posture: no-op unless the opt-in gate is enabled, so the
  // shell hook can invoke unconditionally and the CLI owns the gating.
  if (opts.hook && !shouldRunComprehendHook(config)) {
    process.exit(ExitCode.SUCCESS);
  }

  // FIX 1 — root the store ABSOLUTELY at the project root (matching the reader).
  // Here projectRoot === process.cwd() so the relative default is coincidentally
  // safe, but make store + reader agreement explicit (canonical: gather-context.ts).
  const store = new ComprehensionStore({
    root: `${projectRoot.replaceAll('\\', '/')}/${COMPREHENSION_ROOT}`,
    io: createNodeComprehensionIO(),
  });
  const reader = createNodeModuleSourceReader(projectRoot);

  if (mode === 'check')
    return runCheckMode(store, reader, {
      projectRoot,
      config,
      ...(opts.since ? { since: opts.since } : {}),
      ...(opts.context ? { context: opts.context } : {}),
    });
  if (mode === 'stats') return runStatsMode(store, reader);
  if (mode === 'refresh') return runRefreshMode(projectRoot, store, reader, config);
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
    .option(
      '--refresh',
      'Opt-in token-gated CI refresh (#1689): on the single-writer main-pass with a provider credential and comprehension.ci:refresh, regenerate+stage committed semantic; a clean no-op otherwise'
    )
    .option(
      '--since <ref>',
      'With --check: also fail on any module that regressed semantic present→absent vs this git ref (token-free)'
    )
    .option(
      '--context <pr|main>',
      'With --check --since: which path to guard (ADR 0116 §4). "main" (default): present→absent is a regression. "pr": the static-only PR path, present→absent is expected and never flagged.'
    )
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
      // Validate --context to the two supported values; anything else falls back
      // to the strict `main` default rather than silently mis-guarding.
      const context: RegressionContext | undefined =
        opts.context === 'pr' || opts.context === 'main' ? opts.context : undefined;
      await runComprehendAction(mode, globalOpts.config, {
        staticOnly: opts.static ?? false,
        stage: opts.stage ?? false,
        hook: opts.hook ?? false,
        ...(opts.since ? { since: opts.since } : {}),
        ...(context ? { context } : {}),
      });
    });
}
