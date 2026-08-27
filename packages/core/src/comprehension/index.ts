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
export { COMPILER_VERSION, SCHEMA_VERSION } from './types';
export { computeSourceHash } from './source-hash';
export { parseUnit, serializeUnit } from './serialize';
export { ComprehensionStore, UNIT_FILE, COMPREHENSION_ROOT } from './store';
export type { ComprehensionIO } from './store';
export { createNodeComprehensionIO } from './node-io';
export { compileModule } from './compile';
export type { CompileOptions } from './compile';
