---
'@harness-engineering/cli': patch
---

`generate-agent-definitions` no longer emits dead relative links. Skills inlined into an agent definition link sibling files such as `references/confidence-rubric.md` relative to their own skill directory, which resolved next to the generated file where nothing is written. Those links are now rendered as plain text naming the skill-qualified target (e.g. `harness-code-review/references/confidence-rubric.md`). Closes #2132.
