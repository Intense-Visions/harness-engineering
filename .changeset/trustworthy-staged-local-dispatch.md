---
'@harness-engineering/orchestrator': minor
---

Bring #843's trustworthiness guarantees to the staged local-dispatch path: a staged unit that produces an empty workspace diff now halts to needs-human instead of being marked done; no-cognitiveMode execution stages route to `routing.default` (not the design reasoner) while explicitly-hinted and design stages keep their routing; the LOCAL stage prompt drives the model to produce its declared output. Unstaged workflows and the single-dispatch path are byte-identical.
