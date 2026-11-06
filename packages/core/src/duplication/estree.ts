import type { EstreeModule, EstreeModuleLoader } from '../shared/parsers/typescript';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';

/**
 * Raised — and carried, never thrown past a public boundary — when the
 * detector's one runtime dependency cannot be resolved.
 *
 * It is a real `Error` rather than an `EntropyError` because both consumers
 * need an `Error`: {@link fingerprintFile} records `name` and `message` on a
 * `SkippedFile`, and `buildCloneIndex` puts the instance itself on
 * `EntropyError.details.originalError`. The distinctive `name` is what lets a
 * reader of a skip record tell "this environment has no parser" apart from a
 * FIPS-mode digest failure, which is the other thing classified as
 * `internal-error`.
 */
export class EstreeUnavailableError extends Error {
  constructor(detail: string) {
    super(`@typescript-eslint/typescript-estree could not be loaded: ${detail}`);
    this.name = 'EstreeUnavailableError';
  }
}

/**
 * The default loader: a DYNAMIC import, deliberately, and the same seam
 * `shared/parsers/typescript.ts` uses for the same module.
 *
 * A static `import { parse } from '@typescript-eslint/typescript-estree'` here
 * was a real defect, not a style preference. Two consequences, both observed:
 *
 *   1. A resolution failure became a module-load crash UPSTREAM of every
 *      guard. `entropy/analyzer.ts` statically imports the duplication
 *      detector, which statically imports `duplication/index.ts`, so a broken
 *      install took down anything that transitively imported
 *      `@harness-engineering/core` — including the snapshot builder whose job
 *      is to REPORT that the parser is unavailable.
 *   2. It made the unavailable branch untestable. With a static import the
 *      throw fires while the test file's own imports are being linked, so
 *      `vi.mock('@typescript-eslint/typescript-estree', () => { throw ... })`
 *      surfaces vitest's module-mocking wrapper text instead of our message —
 *      which is exactly how `insights/aggregator-parser-unavailable.test.ts`
 *      (#2267) failed.
 *
 * Only `import type { TSESTree }` stays static across this module's siblings;
 * type imports are erased and carry no runtime edge.
 */
const loadEstreeModule: EstreeModuleLoader = () =>
  import('@typescript-eslint/typescript-estree') as unknown as Promise<EstreeModule>;

/** Resolves the module once, reporting a failure as a value. */
export type EstreeGate = () => Promise<Result<EstreeModule, EstreeUnavailableError>>;

/**
 * Build a gate that resolves estree at most once.
 *
 * Memoized on the PROMISE, not on the resolved module, so concurrent callers
 * share a single in-flight `import()` rather than racing several. Caching
 * matters at this module's scale: `buildCloneIndex` fingerprints ~2,100 files
 * per run at the repository's scope and each one needs `parse`, so a per-file
 * `import()` would pay module-registry lookup 2,100 times for one module.
 *
 * `load` is a parameter with a default — the same injectable-default shape as
 * `TypeScriptParser`'s constructor — rather than a module-level variable with
 * a test-only setter. That is what lets the memoization itself be asserted
 * (call the gate twice, count the loader's invocations) without a mutable
 * global that one test could leak into the next.
 */
export function createEstreeGate(load: EstreeModuleLoader = loadEstreeModule): EstreeGate {
  let resolved: Promise<Result<EstreeModule, EstreeUnavailableError>> | undefined;
  return () => {
    resolved ??= (async (): Promise<Result<EstreeModule, EstreeUnavailableError>> => {
      try {
        const mod = await load();
        // Inside the `try` on purpose: a module namespace object can be a
        // proxy whose property access throws, so reading `parse` is itself
        // fallible and a throw here must become a value, not an unhandled
        // rejection.
        if (typeof mod.parse !== 'function') {
          return Err(new EstreeUnavailableError('resolved without a callable `parse` export'));
        }
        return Ok(mod);
      } catch (e) {
        return Err(new EstreeUnavailableError(e instanceof Error ? e.message : String(e)));
      }
    })();
    return resolved;
  };
}

/**
 * The process-wide gate the detector uses.
 *
 * One instance at module scope is what makes "one `import()` per process"
 * true; `fingerprintFile` and `buildCloneIndex` both go through it, so the
 * second and subsequent calls await an already-settled promise.
 */
export const estreeGate: EstreeGate = createEstreeGate();
