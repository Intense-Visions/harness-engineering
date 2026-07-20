---
'@harness-engineering/orchestrator': patch
---

fix(orchestrator): harness-fit probe filesTouched was always 0 (HIGH band unreachable)

`extractPath` in the harness-fit probe runner sliced the tool-call event content from
the first `{` to end-of-string and `JSON.parse`d it. But the OllamaBackend (the only
backend the probe builds) records the content as `Calling write_file({...})` — with a
trailing `)` — so the parse always threw and `filesTouched` was structurally always 0.
Since `scoreBuildQuality` gates HIGH on `converged && filesTouched > 0`, NO local model
could ever score HIGH: every acting/converging model collapsed to MID (0.5), silently
under-rating the model-suitability ranker's buildQuality signal. Bound the slice to the
last `}` so the trailing `)` is excluded. Adds a regression test using the real
name-wrapped content format (the existing tests missed it by passing bare JSON).
