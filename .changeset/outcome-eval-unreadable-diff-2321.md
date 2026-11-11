---
'@harness-engineering/cli': patch
---

`harness outcome-eval-ci` no longer grades an empty diff when the change diff could not
be read. `git diff` was buffered with Node's 1MB default, so any larger change threw
`ENOBUFS`, the error was swallowed as `''`, and the ship gate reported "the diff is
empty" — preferentially on the large changes it most needs to judge.

The diff is now read with a 256MB buffer, and a read that still fails is reported as
such: the evaluator is skipped, no `execution_outcome` is recorded, and the advisory
INCONCLUSIVE verdict names the failure (e.g. `ENOBUFS`) instead of describing an empty
diff.
