# Make review-ci survive large diffs: bounded git buffer + graceful degradation

## Overview

`harness review-ci` shells out to `git` to resolve the diff it reviews. The
injectable git seam (`defaultRunGit` in `packages/cli/src/commands/review-ci.ts`)
runs `execFileSync('git', args, { encoding: 'utf-8' })` with **no `maxBuffer`
option**, so the child's stdout inherits Node's default 1 MB (`1048576`-byte)
cap. `git diff <range>` for any PR whose unified diff exceeds ~1 MB overflows that
buffer, and `execFileSync` throws `Error: spawnSync git ENOBUFS`.

Because the commander action (`createReviewCiCommand().action`) wraps the call in
no `try/catch`, the error propagates to the top-level `handleError`, which prints
the message to stderr and calls `process.exit(2)`. The result: **exit code 2, an
empty stdout, and no verdict envelope — even when `--json` was requested.** A
consumer cannot tell "the reviewer could not run" from "the reviewer objected".

This makes the review gate structurally unable to review large PRs, which are the
PRs that most need reviewing. Reported by an external user against 10.1.0 and
10.2.0 with a 1.5 MB / 363-file diff (see issue #1098).

This change fixes both halves of the failure:

1. **Raise the git seam's `maxBuffer`** to a generous bound so ordinary large
   diffs (the common case) never overflow.
2. **Degrade gracefully** — if any git/diff resolution step still throws
   (an even larger overflow, or a genuinely un-runnable git invocation),
   `review-ci` emits a valid, parseable degraded verdict that records the
   internal error, instead of crashing with a bare exit 2 and empty stdout.

## User-Visible Behavior

- `harness review-ci ... --json` against a large PR (well over the old 1 MB
  ceiling) now runs the review normally and streams a valid verdict JSON to
  stdout. The `spawnSync git ENOBUFS` crash no longer occurs for real-world
  diffs.
- If a git resolution step nonetheless fails (buffer overflow beyond the new
  bound, missing ref, git not on PATH, unreadable range), `review-ci` no longer
  exits 2 with empty stdout. It emits the documented verdict envelope with
  `skipped: true` and `skipReason: "internal error: <message>"`, an empty
  `findings` array, and the `floor-only` runner — so a `--json` consumer always
  receives a parseable result and can distinguish an abstention from an
  objection.
- The degraded (abstained) path exits with code `3` (the harness
  `ZERO_DENOMINATOR` "ran but examined nothing" code), which is non-zero — an
  abstained gate must never read as a clean green pass — but distinct from `1`
  (the reviewer objected) and `2` (an unhandled crash). The exit code and the
  `skipped` flag together let CI attribute the outcome without scraping stderr.
- The human terminal summary for the degraded path states plainly that the
  review did not run and that this is not an approval.

## Decisions made

### D1: Raise `maxBuffer` on the git seam to 256 MB

The one-line root-cause fix is to pass an explicit `maxBuffer` to the
`execFileSync` git call. The bound must be generous enough that no realistic PR
diff overflows it, yet still bounded so a pathological or adversarial diff cannot
silently exhaust process memory.

- **Chosen bound: 256 MB (`256 * 1024 * 1024` bytes).** The reported crash was a
  1.5 MB diff; 256 MB is ~170x that and comfortably covers even large
  generated-file or vendored-lockfile diffs. It is finite, so an unbounded diff
  is still caught (by D2) rather than crashing the host.
- Rejected: unbounded (`Infinity`) — trades a crash for a memory-exhaustion DoS
  and hides the pathological case instead of surfacing it as an abstention.
- Rejected: streaming `git diff` to a temp file and reading it back (issue point
  2). It removes any fixed ceiling, but adds temp-file lifecycle, cleanup, and
  path-handling surface — its own failure modes — for a payload that D1 + D2
  already handle safely. Recorded as a future consideration if diffs routinely
  approach the 256 MB bound.

The bound is applied on the shared `defaultRunGit` seam, so **every** git call it
makes (`git symbolic-ref` during range resolution and the payload-carrying
`git diff`) is covered by one change — no sibling call is left on the 1 MB
default.

### D2: Degrade to an abstained verdict instead of crashing

`maxBuffer` alone is a deferred version of the same bug — any fixed ceiling can
be exceeded. So git resolution is wrapped such that a thrown git/diff/parse error
produces a degraded `CiReviewResult` rather than propagating.

- The degraded verdict is built through the existing `buildCiReviewVerdict`
  helper so it satisfies every schema invariant: `runner: "floor-only"`,
  `ranLlmTier: false`, `assessment: "comment"` (advisory — no blocking
  findings), empty `findings`, `skipped: true`,
  `skipReason: "internal error: <message>"`. The verdict's own `exitCode` is `0`
  (schema requires it for a non-blocking assessment).
- The **process** exit code for the degraded `CiReviewResult` is `3`
  (`ExitCode.ZERO_DENOMINATOR`), decoupled from the verdict's internal
  `exitCode`. This reuses the harness's established "abstained, must never read
  as green" convention rather than inventing a new code.
- Only git/diff resolution is wrapped. `assertKnownRunner` stays **outside** the
  guard: an unknown `--runner` is caller error and must keep failing fast with
  exit 2, not be laundered into an abstention.

### D3: Keep the fix in the CLI layer

The ENOBUFS originates entirely in the CLI git seam; core's `runCiReview`
receives a `DiffInfo` and never touches git. Both the buffer bound and the
degradation therefore live in `packages/cli/src/commands/review-ci.ts`, with no
change to core's orchestrator or verdict schema.

## Technical Design

File: `packages/cli/src/commands/review-ci.ts`

1. **Bounded git seam.** Introduce a named constant for the buffer bound and pass
   it to `execFileSync`:

   ```ts
   /** Generous bounded stdout cap for git calls (256 MB). See spec D1. */
   export const GIT_MAX_BUFFER_BYTES = 256 * 1024 * 1024;

   const defaultRunGit: RunGit = (args) =>
     execFileSync('git', args, {
       encoding: 'utf-8',
       maxBuffer: GIT_MAX_BUFFER_BYTES,
     })
       .toString()
       .trim();
   ```

2. **Degraded-result builder.** A pure helper that assembles a degraded
   `CiReviewResult` from an error, using `buildCiReviewVerdict` for the verdict
   and `ExitCode.ZERO_DENOMINATOR` for the process exit code:

   ```ts
   export function buildDegradedResult(err: unknown): CiReviewResult {
     const message = err instanceof Error ? err.message : String(err);
     const verdict = buildCiReviewVerdict({
       runner: 'floor-only',
       ranLlmTier: false,
       assessment: 'comment',
       findings: [],
       skipped: true,
       skipReason: `internal error: ${message}`,
     });
     return {
       verdict,
       exitCode: ExitCode.ZERO_DENOMINATOR,
       terminalOutput:
         'harness review-ci — could not run (abstained)\n' +
         `reason: ${verdict.skipReason}\n` +
         'The review did not run; this is not an approval.',
       ranLlmTier: false,
     };
   }
   ```

3. **Guarded orchestration.** In `runReviewCi`, keep `assertKnownRunner` outside
   the guard; wrap range resolution, raw-diff resolution, and `buildDiffInfo` in
   a `try/catch` that returns `buildDegradedResult(err)` on failure. The success
   path is unchanged.

The command action already routes `result.exitCode` to `process.exit` and always
calls `emitReviewCi` (which emits the JSON envelope for `--json`), so no action
change is required beyond `runReviewCi` returning a degraded result rather than
throwing.

## Integration Points

- **Entry Points** — No new entry point. Behavior change confined to the existing
  `harness review-ci` command and its exported helpers (`buildDegradedResult`,
  `GIT_MAX_BUFFER_BYTES` become exported for unit testing).
- **Registrations Required** — None. No new command, MCP tool, skill, or barrel
  export; the command is already registered.
- **Documentation Updates** — None required for a bug fix of existing behavior.
  A changeset entry documents the fix.
- **Architectural Decisions** — None rise to a standalone ADR; the decisions are
  local implementation choices captured above (small-tier change).
- **Knowledge Impact** — None. No new domain concept enters the knowledge graph.

## Success Criteria

1. `defaultRunGit` passes an explicit, bounded `maxBuffer` (256 MB) to
   `execFileSync`, covering both the `symbolic-ref` and `diff` git calls it makes.
2. A `git diff` producing a payload larger than the old 1 MB default no longer
   throws `ENOBUFS`; `review-ci` completes and yields a real verdict/JSON.
   (Regression test drives the git seam with a >1 MB synthetic payload.)
3. When a git resolution step throws (simulating an un-runnable git call or an
   overflow beyond the bound), `runReviewCi` returns a degraded
   `CiReviewResult`: `skipped: true`, `skipReason` beginning `internal error:`,
   empty findings, `floor-only` runner, and process `exitCode === 3`. It does
   **not** throw and does **not** exit 2 with empty stdout.
4. With `--json` requested on the degraded path, a parseable verdict envelope is
   emitted to stdout (validated by `parseCiReviewVerdict`).
5. An unknown `--runner` still fails fast (exit 2) and is **not** converted into
   an abstention.
6. Full build (`turbo run build`), lint, typecheck, and the review-ci test
   suites pass; baselines and plugin command count are unchanged.

## Implementation Order

1. Add `GIT_MAX_BUFFER_BYTES` and apply it to `defaultRunGit`.
2. Add `buildDegradedResult` and wrap git resolution in `runReviewCi`.
3. Add regression tests: (a) a >1 MB synthetic diff through the git seam yields a
   real verdict without ENOBUFS; (b) a throwing git seam degrades to a parseable
   abstained verdict with exit 3; (c) an unknown runner still exits 2.
4. Add a changeset; run the full gauntlet.
