---
'@harness-engineering/cli': patch
---

Fix `harness review-ci` crashing with `spawnSync git ENOBUFS` (exit 2, no verdict) on any diff larger than ~1 MB (#1098).

- The injectable git seam now passes an explicit, bounded `maxBuffer` (256 MB) to `execFileSync`, so `git diff` for large PRs no longer overflows Node's 1 MB default and throws `ENOBUFS`. The bound is applied on the shared seam, covering both the `symbolic-ref` and payload-carrying `diff` calls.
- `review-ci` now degrades gracefully: if a git/diff/parse step still fails (an overflow beyond the bound, a missing ref, git absent from PATH, or an unparseable diff), it emits a valid, parseable verdict envelope with `skipped: true` and `skipReason: "internal error: <message>"` instead of crashing with a bare exit 2 and empty stdout. A `--json` consumer always receives a parseable result and can distinguish "the reviewer could not run" (process exit 3, abstained) from "the reviewer objected" (exit 1).
- An unknown `--runner` still fails fast (exit 2) and is never laundered into an abstention.
