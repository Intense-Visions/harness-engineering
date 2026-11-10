# Main Health Alarm D4 reachability: ANSI-safe vitest summary assertion

Refs #2353

## Symptom

The `e2e-nightly` job of `.github/workflows/main-health.yml` failed on every
scheduled run since 2026-10-22 (19 consecutive reds; latest run 42660494703).
The failing step was "Assert gated CLI suites outside tests/e2e are reachable".
Vitest reported `Tests 11 passed (11)` in that same step.

## Root cause

`.github/workflows/main-health.yml:130` (pre-fix) ran

```sh
grep -qE "Tests +[0-9]+ passed" /tmp/d4-reachability.log
```

On the runner, vitest colorizes its summary. The captured line from run 42660494703 is:

```
ESC[2m      Tests ESC[22m ESC[1mESC[32m11 passed ESC[39m...
```

The escape sequences sit between `Tests ` and `11`, so `Tests +[0-9]+` cannot
match. `set -euo pipefail` turns the non-match into exit 1. The step was added in
b53c95dff (#2322, merged 2026-10-21), and the first scheduled run after it was
the first red. Because the step failed whether or not the suite ran, it no longer
proved anything. That defeats the D4 reachability guarantee it exists for.

## Evidence

The log comes from `gh run view 42660494703 --log-failed`. GitHub renders ESC as
a literal `^[`, so we restored it to a real `\x1b` with
`perl -pe 's/\^\[/\x1b/g'`. That gives 17 lines containing ESC.

| Fixture                                | Old step | New step            |
| -------------------------------------- | -------- | ------------------- |
| real colored log (all 11 passed)       | exit 1   | exit 0 (11 passed)  |
| real colored log, 1 skipped injected   | exit 1   | exit 1 (SKIPPED)    |
| real colored log, summary line removed | exit 1   | exit 1 (no summary) |
| plain `Tests 10 passed \| 1 skipped`   | exit 1   | exit 1 (SKIPPED)    |
| plain error output, no summary         | exit 1   | exit 1 (no summary) |

The old step returns exit 1 for every fixture, so it cannot tell a pass from a
failure. The new step accepts only the real pass.

## Fix

- New `scripts/assert-vitest-ran.mjs` (dependency-free; exported `stripAnsi` and
  `assessVitestLog`). It strips CSI/OSC sequences and then requires a
  line-anchored `Tests N passed` summary with N >= 1. It keeps the original
  "any `skipped` fails" rule. Exit codes: 0 ran, 1 not ran, 2 usage/unreadable
  log.
- The workflow step calls the script in place of the two inline greps. The step
  also sets `NO_COLOR=1` as a second safeguard. The script works without it.
- New `tests/scripts/assert-vitest-ran.test.mjs` (9 node:test cases). These run
  in CI through `node --test 'tests/scripts/*.test.mjs'` (ci.yml:128). The
  fixtures use the verbatim colored bytes. One test is a positive control: it
  proves the old regex does NOT match the colored line.

## Verification

- `node --test tests/scripts/assert-vitest-ran.test.mjs`: 9 pass, 0 fail.
- Mutation check: with `stripAnsi` disabled (`return text;`), the run gives
  5 pass and 4 fail. After restoring it, 9 pass and 0 fail.
- Live local run of the D4 suite (`npx vitest run
tests/integration/cleanup-duplication-exit-code.e2e.test.ts` in packages/cli)
  fed to the script returned `D4: 11 test(s) passed, none skipped` with exit 0.
- After pushing: `gh workflow run main-health.yml --ref fix/main-health-d4-ansi-grep`.

## Remediation actions / assumptions

- No gate was weakened. The new step still fails when the summary is missing,
  when anything is skipped, and now also when 0 tests passed (a tightening).
- Assumption: vitest keeps its `Tests  N passed` summary wording. If that wording
  changes, the step fails loudly with "no summary". It does not pass silently.
- Workflow-audit note (out of scope, not changed): `e2e-nightly` inherits the
  workflow-level `issues: write`, which only the `main-health` job needs. A
  job-level `permissions: { contents: read }` on `e2e-nightly` would tighten
  that. It is left for a separate hygiene change.
