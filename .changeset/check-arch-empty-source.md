---
'@harness-engineering/cli': patch
---

fix(cli): a fresh `harness init --tier minimal` project can make its first commit, and `check-arch` reports an abstention the same way in every output mode (#2672)

- The scaffolded pre-commit hook now treats `check-arch` exit 3 (`ZERO_DENOMINATOR`: nothing measured, e.g. no source files yet) as "nothing to check yet" and prints a one-line note instead of blocking. Violations (1) and errors (2) still block the commit.
- `check-arch` no longer prints "validation passed" for a run that measured nothing; it says the run abstained. `--json` output gains additive `verdict` (`passed` | `failed` | `abstained`) and `abstained` fields so a consumer no longer has to infer an abstention from the exit code alone. The exit code is unchanged (3).
