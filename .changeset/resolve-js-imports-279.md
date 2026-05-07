---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

fix(core): resolve `.js` imports to `.ts`/`.jsx` source files (#279)

Three resolvers in `packages/core` (dead-code reachability, dependency-graph construction, review-context scoping) silently dropped edges when an import specifier wrote a runtime extension different from the on-disk source extension. On TS NodeNext / "Bundler" projects this caused ~75% false-positive dead-code findings; the same bug class affects Babel/webpack JSX projects (`./Foo.js` → `Foo.jsx`).

**`@harness-engineering/core`:**

- `packages/core/src/entropy/detectors/dead-code.ts :: resolveImportToFile` — was the proximate cause of the reported symptom. Appended `.ts` to a `.js` path producing non-existent `foo.js.ts` lookups; now strips the JS-style extension and tries each TS/JSX equivalent before falling back.
- `packages/core/src/constraints/dependencies.ts :: resolveImportPath` — `hasKnownExt` flat-union accepted `.js` as already-resolved, so dependency-graph edges pointed to non-existent nodes. Now async; verifies file existence before returning. The previous `fromLang === 'typescript'` gate was dropped — Babel/JSX projects need the same swap.
- `packages/core/src/review/context-scoper.ts :: resolveImportPath` — candidate list never tried stripping `.js` first; now does, with `index.{ts,tsx,jsx}` directory fallbacks.
- New shared `JS_EXT_FALLBACKS` map (`.js → [.ts, .tsx, .jsx]`, `.jsx → [.tsx]`, `.mjs → [.mts]`, `.cjs → [.cts]`) covers both real-world conventions: TS NodeNext and Babel/webpack JSX.

**`@harness-engineering/cli`:**

- `harness cleanup --type dead-code` no longer flags files imported via NodeNext-style `.js` extensions (or Babel-style `.js → .jsx`) as dead. Symptom regression on this monorepo: total findings **1480 → 1016 (-31%)**, dead files **394 → 185 (-53%)**.
- Downstream commands that consume the dependency graph (`harness fix-drift`, `harness check-perf` coupling/fan-in, `harness knowledge-pipeline`) now see complete edges for `.js`-imported files.

**Tests:**

- `packages/core/tests/entropy/detectors/dead-code.test.ts` — 4 NodeNext cases (file, subdirectory, folder-index, full-report).
- `packages/core/tests/constraints/dependencies.test.ts` — TS NodeNext + Babel JSX cases via `buildDependencyGraph`.
- `packages/core/tests/review/context-scoper.test.ts` — TS NodeNext + Babel JSX cases via `scopeContext` import fallback.
- New fixtures under `packages/core/tests/fixtures/{entropy/dead-code-nodenext,nodenext-imports,jsx-imports}/`.
- Each new test was verified to fail when the corresponding source fix is reverted.
