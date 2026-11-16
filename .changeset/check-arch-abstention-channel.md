---
'@harness-engineering/cli': patch
---

`harness check-arch` no longer scores a crashed or abstained collector's `0` as a real measurement (#2268). Such a category is now withheld from the baseline diff (its known violations are no longer reported as "resolved" and cannot mask a regression), `--update-baseline` leaves its baseline entry unchanged and warns instead of ratcheting it down to 0, the result carries an additive `abstainedCategories` list, and a run in which every category abstained exits `3` (`ZERO_DENOMINATOR`) instead of passing.
