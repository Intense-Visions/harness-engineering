---
'@harness-engineering/core': patch
---

fix(core)!: constrain the canonical External-ID regex and re-validate at every authenticated GitHub API sink

`parseExternalId` — the format authority named by ADR 0051 — matched
`^github:([^/]+)\/([^#]+)#(\d+)$`. The owner capture admitted `.`, `..` and `?`; the repo
capture additionally admitted `/`. Ten adapter call sites spliced those captures,
unencoded, into `${apiBase}/repos/${owner}/${repo}/issues/${n}/...` on requests carrying
`Authorization: Bearer <token>`, so a crafted `External-ID` in a PR-contributable roadmap
shard could choose the path of a credentialed request — `github:x/../../../user/emails?#1`
resolved to `POST https://api.github.com/user/emails`.

Owner and repo are now held to GitHub's own name grammar, bare dot segments are rejected
separately (`encodeURIComponent` does not encode `.`), and a new `githubRepoPath` export
re-asserts and percent-encodes at each sink independently of the regex, so a future
loosening of the pattern cannot silently re-open the traversal.

**Breaking:** an `External-ID` that GitHub itself could never have issued is now rejected
rather than parsed. No committed roadmap shard is affected — all 280 shards carrying a real
`External-ID` still parse.

Second instance of the class fixed for the dashboard in #1842.
