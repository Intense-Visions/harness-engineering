---
'@harness-engineering/cli': minor
---

Add `cli-ergonomics-craft` — an LLM-judgment ceiling skill for command-line
ergonomics quality, the structural twin of `docs-craft` and the ceiling
counterpart to mechanical CLI checks. Unlike the other craft skills it has no
rule-based floor twin: a linter can confirm a flag is documented, but only
judgment can tell whether the name is predictable, whether the help teaches, and
whether the error says what to do next. It critiques whether command and flag
names are predictable and consistent, whether help text is task-oriented,
whether errors are actionable, whether defaults are sane and safe, whether
output is scannable and terminal-aware, whether the CLI composes (pipeable,
machine-readable, honest exit codes), and whether destructive actions are
guarded — 7 seed rubrics emitting 3-axis findings (tier × impact × confidence),
a curated exemplar set (gh / cargo / ripgrep / docker / Stripe CLI), and
kind-aware rubric filtering (a pure namespace command is critiqued only for
naming and help). Ships the `harness cli-ergonomics-craft` CLI, the
`cli_ergonomics_craft` MCP tool, and the cross-cutting `critiqueCommandFile` API.
