## 2026-03-17 — CI/CD Integration Implementation

- [skill:harness-execution] [outcome:gotcha] tsup DTS generation fails when adding new `.ts` files to a package with `composite: true` in the root tsconfig and `"files": []`. The DTS worker resolves to the root project. Workaround: inline types in `index.ts` instead of using separate files for the types package.
- [skill:harness-execution] [outcome:gotcha] `vi.clearAllMocks()` clears `mockImplementation` from `vi.fn()` constructors. Use proper `class` syntax in mock factories for classes instantiated with `new`.
- [skill:harness-execution] [outcome:decision] Used inline template strings in `ci/init.ts` instead of Handlebars `.hbs` files to avoid file-path resolution issues in tests and keep the implementation simpler.
- [skill:harness-execution] [outcome:success] Core function signatures differ from plan assumptions (`validateDependencies` not `checkLayerDependencies`, `EntropyAnalyzer` class not `detectEntropy` function, etc.) — adapted orchestrator within task scope.
