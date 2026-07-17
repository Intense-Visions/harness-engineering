---
'@harness-engineering/orchestrator': patch
---

refactor(ollama): flatten the native `/api/chat` adapter to clear the complexity budget

#855 landed the native transport in `OllamaBackend` and pushed two functions past
the repo complexity budget: `fromNativeResponse` (cyclomatic 12 > warn 10) and
`toNativeMessages` (nesting depth 5 > warn 4). Extract two small same-file helpers —
`nativeUsage` (native token counts → internal `usage`) and `toNativeToolCalls`
(assistant tool-calls string-args → object-args) — and give `normalizeNativeToolCalls`
a block body. Both functions now sit under budget and the aggregate complexity/nesting
counts return to their pre-#855 baseline. Behavior-neutral: all 31 ollama backend tests
pass unchanged.
