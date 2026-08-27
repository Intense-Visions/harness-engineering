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

/** On-disk provenance frontmatter for a comprehension unit. */
export interface ComprehensionProvenance {
  /** Schema version of the unit format. */
  schemaVersion: 1;
  /** Module path (source directory), posix-separated, repo-relative. */
  module: string;
  /** Full SHA-256 over directory membership + sorted member-file contents. */
  sourceHash: string;
  /** ISO-8601 timestamp of compilation. */
  compiledAt: string;
  /** Compiler component versions. */
  compiler: { static: string; semantic: string };
  /** Resolved model id for the semantic half, or null when static-only. */
  model: string | null;
  /** Whether the semantic half is present. `absent` ⇒ static-only unit. */
  semantic: 'present' | 'absent';
  /** Sorted member-file basenames enumerated at compile time. */
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
