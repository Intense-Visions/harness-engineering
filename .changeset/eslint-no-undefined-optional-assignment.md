---
'@harness-engineering/eslint-plugin': minor
---

feat(eslint-plugin): add `no-undefined-optional-assignment` rule

Flags an object-literal property whose value is a variable declared `T | undefined` assigned
directly (e.g. `{ field: maybeUndefined }`), which breaks `exactOptionalPropertyTypes`, and points
at the conditional-spread form `...(value !== undefined && { field: value })`. Sound + syntactic
(keys off the DECLARED annotation, since this plugin's RuleTester runs without type info): it flags
`let x: T | undefined; { field: x }` and typed `T | undefined` params, exempts the already-guarded
`(x !== undefined && { field: x })` form, and stays silent when the annotation is absent
(unknown ⇒ no false positive).

Authored as the human-review completion of an autonomous local-model draft (the model produced a
plausible type-aware attempt that didn't fit this repo's syntactic-only test infra and failed
typecheck).
