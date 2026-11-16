---
'@harness-engineering/cli': patch
---

The craft skills' "Invoked as a review hook" sections and the `harness-code-review` / `harness-autopilot` craft forwarding rules no longer claim that a repo-relative `files` entry yields a clean pass with zero prompts. Since #2571 the nine collector-based craft domains resolve a relative entry against the tool's `path`, so the docs now say so; `design_craft` still requires absolute paths and throws `ENOENT` on a relative one, and absolute remains the recommended forwarding form for every domain. A skills contract test now rejects the stale claim in all four platform copies and requires each domain's claim to be backed by a row in the behavioural relative-files test.
