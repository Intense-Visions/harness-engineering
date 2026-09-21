import type {
  ComprehensionUnit,
  ExtractStatic,
  GenerateSemantic,
  ModuleIdentity,
  SourceFile,
} from './types';
import { COMPILER_VERSION, SCHEMA_VERSION } from './types';
import { computeSourceHash } from './source-hash';

export interface CompileOptions {
  /** Always called — the cheap, exact static half. */
  extractStatic: ExtractStatic;
  /** Optional — the advisory semantic half. Absent/null ⇒ static-only (SC4). */
  generateSemantic?: GenerateSemantic;
  /**
   * Optional FULL-module identity (#319). When the caller compiles from a lossy SUBSET (scrub-
   * blocked members dropped), it supplies the sourceHash/members over the FULL original set plus
   * the excluded basenames, so provenance describes the whole module and a serve-time hash over
   * the working tree still matches. Absent ⇒ hash/members are derived from `sourceFiles` (the
   * subset), and the unit is complete — today's byte-identical behavior.
   */
  provenance?: ModuleIdentity;
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
  // #319: when the caller supplies a full-module identity (it compiled from a lossy subset),
  // hash/members describe the WHOLE module and `incomplete` lists the excluded members; otherwise
  // derive them from the given files (a complete unit). Extraction ALWAYS runs over the provided
  // `sourceFiles` — the clean subset — so blocked content never reaches the compiler (R4).
  const sourceHash = opts.provenance?.sourceHash ?? computeSourceHash(sourceFiles);
  const members = opts.provenance?.members ?? memberPaths(sourceFiles);
  const incomplete = opts.provenance?.incomplete ?? [];
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

  // ADR 0109: no wall-clock in the committed shard. A unit is a pure function of
  // its source at `sourceHash`, so the emitted bytes are stable across branches
  // and clocks — two PRs making the same change produce byte-identical shards and
  // never collide. git history records WHEN a shard landed; the hash records WHAT
  // it was compiled from. `compiledAt` is therefore no longer emitted.
  return {
    provenance: {
      schemaVersion: SCHEMA_VERSION,
      module: module.replaceAll('\\', '/'),
      sourceHash,
      compiler: { static: COMPILER_VERSION.static, semantic: COMPILER_VERSION.semantic },
      model,
      semantic,
      members,
      // Omit entirely for a complete unit so its serialized bytes are unchanged (#319).
      ...(incomplete.length > 0 ? { incomplete } : {}),
    },
    summary,
    invariants,
    interfaceContract,
    dependencySlice,
  };
}
