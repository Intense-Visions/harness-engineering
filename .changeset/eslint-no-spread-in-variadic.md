---
'@harness-engineering/eslint-plugin': minor
---

feat(eslint-plugin): add `no-spread-in-variadic` rule (roadmap #220)

Flags `Math.min(...arr)` / `Math.max(...arr)`. Spreading an array pushes every element
onto the call stack as a separate argument, so a large array (~65k+ elements on V8) throws
`RangeError: Maximum call stack size exceeded` — an input-dependent runtime crash the type
checker cannot catch. A `reduce`/loop is bounded and safe. The rule reports only a spread
argument to a non-computed `Math.min`/`Math.max` callee; plain args, other Math methods,
array/object spread, and spread into non-Math callees are left alone. Enabled as `error`
in the recommended and strict configs.
