---
'@harness-engineering/core': patch
---

Sharpen the floor-tier review heuristics so they stop firing on benign code
and docs (they were reddening the required-review gate on ordinary PRs):

- **SQL injection**: match SQL keywords as whole words, so prose like
  `was updated` / `files created` in a log line or template literal no longer
  reads as an `UPDATE`/`CREATE` query; and skip non-code files (a Markdown
  table with the word "updated" was flagged as SQL injection).
- **Division-by-zero**: only flag a lowercase variable (or parenthesised)
  divisor — a SCREAMING_CASE constant (`/ DAY_MS`) or numeric literal cannot
  be zero at runtime.

Real SQL concatenation and real variable division are still detected.
