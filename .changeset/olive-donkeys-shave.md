---
'@harness-engineering/dashboard': patch
---

fix(dashboard): validate a roadmap `External-ID` before interpolating it into the authenticated GitHub API path

`assignGithubIssue` parsed `External-ID` with an unconstrained capture and spliced the
result, unencoded, into the path of a `POST https://api.github.com/...` request carrying
the operator's `GITHUB_TOKEN`. A crafted External-ID could therefore choose the path of
that credentialed request (for example `github:x/../../../user/emails?#1` resolved to
`POST https://api.github.com/user/emails`). The External-ID is now constrained to
`github:<owner>/<repo>#<number>`, bare dot segments are rejected, and each path segment is
percent-encoded. Malformed IDs return `false` exactly as before.
