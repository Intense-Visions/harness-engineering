import type { ComprehensionUnit, SourceFile } from './types';
import { computeSourceHash } from './source-hash';

/**
 * Injected directory-enumeration IO for the serve-time gate (D5/D7). Returns the
 * module directory's CURRENT source files (module-relative posix path + content),
 * or `null` when the directory is absent/deleted. The concrete node adapter is
 * `createNodeModuleSourceReader`; tests inject a fake. This is the ONLY IO the
 * gate performs — no LLM, no credential (SC4).
 */
export interface ModuleSourceReader {
  readModuleSource(module: string): Promise<SourceFile[] | null>;
}

/** Serve-gate verdict: serve a fresh unit, or refuse a source-stale one. */
export type ServeVerdict =
  | { serve: true; unit: ComprehensionUnit }
  | { serve: false; reason: 'source-stale'; module: string; recompile: true };

/**
 * The serve-time hash gate — the sole correctness authority (D7), LLM-free.
 * Re-enumerates the module's current membership + contents via the injected
 * reader, recomputes `sourceHash` with the SAME primitive the compiler used
 * (`computeSourceHash`), and refuses to serve on any mismatch: a content change,
 * a membership delta (add/remove — folded into the hash), or a deleted directory
 * (`null` enumeration). A refusal carries a recompile signal so callers fall back
 * to graph/source. Requires no LLM and no credential.
 */
export async function serveGate(
  unit: ComprehensionUnit,
  reader: ModuleSourceReader
): Promise<ServeVerdict> {
  const module = unit.provenance.module;
  const current = await reader.readModuleSource(module);
  if (current === null) {
    return { serve: false, reason: 'source-stale', module, recompile: true };
  }
  if (computeSourceHash(current) !== unit.provenance.sourceHash) {
    return { serve: false, reason: 'source-stale', module, recompile: true };
  }
  return { serve: true, unit };
}
