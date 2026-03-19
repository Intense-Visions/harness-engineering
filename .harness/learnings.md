## 2026-03-17 — CI/CD Integration Implementation

- [skill:harness-execution] [outcome:gotcha] tsup DTS generation fails when adding new `.ts` files to a package with `composite: true` in the root tsconfig and `"files": []`. The DTS worker resolves to the root project. Workaround: inline types in `index.ts` instead of using separate files for the types package.
- [skill:harness-execution] [outcome:gotcha] `vi.clearAllMocks()` clears `mockImplementation` from `vi.fn()` constructors. Use proper `class` syntax in mock factories for classes instantiated with `new`.
- [skill:harness-execution] [outcome:decision] Used inline template strings in `ci/init.ts` instead of Handlebars `.hbs` files to avoid file-path resolution issues in tests and keep the implementation simpler.
- [skill:harness-execution] [outcome:success] Core function signatures differ from plan assumptions (`validateDependencies` not `checkLayerDependencies`, `EntropyAnalyzer` class not `detectEntropy` function, etc.) — adapted orchestrator within task scope.

## 2026-03-18 — Code Reviewer Persona with Schema v2

- [skill:harness-execution] [outcome:gotcha] When mocking `fs` with `vi.mock` for artifact writing tests, the mock intercepts all fs calls including those in the module under test, causing `projectPath` to become undefined in `path.join`. Solution: use real temp directories instead of mocking fs.
- [skill:harness-execution] [outcome:gotcha] Using `z.union` for the persona schema (v1 | v2) means `z.infer<typeof PersonaSchema>` produces a union type that doesn't have `steps` on the v1 branch. Solved by defining a separate `Persona` interface that always includes `steps` and normalizing v1 in the loader.
- [skill:harness-execution] [outcome:gotcha] Adding a new persona YAML to `agents/personas/` broke the `builtins.test.ts` that hardcoded `expect(result.value.length).toBe(3)`. Tests that assert exact counts of discovered files are fragile — updated to 4.
- [skill:harness-execution] [outcome:success] Tasks 2, 3, 6, 7, 8 were parallelizable after Task 1 as planned. Executing them in a batch was efficient — all passed on first try.

## 2026-03-18 — Executor Personas with Trigger Detection

- [skill:harness-execution] [outcome:success] The `on_plan_approved` trigger required only 1 line added to the TriggerContext enum — minimal schema change for significant capability gain.
- [skill:harness-execution] [outcome:success] The trigger detector module is pure and testable — reads handoff.json, returns a typed result. No side effects. 6 tests cover all edge cases (missing file, malformed JSON, empty pending, wrong skill, happy path).
- [skill:harness-execution] [outcome:decision] Runner resolves `auto` trigger at the top of `runPersona` before step filtering, keeping the resolution logic in one place rather than distributed across callers.
