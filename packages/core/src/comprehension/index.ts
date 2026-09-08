/**
 * Comprehension module — the per-module compiled comprehension substrate.
 *
 * IO/provider-injected (D5): store fs access via `ComprehensionIO`, and the
 * static/semantic halves via injected `extractStatic`/`generateSemantic`. This
 * layer is PURE and LLM-free; concrete AST + AnalysisProvider adapters wire in
 * later phases. `computeSourceHash` is the sole correctness primitive (D7).
 */
export type {
  ComprehensionUnit,
  ComprehensionProvenance,
  // Aliased to avoid a core-barrel name collision with `entropy`'s `SourceFile`.
  SourceFile as ComprehensionSourceFile,
  StaticExtraction,
  SemanticGeneration,
  SemanticInput,
  ExtractStatic,
  GenerateSemantic,
} from './types';
export { COMPILER_VERSION, SCHEMA_VERSION, DEFAULT_SOURCE_EXTENSIONS } from './types';
export { computeSourceHash } from './source-hash';
export { parseUnit, serializeUnit } from './serialize';
export { ComprehensionStore, UNIT_FILE, COMPREHENSION_ROOT } from './store';
export type { ComprehensionIO, SkippedUnit, ComprehensionListing } from './store';
export { createNodeComprehensionIO } from './node-io';
export { compileModule } from './compile';
export type { CompileOptions } from './compile';
export { serveGate } from './serve-gate';
export type { ServeVerdict, ModuleSourceReader } from './serve-gate';
export { createNodeModuleSourceReader } from './node-io';
export { renderServedUnit } from './render';

// Concrete AST static extractor — the shared `ExtractStatic` over core's
// `TypeScriptParser`. Semantic generation stays injected (AnalysisProvider,
// cli/consumer-side); this is the static half only, degrade-never-fake.
export {
  createStaticExtractor,
  renderInterfaceContract,
  renderDependencySlice,
  isStaticSupported,
  STATIC_SUPPORTED_EXTENSIONS,
} from './static-extractor';

// Run-boundary reentrancy guard (pure env logic) used by the driver.
export { REENTRANCY_ENV, isComprehensionReentrant, withComprehensionActive } from './reentrancy';

// The diff-scoped compile + write driver (IO-injected) and its --check/--stats
// companions — the same orchestration the `harness comprehend` CLI runs.
export { runComprehend, runComprehendCheck, runComprehendStats, mapWithConcurrency } from './run';
export type {
  ComprehendModuleReader,
  ComprehendUnitStore,
  ComprehendRunOptions,
  ComprehendRunResult,
  ComprehendListStore,
  ComprehendCheckResult,
  ComprehendStatsResult,
} from './run';
