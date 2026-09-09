---
'@harness-engineering/cli': patch
---

Replace the wall-clock assertion in `scan-config.test.ts` with a deterministic
end-to-end invariant.

`runScanConfig > edge cases > scans large config files within 100ms` asserted
`elapsed < 100ms` and nothing else. It took `main` red on `windows-latest` at
113ms — 13ms over budget, with no change to the code under test. On an idle dev
machine the same payload scans in a measured mean of 0.89ms, so the assertion had
112x headroom and still lost: the number was reporting runner load, not the scan.
Per issue #2046, raising the budget is explicitly not the remedy — a larger
threshold lowers the failure rate without removing the nondeterminism, and it
silently weakens the only thing the assertion was for.

The case is renamed to `scans a large config file end to end, without false
positives at scale` and now asserts a deterministic invariant: an ~11KB body of
clean prose carrying ONE high-severity line placed LAST must produce exit 2 and
exactly one finding, reported on the final line. That is strictly stronger than
the budget it replaces — a wall-clock assertion gets _greener_ if the scan
silently truncates its input, whereas the line-number assertion fails; and
"exactly one finding" catches the accidentally-quadratic per-line re-match the
old comment named. Both properties were verified by source mutation.

Test-only: no source or behaviour change, no test skipped, deleted, or retried,
and the file's test count is unchanged at 24.

Also removes the now-dead `HARNESS_COVERAGE` plumbing from
`packages/cli/vitest.config.mts` (argv `--coverage` detection plus the `test.env`
forwarding). The deleted `budgetMs` line was its only consumer in this package.
`packages/orchestrator/vitest.config.mts` keeps an independent copy of the same
pattern with a live consumer and is untouched.
