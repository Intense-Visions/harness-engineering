# Plan: comprehend-smoke chatty-reply flake (#2231)

## Symptom

`packages/cli/tests/comprehension/comprehend-smoke.e2e.test.ts:298`
(`recovers end-to-end from a chatty first reply`) failed once on macOS CI (PR
#2229, run 36183216985, attempt 1): `expected 'v Compiled 1 module(s): 0 semantic,
1 static-only.' to match /1 semantic/`. A re-run with no code change passed.

## Investigation

The issue proposed one mechanism: the fake `claude` counter
(`n = parseInt(read) || 0`) reads back empty on the second call, so the
corrective retry is also handed prose. I tested that rather than assuming it.

1. **The CI log does not say why.** The test checks stdout only, and the
   `comprehension: semantic generation ... failed (...)` warning goes to stderr,
   which is never printed. Both mechanisms (a chatty retry, or a first call that
   throws) produce the same assertion message.
2. **Provider code.** In `packages/intelligence/src/analysis-provider/claude-cli.ts`,
   `runClaude` parsed the buffered stdout inside `child.on('exit')`. Node
   documents that at `'exit'` the child's stdio streams may still be open, so the
   buffer can still be empty or partial. An empty buffer makes `JSON.parse` throw.
   That throw counts as a real failure, so no corrective retry runs and the unit
   falls back to `semantic: absent`. That matches the CI output exactly.
3. **Reproduction.** I wrote a standalone stress script that runs the real built
   `harness comprehend --all` with the test's own fake `claude` (taken from the
   test file), 24 at a time, with CPU load from 10 `yes` processes.
   The stderr reasons are grouped:

   | Build                                  | Failures         | stderr reason                                                                |
   | -------------------------------------- | ---------------- | ---------------------------------------------------------------------------- |
   | origin/main (`'exit'`), run 1          | 5 / 200          | `Failed to parse Claude CLI output: Unexpected end of JSON input. stdout ""` |
   | origin/main (`'exit'`), paired control | 5 / 300          | same, all 5                                                                  |
   | only `runClaude` switched to `'close'` | 0 / 200, 0 / 300 | none                                                                         |
   | full fix + new fake marker             | 0 / 300          | none                                                                         |

   In 800 stressed runs, no failure was a "both replies prose" retry failure. The
   counter-readback mechanism was **not observed**: on one machine, a second
   process that starts after the first has exited sees the completed write.

## Root cause

`packages/intelligence/src/analysis-provider/claude-cli.ts:186` (`runClaude`),
`:257` (`runClaudeStream`) and `packages/intelligence/src/analysis-provider/generic-cli.ts:207`
(`runCli`) parsed child stdout on `'exit'` instead of `'close'`. Under load the
reply can arrive after `'exit'`, so a valid reply is lost: the provider throws
"Unexpected end of JSON input", and comprehension degrades to static-only. This
is a **product defect**, not only a test defect. Live `claude`, codex and gemini
calls can lose their reply in the same way.

## Fix

- All three handlers now parse on `'close'`, which fires only after stdio has
  drained. The exit code is passed the same way, and the timeout/spawn-error
  paths are unchanged.
- Regression tests in `packages/intelligence/tests/analysis-provider/{claude-cli,generic-cli}.test.ts`:
  each fake child emits `'exit'`, then stdout `'data'`, then `'close'`. All 3
  tests fail on origin/main ("Failed to parse ...") and pass with the fix. The
  existing fakes now emit `'close'` after `'exit'`, as Node does.
- As the brief asked, the fakes now detect the first call atomically (in
  `comprehend-smoke.e2e.test.ts` and `cli/tests/e2e/support/fake-provider.ts`).
  The `|| 0` counter is replaced by `fs.openSync(marker, 'wx')`: EEXIST means a
  later call, and any other error throws. This makes the test's state machine
  unambiguous. **It is defense in depth, not the cause of the observed failure.**

## Remediation actions / assumptions

- Assumption: the CI failure on 2026-09-25 had the same cause as the local
  reproduction. The CI log has no stderr, so this cannot be proven directly. The
  reproduction gives the identical stdout, and it is the only failure mode seen in
  800 stressed runs.
- No test was skipped, retried or loosened.
- Deferred: `packages/orchestrator/src/agent/backends/{claude,codex}.ts`,
  `workspace/hooks.ts` and `runtime/docker.ts` also listen on `'exit'`. They were
  not changed here: they stream line by line or only need the exit code, so they
  need a separate audit. Follow-up candidate.
- Deferred: the smoke test does not print the comprehend stderr when it fails,
  which hid the real cause. Follow-up candidate: include `r.stderr` in the
  assertion message.
