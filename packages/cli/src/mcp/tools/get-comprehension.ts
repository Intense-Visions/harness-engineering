/**
 * `get_comprehension` — the MCP serve/recompile tool (phase 5, SF3; spec D6).
 *
 * An interactive leaf asks for a module's compiled comprehension unit. The tool
 * SERVES the committed unit through the LLM-free `serveGate` (the sole correctness
 * authority — no credential needed to serve). On a source-stale unit, or when the
 * caller passes `forceRecompile`, it recompiles ONLY that one module (reusing the
 * canonical `runComprehend` driver — `createNodeModuleSourceReader` enumeration +
 * `withComprehensionActive` reentrancy guard + skip-if-fresh) and returns the
 * fresh rendered unit. It NEVER throws: every failure is a structured `isError`
 * envelope, mirroring `get_impact`.
 */

import {
  ComprehensionStore,
  COMPREHENSION_ROOT,
  createNodeComprehensionIO,
  createNodeModuleSourceReader,
  serveGate,
  renderServedUnit,
  type ComprehensionUnit,
  type ComprehensionSourceFile,
  type ExtractStatic,
  type GenerateSemantic,
  type Result,
} from '@harness-engineering/core';
import type { AnalysisProvider } from '@harness-engineering/intelligence';
import { runComprehend } from '../../comprehension/compile-run';
import { createStaticExtractor } from '../../comprehension/static-extractor';
import { maybeCreateGenerateSemantic } from '../../comprehension/generate-semantic';
import { readComprehensionConfig } from '../../comprehension/config';
import { resolveConfig } from '../../config/loader';
import { resolveAnalysisProvider } from '../utils/analysis-provider';
import { sanitizePath } from '../utils/sanitize-path.js';

export const getComprehensionDefinition = {
  name: 'get_comprehension',
  description:
    "Serve a module's compiled comprehension unit (compact, primary understanding). Returns the served unit via the LLM-free serve gate; on a source-stale unit or with forceRecompile it recompiles ONLY that module and returns the fresh unit. Prefer this over reading raw source for a module you did not edit.",
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      module: {
        type: 'string',
        description: 'Module directory (repo-relative, e.g. "packages/core/src") to serve',
      },
      forceRecompile: {
        type: 'boolean',
        description: 'Recompile the module even when its committed unit is already source-fresh',
      },
    },
    required: ['path', 'module'],
  },
};

/** A unit store the tool reads/writes (subset of `ComprehensionStore`). */
export interface GetComprehensionStore {
  read(module: string): Promise<Result<ComprehensionUnit>>;
  write(unit: ComprehensionUnit): Promise<Result<void>>;
}

/** A module source reader (subset of the canonical node reader). */
export interface GetComprehensionReader {
  readModuleSource(module: string): Promise<ComprehensionSourceFile[] | null>;
}

/** IO-injected dependencies so the serve/recompile logic is disk- and LLM-free in tests. */
export interface ServeOrRecompileDeps {
  store: GetComprehensionStore;
  reader: GetComprehensionReader;
  makeExtractStatic: (module: string) => ExtractStatic;
  /**
   * An already-resolved semantic seam. Prefer `resolveGenerateSemantic` for the
   * production path so provider resolution stays LAZY; this eager field remains for
   * callers/tests that inject a ready seam directly. When both are present the eager
   * value wins (no resolution needed).
   */
  generateSemantic?: GenerateSemantic;
  /**
   * FIX C — LAZY semantic-provider seam: resolved ONLY on the recompile branch, so a
   * pure fresh serve never loads config or scans PATH for a provider. Returns the
   * `GenerateSemantic` (or `undefined` for a static-only recompile). Absent ⇒ no
   * semantic seam is resolved at all.
   */
  resolveGenerateSemantic?: () => Promise<GenerateSemantic | undefined>;
  projectRoot: string;
  concurrency?: number;
  env?: NodeJS.ProcessEnv;
}

/** Outcome of a serve-or-recompile request. Never a throw. */
export type GetComprehensionOutcome =
  | { status: 'served'; module: string; recompiled: boolean; rendered: string }
  | { status: 'unavailable'; module: string; reason: string }
  | { status: 'reentrant'; module: string };

/** Recompile ONE module via the canonical driver, then re-serve + render it. */
async function recompileAndServe(
  module: string,
  force: boolean,
  deps: ServeOrRecompileDeps
): Promise<GetComprehensionOutcome> {
  // FIX C — resolve the semantic seam lazily, HERE on the recompile branch only.
  // An eagerly-injected `generateSemantic` wins; otherwise invoke the lazy resolver
  // (which loads config + may resolve a provider). A fresh serve never reaches this
  // code, so it never pays that cost.
  const generateSemantic =
    deps.generateSemantic ??
    (deps.resolveGenerateSemantic ? await deps.resolveGenerateSemantic() : undefined);
  const result = await runComprehend({
    mode: 'changed',
    projectRoot: deps.projectRoot,
    store: deps.store,
    reader: deps.reader,
    makeExtractStatic: deps.makeExtractStatic,
    ...(generateSemantic ? { generateSemantic } : {}),
    changedModules: [module],
    concurrency: deps.concurrency ?? 1,
    ...(deps.env ? { env: deps.env } : {}),
    ...(force ? { force: true } : {}),
  });
  if (result.reentrancyRefused) return { status: 'reentrant', module };

  const after = await deps.store.read(module);
  if (!after.ok) {
    return { status: 'unavailable', module, reason: 'no comprehension unit or source for module' };
  }
  const verdict = await serveGate(after.value, deps.reader);
  if (!verdict.serve) {
    return { status: 'unavailable', module, reason: 'unit remained source-stale after recompile' };
  }
  return { status: 'served', module, recompiled: true, rendered: renderServedUnit(verdict.unit) };
}

