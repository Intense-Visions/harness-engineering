---
'@harness-engineering/cli': minor
---

Add `code-craft` — an LLM-judgment ceiling skill for code quality / readability,
the structural twin of `security-craft` and the counterpart to the rule-based
code floor (cleanup-dead-code / enforce-architecture / complexity thresholds).
It walks `packages/*/src`, extracts the substantive units a senior reviews
(functions, methods, classes) via the TS Compiler API, and critiques each unit
against 7 seed rubrics — whether the code reveals intent, whether the control
flow is honest, whether a function tells one story at one altitude, whether each
abstraction earns its keep, whether it is as simple as it could be, whether the
signature keeps its promise, and whether a senior would nod or wince. Emits
3-axis findings (tier × impact × confidence), skips files with no substantive
unit (`filesSkippedNoUnit` tracked), and delegates identifier-level naming to
`naming-craft` (re-exported as `critiqueNamesInFile`) rather than duplicating it.
A curated exemplar set (Anthropic SDK / TanStack Query / ky / SWR / date-fns)
anchors the catalog. Ships the `harness code-craft` CLI, the `code_craft` MCP
tool, and the cross-cutting `critiqueCodeInFile` API.
