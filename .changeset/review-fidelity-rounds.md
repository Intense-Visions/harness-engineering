---
'@harness-engineering/types': minor
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

feat: review fix rounds (shift-left pipeline fidelity, unit 2 of 5).

- **Fix rounds.** New `harness check-review-receipt --archive-round <review-dir>` archives an ended round into `round-R/` and prints the next round. A review that runs again after a fix is a new round recorded in the receipt (`round`, `priorRounds`); the round is 1 + the archived rounds, so a failed mechanical phase or a crash keeps it. The gate fails a `round` or `priorRounds` that does not match the `round-R/` archives beside the receipt (`ROUND_MISMATCH`, `PRIOR_ROUNDS_MISMATCH`), recounting each prior round's blocking count from its archived findings files.
- **Only a fix commit starts a round.** `--archive-round` refuses, moving nothing, a directory with no `receipt.json` (a round that wrote none is not a round), a path that is not a review directory (`phase-N` or `final-all` under `.harness/sessions/<slug>/reviews/`, or a directory directly under `.harness/reviews/`), a HEAD that is still the head the ended round reviewed, and archives not numbered `round-1` to `round-(R-1)`. It also refuses a `receipt.json` that is not a regular file. It moves the files through a staging directory, `receipt.json` last, and moves them back on an error, so an error archives the round whole or not at all; an interruption (the process dies) leaves `.round-R.partial`, the gate fails `ROUND_ARCHIVE_INTERRUPTED` while it exists, and the next `--archive-round` finishes or undoes it. The gate fails a round after the first at the head the round before it reviewed (`ROUND_SAME_HEAD`) and archives numbered out of sequence (`ROUND_MISMATCH`). A review run again at the same head stays in its round and overwrites its files.
