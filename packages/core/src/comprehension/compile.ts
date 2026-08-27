import type { ComprehensionUnit, ExtractStatic, GenerateSemantic, SourceFile } from './types';
import { COMPILER_VERSION, SCHEMA_VERSION } from './types';
import { computeSourceHash } from './source-hash';

export interface CompileOptions {
  /** Always called — the cheap, exact static half. */
  extractStatic: ExtractStatic;
  /** Optional — the advisory semantic half. Absent/null ⇒ static-only (SC4). */
  generateSemantic?: GenerateSemantic;
  /** Injected clock for deterministic `compiledAt` (defaults to real now). */
  now?: () => Date;
}

/**
 * Sorted, de-duplicated member BASENAMES (matches the frontmatter contract and,
 * critically, the canonical reader `createNodeModuleSourceReader`). Under D3 a
 * module is ONE directory's DIRECT files (subdirectories are their OWN modules),
 * so the reader keys each `SourceFile.path` by its posix basename — the compiler
 * MUST key members identically or the serve-time hash recomputed from the same
 * reader could never match this compile-time one, leaving every unit perpetually
 * source-stale. Basename is derived posix-safely (no node:path — this stays pure)
 * so a stray directory-prefixed input still collapses to the reader's basename.
 */
function memberPaths(sourceFiles: SourceFile[]): string[] {
  const basenames = sourceFiles.map((f) => {
    const posix = f.path.replaceAll('\\', '/');
    const slash = posix.lastIndexOf('/');
    return slash === -1 ? posix : posix.slice(slash + 1);
  });
  return [...new Set(basenames)].sort();
}

/**
 * Compile one module's comprehension unit. PURE orchestration (D5): every
 * IO/LLM effect enters via the injected `extractStatic` (always called) and the
 * optional `generateSemantic`. With no `generateSemantic` — or when it returns
 * `null` (the no-credential path, SC4) — the unit is emitted static-only
 * (`semantic: absent`). This function never calls an LLM, git, or fs itself and
 * requires no credential.
 */
export async function compileModule(
  module: string,
  sourceFiles: SourceFile[],
  opts: CompileOptions
): Promise<ComprehensionUnit> {
  // F5: reject an empty/whitespace module at compile time, consistent with
  // parseProvenance rejecting an empty module on the read path.
  if (module.trim().length === 0) {
    throw new Error('compileModule: module must be a non-empty path');
  }
  const sourceHash = computeSourceHash(sourceFiles);
  const members = memberPaths(sourceFiles);
  const { interfaceContract, dependencySlice } = await opts.extractStatic(sourceFiles);

  let summary = '';
  let invariants: string[] = [];
  let model: string | null = null;
  let semantic: 'present' | 'absent' = 'absent';

  if (opts.generateSemantic) {
    const result = await opts.generateSemantic({
      module,
      interfaceContract,
      dependencySlice,
      sourceFiles,
    });
    if (result) {
      summary = result.summary;
      invariants = result.invariants;
      model = result.model ?? null;
      semantic = 'present';
    }
  }

  const now = (opts.now ?? (() => new Date()))();
  return {
    provenance: {
      schemaVersion: SCHEMA_VERSION,
      module: module.replaceAll('\\', '/'),
      sourceHash,
      compiledAt: now.toISOString(),
      compiler: { static: COMPILER_VERSION.static, semantic: COMPILER_VERSION.semantic },
      model,
      semantic,
      members,
    },
    summary,
    invariants,
    interfaceContract,
    dependencySlice,
  };
}