/**
 * Serve a module's unit, recompiling only that module on a source-stale unit or a
 * force request. Pure over the injected IO — no throw, no disk, no LLM unless the
 * caller wires a real `generateSemantic`.
 */
export async function serveOrRecompile(
  module: string,
  forceRecompile: boolean,
  deps: ServeOrRecompileDeps
): Promise<GetComprehensionOutcome> {
  if (!forceRecompile) {
    const existing = await deps.store.read(module);
    if (existing.ok) {
      const verdict = await serveGate(existing.value, deps.reader);
      if (verdict.serve) {
        return {
          status: 'served',
          module,
          recompiled: false,
          rendered: renderServedUnit(verdict.unit),
        };
      }
      // source-stale ⇒ fall through to recompile that one module
    }
    // no committed unit ⇒ fall through to compile-on-miss
  }
  return recompileAndServe(module, forceRecompile, deps);
}

/**
 * Resolve the default recompile deps for a project, including the semantic seam
 * per config (static-or-semantic exactly as `comprehend.ts` does). A recompile
 * demand is explicit, so — unlike the push/CI path — it MAY resolve a provider
 * when `comprehension.semantic` is enabled; a missing provider degrades to
 * static-only (never throws).
 */
function resolveDefaultDeps(projectRoot: string): ServeOrRecompileDeps {
  const resolved = resolveConfig();
  const config = resolved.ok ? resolved.value : undefined;
  const cconf = readComprehensionConfig(config);
  // FIX C — DEFER the provider (config-driven resolver + PATH scan) behind a lazy
  // thunk. `serveOrRecompile` invokes it ONLY on the recompile branch, so a pure
  // fresh serve resolves no provider at all. A recompile demand is explicit, so it
  // MAY resolve a provider when `comprehension.semantic` is enabled; a missing
  // provider degrades to static-only (never throws).
  const resolveGenerateSemantic = async (): Promise<GenerateSemantic | undefined> => {
    const provider = cconf.semantic
      ? ((await resolveAnalysisProvider(cconf.model ?? undefined).catch(
          () => null
        )) as AnalysisProvider | null)
      : null;
    return maybeCreateGenerateSemantic(provider, {
      maxTokensPerRun: cconf.maxTokensPerRun,
      ...(cconf.model ? { model: cconf.model } : {}),
    });
  };
  return {
    // FIX 1 — root the store ABSOLUTELY at the project root (matching the reader
    // rooted at `projectRoot`). The relative default resolves against process.cwd(),
    // so store + reader would diverge whenever cwd != projectRoot, silently blanking
    // committed units. Canonical pattern: gather-context.ts.
    store: new ComprehensionStore({
      root: `${projectRoot.replaceAll('\\', '/')}/${COMPREHENSION_ROOT}`,
      io: createNodeComprehensionIO(),
    }),
    reader: createNodeModuleSourceReader(projectRoot),
    makeExtractStatic: (module: string) => createStaticExtractor({ projectRoot, module }),
    resolveGenerateSemantic,
    projectRoot,
    concurrency: cconf.concurrency,
  };
}

function textEnvelope(text: string, isError = false) {
  return { content: [{ type: 'text' as const, text }], ...(isError ? { isError: true } : {}) };
}

/**
 * MCP handler. Serves the module's unit (recompiling on stale/force) and returns
 * a JSON text envelope. `deps` is injectable for tests; production resolves the
 * real disk-/config-backed deps. Never throws — every error is an `isError`
 * envelope like `get_impact`.
 */
export async function handleGetComprehension(
  input: { path: string; module: string; forceRecompile?: boolean },
  deps?: ServeOrRecompileDeps
) {
  try {
    if (!input.module || typeof input.module !== 'string') {
      return textEnvelope('Error: "module" is required', true);
    }
    const projectRoot = sanitizePath(input.path);
    const resolvedDeps = deps ?? resolveDefaultDeps(projectRoot);
    const outcome = await serveOrRecompile(
      input.module,
      input.forceRecompile ?? false,
      resolvedDeps
    );

    if (outcome.status === 'reentrant') {
      return textEnvelope(
        JSON.stringify({
          module: outcome.module,
          served: false,
          reason: 'a comprehension run is already active — recompile refused (reentrancy-guarded)',
        })
      );
    }
    if (outcome.status === 'unavailable') {
      return textEnvelope(
        JSON.stringify({ module: outcome.module, served: false, reason: outcome.reason })
      );
    }
    return textEnvelope(
      JSON.stringify({
        module: outcome.module,
        served: true,
        recompiled: outcome.recompiled,
        unit: outcome.rendered,
      })
    );
  } catch (error) {
    return textEnvelope(`Error: ${error instanceof Error ? error.message : String(error)}`, true);
  }
}
