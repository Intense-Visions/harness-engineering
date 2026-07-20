---
'@harness-engineering/orchestrator': patch
---

feat(orchestrator): local execution stages self-verify (typecheck + lint + full tests) before finishing

The local staged-execution prompt now includes an explicit "definition of done": if
the stage changed code, run typecheck + lint + the FULL package test suite for each
changed package and fix every failure before stopping — rather than leaning on the
(slow, sometimes-insufficient) gate→retry loop. It names the two failure modes that
repeatedly blocked local runs: type errors tests miss (vitest runs through esbuild,
which strips types, so tests pass while `tsc` fails) and inventory/count assertions
elsewhere in the suite that a new rule/export invalidates. This makes staged local
convergence markedly more reliable — the model catches its own errors in-session
instead of discovering them one gate-block at a time.
