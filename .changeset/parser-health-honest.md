---
'@harness-engineering/core': minor
'@harness-engineering/cli': patch
---

`TypeScriptParser.health()` now probes the parser instead of asserting it is fine

`health()` was one line — `return Ok({ available: true, version: '7.0.0' })`. It
examined nothing, and the version was wrong by a major: the installed
`@typescript-eslint/typescript-estree` is 8.x. Because `validateDependencies`
gates its entire parser-unavailable abstention on this one answer, and because
`check-deps`, the `check_dependencies` MCP tool, `check-arch`'s layer-violation
collector, `ci check` and `review`'s mechanical checks all construct
`new TypeScriptParser()` unconditionally, **no production input could reach any
abstention path**. The machinery added in #2208 — `unavailableChecks`, exit 3,
the MCP `isError` abstention, `check-arch`'s `abstained` status — existed and
could only be exercised by mocking the core export. That is what the #2098
changeset meant by "no adopter can observe this half today"; this is the change
that makes it observable.

**What "available" now means.** The estree module resolves, exposes a callable
`parse`, and a trial parse of a fixed snippet yields an AST that this parser's
own `extractImports`/`extractExports` can read. The last clause is the point:
the contract consumers depend on is not "parse did not throw", it is "the
extracted imports and exports are usable", and only an end-to-end probe covers
an API that drifts without erroring. The reported `version` is the module's own,
so it tracks what is installed. Every failure is still `Ok({ available: false,
message })`, never `Err` — an unavailable parser is an answer to the health
question, not a failure to answer it, and `fallbackBehavior` is the caller's to
apply.

**The estree module is now resolved lazily, through a seam.** A top-level
`import` makes a resolution failure a module-load crash _upstream_ of `health()`,
so the abstention could never be reached for the likeliest real cause — a broken
install, or a `typescript` peer the estree parser rejects. `parseFile` therefore
returns `PARSER_UNAVAILABLE` where it previously could not run at all, and the
optional constructor argument lets the unavailable branch be tested against the
real class rather than a hand-rolled stand-in parser.

**`buildDependencyGraph` fails closed on `PARSER_UNAVAILABLE`.** It skips files
it cannot parse, which is right for a syntax error in one file and wrong when
the parser is gone: every file is skipped, the graph has zero edges, and
`detectCircularDeps` reads that as "no cycles". With an honest `health()` that
became reachable, so `check-deps`' cycle half — which is not health-gated —
would have reported clean over files it never parsed. `TypeScriptParser` is the
only parser that emits that code (`TreeSitterParser` reports a missing grammar
as `SYNTAX_ERROR`), and only for a global condition, so no per-file skip
behaviour changes.

**The static comprehension extractor fails closed on `PARSER_UNAVAILABLE`.**
Resolving estree lazily turned a load-time crash into a per-file error, and
`createStaticExtractor` skipped every member that failed to parse — so with the
parser gone it returned an empty interface contract and dependency slice, and
`harness comprehend` (including the pre-commit hook) would write and stage units
claiming the module exports and imports nothing. It now rejects with a
`PARSER_UNAVAILABLE`-coded error and no unit is written; a syntax error in one
member is still skipped. `check-arch`'s circular-dependency measurement now
carries the graph-build cause in `metadata.error` instead of a bare
`'Failed to build dependency graph'`.

**The entropy snapshot fails closed on `PARSER_UNAVAILABLE` too.**
`parseSourceFiles` now returns a `Result`: a syntax error in one file is still
skipped, but a parser that cannot run fails the call with
`SNAPSHOT_BUILD_FAILED` (`details.reason: 'PARSER_UNAVAILABLE'`), so
`buildSnapshot` — and `harness cleanup` / `detect_entropy` — error instead of
reporting zero dead code over files they never read. `buildSnapshot` now builds
its dependency graph from the files it already parsed
(`buildDependencyGraphFromParsed`) instead of re-parsing every file and
replacing a failed graph build with an empty graph; nodes and edges are
unchanged. `check-arch`'s coupling and forbidden-imports collectors abstain with the
parser's cause in `metadata.error` rather than with an unexplained
`filesAnalyzed: 0`.

**`harness insights` / `insights_summary` no longer report Health PASS over an
analysis that failed.** `gatherEntropyBlock` turned any analyzer error into zero
counts, so the health block read PASS. It now throws, so the health and entropy
blocks are `null` with a `warnings[]` entry, and the text report prints
`NOT MEASURED (see warnings)` instead of omitting them. This covers the
unavailable parser (`SNAPSHOT_BUILD_FAILED`) and also `ENTRY_POINT_NOT_FOUND`.

**The abstention now carries the parser's own diagnosis.** `reason` was the bare
string `'Parser unavailable'`, which `check-deps` and the MCP tool print
verbatim — it told an operator something was wrong but never what. It is now
`Parser unavailable: <health message>`, keeping the greppable prefix that
consumers and their tests match on.

**One behaviour change on a working install.** On this repository `health()`
returns `available: true` with version `8.59.2`, from both built formats, and
every parser consumer is byte-identical. The exception is `harness insights` /
`insights_summary` on a project where no entropy entry point resolves (this
monorepo's own root is one). There, the health and entropy blocks previously
read PASS with zero counts. They now read NOT MEASURED, with an
`ENTRY_POINT_NOT_FOUND` warning. Everything else changes only when the parser
genuinely is unavailable. In that state the previous behaviour was a
module-load crash. Each consumer now reports a named error or abstention:
`check-deps`, the `check_dependencies` MCP tool, `ci check`, `review`,
`check-arch`, `cleanup`, `detect_entropy`, `comprehend`, and `insights`.
