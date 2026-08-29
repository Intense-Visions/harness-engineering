/**
 * Comprehension unit model + compiler injection seams.
 *
 * Pure types only — no IO, no LLM. The concrete `extractStatic` (graph AST) and
 * `generateSemantic` (AnalysisProvider) adapters are wired by the CLI/MCP layer
 * in LATER phases; this module defines the seams (D5) and a stub-friendly
 * contract so the compiler stays IO/provider-injected and unit-testable.
 */

/** Current unit schema version. */
export const SCHEMA_VERSION = 1 as const;

/** Compiler component versions, stamped into provenance. */
export const COMPILER_VERSION = { static: '1.0.0', semantic: '1.0.0' } as const;

/**
 * THE module-membership boundary (D3/D7). A directory's DIRECT files with one of
 * these extensions ARE the module's source — the set the reader enumerates and
 * the compiler compiles must be IDENTICAL, or the recomputed serve-time hash can
 * never match the compile-time one (every unit would read source-stale forever).
 * This single constant is that shared boundary: `createNodeModuleSourceReader`
 * (the canonical enumeration) and the compiler both key off it. Change it in one
 * place only.
 */
export const DEFAULT_SOURCE_EXTENSIONS: readonly string[] = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.rs',
  '.go',
  '.java',
  '.rb',
];

/** On-disk provenance frontmatter for a comprehension unit. */
export interface ComprehensionProvenance {
  /** Schema version of the unit format. */
  schemaVersion: 1;
  /** Module path (source directory), posix-separated, repo-relative. */
  module: string;
  /** Full SHA-256 over directory membership + sorted member-file contents. */
  sourceHash: string;
  /** ISO-8601 timestamp of compilation. */
  /**
   * ADR 0109: OPTIONAL and omitted from freshly compiled shards. A unit is a pure
   * function of its source at `sourceHash`, so no wall-clock is written (git
   * history records when a shard landed). Retained only to parse legacy shards
   * that still carry it; migrates away lazily on the next recompile.
   */
  compiledAt?: string;
  /** Compiler component versions. */
  compiler: { static: string; semantic: string };
  /** Resolved model id for the semantic half, or null when static-only. */
  model: string | null;
  /** Whether the semantic half is present. `absent` ⇒ static-only unit. */
  semantic: 'present' | 'absent';
  /**
   * Sorted, de-duplicated member-file BASENAMES (posix) of the module's DIRECT
   * source files, enumerated at compile time. Keyed by basename — matching the
   * canonical reader `createNodeModuleSourceReader` — because a module is ONE
   * directory (D3): subdirectories are their own modules, so same-basename files
   * never coexist in one module. This alignment is what lets the serve-time hash
   * (recomputed from the same reader) match the compile-time hash.
   */
  members: string[];
}

/** A source file fed to the compiler: repo/module-relative path + contents. */
export interface SourceFile {
  /** Module-relative or repo-relative path, posix-separated. */
  path: string;
  /** Full file contents. */
  content: string;
}

/** Static-extraction output: the exact, always-fresh half of a unit. */
export interface StaticExtraction {
  /** Exported symbols + signatures (rendered markdown for the fenced body). */
  interfaceContract: string;
  /** Imports out / importers in (rendered markdown for the fenced body). */
  dependencySlice: string;
}

/** Bounded input to the semantic generator (static-feeds-semantic, D1). */
export interface SemanticInput {
  module: string;
  interfaceContract: string;
  dependencySlice: string;
  sourceFiles: SourceFile[];
}

/** Semantic-generation output: the advisory, hard-cached half of a unit. */
export interface SemanticGeneration {
  /** Prose summary (token-capped). */
  summary: string;
  /** Invariant list. */
  invariants: string[];
  /** Model id that produced this, or null if the adapter reported none. */
  model?: string | null;
}

/** Injected static extractor. Always called; cheap; language-aware adapter. */
export type ExtractStatic = (
  sourceFiles: SourceFile[]
) => StaticExtraction | Promise<StaticExtraction>;

/**
 * Injected semantic generator. Returns `null` when no provider resolves (the
 * no-credential path, SC4) — the compiler then emits a static-only unit. Must
 * not throw for a merely-missing provider.
 */
export type GenerateSemantic = (
  input: SemanticInput
) => SemanticGeneration | null | Promise<SemanticGeneration | null>;

/** A fully-assembled comprehension unit: provenance + body sections. */
export interface ComprehensionUnit {
  provenance: ComprehensionProvenance;
  /** Prose summary; empty string when `semantic: absent`. */
  summary: string;
  /** Invariant list; empty when `semantic: absent`. */
  invariants: string[];
  /** Exported symbols + signatures (static). */
  interfaceContract: string;
  /** Imports out / importers in (static). */
  dependencySlice: string;
}
