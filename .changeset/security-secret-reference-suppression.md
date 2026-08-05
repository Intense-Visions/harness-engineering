---
'@harness-engineering/core': patch
---

Stop the security review flagging secret **references** as hardcoded secrets.

Both the deterministic secret rules (`SEC-SEC-*`) and the heuristic review-tier
secret detector match assignment shapes like `TOKEN="..."`. When the right-hand
side is a variable or expression reference rather than a literal, nothing is
embedded in source — the real value is resolved at runtime — so a
"Hardcoded secret or API key detected" finding there is a false positive.

The detectors now extract the matched value and suppress the finding when it is
composed solely of references:

- shell/env variables: `$NAME`, `${NAME}`, `${NAME:-default}`
- CI expressions: `${{ secrets.X }}`, `${{ env.X }}`, `${{ vars.X }}`, and any
  `${{ ... }}`

This mis-fired on essentially every pull request touching a CI workflow file
(e.g. `GH_TOKEN="$AUTOAPPROVE_PAT"`, `TOKEN: "${{ secrets.FOO }}"`), and in
floor-only review mode it produced a blocking request-changes verdict. Genuine
hardcoded literals — including values with a variable-only prefix such as
`"${PREFIX}sk-live-..."` — are still detected. The shared reference check lives
in `security/secret-reference.ts` so both detection tiers benefit.
