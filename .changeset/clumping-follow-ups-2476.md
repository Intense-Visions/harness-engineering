---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Clumping follow-ups (#2476):

- **Review comments keep their committable suggestion.** A sub-floor finding carrying a small (`< 10` lines) suggestion now keeps its own anchored inline comment with its ` ```suggestion ` block instead of being folded into a grouped comment, since GitHub applies a suggestion only at the line its comment is anchored to. A grouped comment now also states which file it is anchored on, because its other members' lines carry no marker in the diff.
- **The comment-grouping report is returned, not discarded.** `ReviewPipelineResult.githubCommentReport` (a `ClumpedCommentReport`, now with a `committable` count) explains a comment count far below the finding count; `run_code_review` emits it next to `githubCommentCount`, and `harness agent review --json` carries `githubComments` and `githubCommentReport`.
- **`harness fleet clump-dispatch` exit codes are distinct per refusal.** An unreadable `--verdict` file now exits `17` and a clump with no reported outcomes exits `18`; `14` means only "the input carries no clump set".
