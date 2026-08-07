# Proposal: deflake remaining subprocess tests + investigate Windows stream-write flake

Status: proposed
Type: test-reliability / cross-platform robustness hardening
Related: issue #1143 (subprocess-spawning tests flaky under full-suite parallelism); siblings #1153 / #1155 (same class of deflake).

Spec-first is optional for pure test/robustness hardening; this proposal mirrors
how #1153 / #1155 were scoped and records the investigation and the honest
outcome of both parts.

## Part A — issue #1143 remainder (subprocess tests flaky under full-suite parallelism)

#1153 already deflaked `core/src/solutions/scan-candidates/git-scan.test.ts` and
`core/tests/state/event-sourcing/concurrency.test.ts` by removing their
sub-global per-test `30_000` caps so they inherit core's generous 60s
`testTimeout`/`hookTimeout`. Two files from the issue remained:

### `packages/signals/tests/command-runner.test.ts` — FIXED

Root cause is a fixed subprocess timeout in **source**, not the vitest ceiling:
`defaultCommandRunner` (`packages/signals/src/command-runner.ts`) ran its
`execFile` child under a hard `timeout: 5_000`. Under a full-suite parallel run
(many vitest workers each spawning a fresh `node`), a bare `node -e` launch can
exceed 5s purely from host load; the fixed budget then kills the healthy child
and rejects, failing green code. Raising the vitest `testTimeout` alone cannot
fix this — the child is killed at 5s regardless of the outer ceiling.

Fix (minimal, production-behavior-preserving):

- `command-runner.ts`: the timeout is now an optional third argument defaulting
  to the exported `DEFAULT_COMMAND_TIMEOUT_MS` (5s). Real git/gh callers keep the
  5s default; direct callers on a loaded host (and the runner's own test) can
  widen it. The `CommandRunner` type is unchanged (2-arg), so injected-seam
  consumers are unaffected.
- `command-runner.test.ts`: the two subprocess-spawning cases pass a generous
  30s budget.
- `packages/signals/vitest.config.mts`: `testTimeout` 30s → 60s and add
  `hookTimeout: 60_000`, kept above the per-subprocess budget so the child's own
  budget (not the vitest ceiling) guards a true hang.

A larger budget only tolerates a slow/loaded runner — a genuine hang still fails
— so it cannot mask a real bug. No assertions weakened, no tests skipped.

### `packages/core/tests/review/ci/default-exec-file.test.ts` — ALREADY COVERED

This file spawns real `node -e` children through the production `defaultExecFile`
seam (default subprocess timeout 120s). It carries **no** sub-global per-test
timeout caps and **no** wall-clock assertions — every rejection assertion matches
a load-invariant message (`exited with code …`, `output exceeded N bytes`). It
therefore already inherits core's generous 60s global from #1153 (the same state
into which #1153 moved the sibling files by removing their `30_000` caps). No
change is warranted; verified 3× green under load.

### Verification

Reproduction of the original load flake was best-effort: on the dev host a bare
`node -e` launch stays ~60ms even at load average 65 (fast SSD, warm binary
cache), so the 5s ceiling could not be tripped synthetically. The mechanism is
well-documented in the issue (`command-runner.ts:14`) and the fix is
deterministic. Both target files are 3× green consecutively under CPU
saturation.

## Part B — Windows orchestrator `test` (non-coverage) ENOENT flake — INVESTIGATED, NO SOURCE FIX

Reported: on Windows CI, `@harness-engineering/orchestrator#test` intermittently
fails with ENOENT temp-path writes under `.harness/streams/<id>/N.jsonl`,
`.harness/interactions/interaction-*.json`, and `audit.log`.

Investigation of every production writer to those three path families:

- **streams** — `StreamRecorder.startRecording` (`core/stream-recorder.ts`)
  calls `fs.mkdirSync(issueDir, { recursive: true })` before its first write;
  `recordEvent` / `finishRecording` wrap their `appendFileSync` in try/catch and
  swallow (best-effort). `core` stream index (`state/stream-resolver.ts`) and
  `flight-recorder.ts` both `mkdirSync(..., { recursive: true })` before writing.
- **interactions** — `InteractionQueue.push` (`core/interaction-queue.ts`) calls
  `fs.mkdir(this.dir, { recursive: true })` before writing; `updateStatus` reads
  the file first and only writes if it exists.
- **audit** — `AuditLogger.writeLine` (`auth/audit.ts`) `mkdir(dirname(path),
{ recursive: true })` before the append and swallows failures (best-effort,
  `console.warn`, never throws); the queue chain is `.catch()`-guarded.

Every production write to the three named families already creates its parent
directory recursively before writing (or reads-first, or swallows). There is no
deterministic missing-mkdir write path, and no unguarded test-setup write to
those paths (the only direct test write, `stream-recorder.test.ts`, follows
`startRecording`).

Decisive diagnostic: a missing-parent-dir ENOENT fails **deterministically on
every platform**, not intermittently on Windows only. The Windows-only,
intermittent signature is consistent with a filesystem teardown-timing race
(fire-and-forget async writes interleaving with `afterEach` `rmSync`, under
Windows' stricter file-handle / unlink semantics), not an
ENOENT-from-a-missing-parent-dir in production code.

Per the task's explicit guidance ("if you genuinely cannot locate a missing-mkdir
write path … STOP Part B and report that honestly rather than guessing"), no
source or test change is made for Part B. Adding redundant `mkdir` calls in front
of writes that already `mkdir` (or already recreate the tree recursively) would
be gold-plating and would not address a timing race. Part A ships on its own.
