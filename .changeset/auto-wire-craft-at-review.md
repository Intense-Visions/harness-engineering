---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Auto-wire craft critique at the review moment, and make code-craft genuinely multi-language.

`core` gains `craft-review-hooks`: a diff-driven, capability-gated resolver that attaches advisory,
non-blocking craft critique at a host's review events, as a twin of the existing canary detector
resolver. A domain activates only when the diff touches a surface it owns AND a language it can
actually extract units from, so a domain that cannot read the changed files is reported as an
explicit skip rather than returning an empty finding set — which is indistinguishable from "this
code is fine".

`core/code-nav` gains `getOutlineFromSource` and two fixes that this surfaced. Decorated Python
definitions were dropped entirely, because tree-sitter wraps a decorated `def` or `class` in
`decorated_definition` while the node maps keyed on `function_definition`: a Flask module whose
handlers are all `@app.route`-decorated extracted zero symbols. Rust `mod` bodies were never walked,
so everything inside a `mod` was invisible. Both now surface, which also benefits `code_outline` and
`code_search`. `code_unfold` sees strictly more symbols too, but it is not a pure gain: lookup is
first-match-wins over the outline, so in a Rust file where a `mod`-nested name shadows a top-level
one, `code_unfold` now resolves to whichever is EARLIER IN THE FILE — previously it could only ever
find the top-level one. That resolution rule is now pinned by a test rather than incidental.

`cli` gains a shared multi-language extraction seam, and `code-craft` now critiques Python, Go, Rust
and Java as well as TypeScript and JavaScript — recursing into nested methods, de-duplicating Rust's
struct/impl double emission, and normalizing Go's struct kind so its units actually select rubrics
instead of being extracted, counted and critiqued by nothing.
