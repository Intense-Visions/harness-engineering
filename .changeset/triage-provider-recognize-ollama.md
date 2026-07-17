---
'@harness-engineering/cli': patch
---

Fix `harness roadmap triage` (and its brainstorm/approve path) to recognize the
`ollama` backend. The SEL-provider resolver and the pool health-check matched
only `type: 'local' | 'pi'`, but `ollama` became the default local backend
(#843). With the shipped default config the resolver returned `null`, so every
brainstorm halted with "no fork generator or provider wired" — the local-model
triage path could not run at all. Both call sites now also accept `type:
'ollama'` (an OpenAI-compatible `/v1` endpoint). Verified live: the brainstorm
now resolves the local provider and the model scores items. Regression test
added for the `ollama` backend type (the suite previously only exercised
`local`/`pi`, which is why it stayed green while the real default failed).
