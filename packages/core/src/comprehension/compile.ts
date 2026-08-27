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

/** Sorted, de-duplicated member basenames (matches the frontmatter contract). */
function memberBasenames(sourceFiles: SourceFile[]): string[] {
  const bases = sourceFiles.map((f) => {
    const norm = f.path.replaceAll('\\', '/');
    return norm.slice(norm.lastIndexOf('/') + 1);
  });
  return [...new Set(bases)].sort();
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
  const sourceHash = computeSourceHash(sourceFiles);
  const members = memberBasenames(sourceFiles);
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
