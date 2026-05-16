---
'@harness-engineering/core': patch
---

`findFiles` now applies a default ignore list (`node_modules`, `dist`, `build`, `coverage`) so callers stop crawling into nested dependency trees.

Before this fix, the shared `findFiles` helper at `packages/core/src/shared/fs-utils.ts` called glob with no ignore option, so all 40 of its callers — architecture collectors (complexity, coupling, module-size, etc.), entropy detectors, knowledge map, doc coverage, code-nav, dependency analysis — crawled into every nested `node_modules`. The most visible symptom was `harness check-arch` on a workspace that contained a standalone example (`examples/slack-echo-bridge/`) scanning the example's bundled `typescript/lib/lib.dom.d.ts` and emitting ~700 false-positive `cyclomaticComplexity`/`nestingDepth`/`functionLength` violations against TypeScript's own DOM type defs. Reproducible before the fix as `harness check-arch 2>&1 | grep -c node_modules` → 661.

`findFiles` now passes `ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/coverage/**']` to glob. The exported constant `DEFAULT_FIND_FILES_IGNORE` lists them. A new optional `extraIgnore` third parameter lets callers add patterns without re-implementing the defaults; existing call sites are source-compatible.

Three new test cases pin the behavior: defaults exclude all four directories, `extraIgnore` extends rather than replaces the defaults, and `extraIgnore` of an unrelated pattern leaves the defaults intact.
