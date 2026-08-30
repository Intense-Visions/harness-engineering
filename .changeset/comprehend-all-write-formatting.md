---
'@harness-engineering/cli': patch
---

fix(comprehend): apply write-time prettier formatting on the `--all` / non-`--stage`
compile paths, not just the pre-commit `--stage`/hook path. A bulk
`harness comprehend --all` (or any non-stage run) followed by a manual `git add` +
commit previously wrote raw, double-quoted YAML frontmatter shards that an adopter's
own prettier-on-markdown lint-staged step then reflowed at commit time — causing the
lint-staged stash/restore "dribble" and a whole-tree `format:check` risk. Shard
formatting is now path-independent: every freshly-compiled shard lands
already-prettier-stable. Best-effort (a missing prettier never blocks a run).
