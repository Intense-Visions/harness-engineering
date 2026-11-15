---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

fix(entropy): `entropy.patterns` `max-lines` rules now fire. `checkMaxLines` was a stub that returned no violations for any file, so `harness cleanup -t patterns` reported a `max-lines` rule as clean whatever the file length. It now counts each file's lines the way ESLint's `max-lines` does (blank and comment lines count, the empty line after a trailing newline does not) and reports at the first line over the limit; a file it cannot read is reported rather than passed. A pattern whose rule type has no checker is now reported as unchecked instead of silently skipped, and the checker table is typed exhaustively over the rule-type union. (#2324)
