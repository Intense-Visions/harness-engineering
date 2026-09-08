---
'@harness-engineering/core': minor
'@harness-engineering/cli': patch
---

Promote the comprehension static extractor and the diff-scoped compile driver into `@harness-engineering/core`'s public surface.

`createStaticExtractor` (+ `renderInterfaceContract`, `renderDependencySlice`, `isStaticSupported`, `STATIC_SUPPORTED_EXTENSIONS`), the run-boundary reentrancy guard (`withComprehensionActive`, `isComprehensionReentrant`, `REENTRANCY_ENV`), and the driver (`runComprehend`, `runComprehendCheck`, `runComprehendStats`, `mapWithConcurrency` + their `Comprehend*` types) were CLI-internal. They are now exported from core alongside `compileModule`/`ComprehensionStore`, so library consumers can drive the compiled-comprehension substrate through the same IO-injected orchestration the `harness comprehend` CLI uses — without depending on the CLI package.

The CLI modules (`comprehension/static-extractor.ts`, `comprehension/compile-run.ts`, and the reentrancy block of `comprehension/generate-semantic.ts`) now re-export the core implementation; every existing importer keeps working unchanged. No behavior change.
