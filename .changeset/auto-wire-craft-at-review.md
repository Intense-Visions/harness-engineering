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

`harness-autopilot` now resolves those domains at both of its review moments. Its SKILL.md documents
`resolveReviewHooksWithCraft` at `after:REVIEW` and `after:FINAL_REVIEW` alongside the canary
detectors it already resolves there, with the contract the resolver cannot enforce from prose alone:
advisory and never blocking, diff-scoped, budget-capped, once per phase per diff via `alreadyRanFor`,
graceful-skip for a harness default against a hard halt for a user-declared hook, and a reported
denominator so a `0/M` renders as `0/M` rather than as silence. The forwarded file list must be
resolved to ABSOLUTE paths: `CraftReviewPlan.files` carries repo-relative POSIX paths and the craft
collectors read them against the process CWD, so forwarding them unresolved produces a run that opens
no file and reports a confident clean pass.

`harness-code-review` is the second wired host, at its `after:mechanical` event, so craft reaches
interactive and CI review and not only autopilot runs. Its SKILL.md records the four claims an
implementer cannot infer from the resolver: the timing asymmetry (craft resolves BEFORE the AI
fan-out here, AFTER the review under autopilot), the hard-halt EXCEPTION that keeps a missing craft
default a skip rather than the halt this skill's own contract would otherwise impose, the rule that
craft findings must never enter the mechanical exclusion set — a craft taste judgment at `file:line`
discarding a reviewer's real finding at the same `file:line` would be a false green manufactured by
this very wiring — and the same ABSOLUTE-path forwarding requirement. All ten auto-wired craft
skills now carry an "Invoked as a review hook" section stating the contract they are invoked under,
including whether their own MCP tool accepts a `promptBudget`: `design_craft` does not, so the
uniform "files plus promptBudget" claim was false for the priority-1 domain and is now qualified
wherever it appears.

`security-craft` now extracts from `.mts` and `.cts`, which its `supportedLanguages` already claimed.
It carried the same second extension list that was deleted from `code-craft`, so on identical source
a `.ts` file yielded three signals and a `.mts` file yielded zero — a clean security report from a
scan that read nothing. `cli-ergonomics-craft` no longer owns the data and markup that merely lives
under `cli/`, `commands/`, `cmd/` or `bin/` (a denylist, so unmapped LANGUAGES like `.sh` and `.rb`
still pass; `.md` stays owned, because CLI help text is ergonomics).

Skill availability now resolves through one shared module for both review hosts, removing a
byte-identical triple of private helpers and an unreachable predicate clause.
