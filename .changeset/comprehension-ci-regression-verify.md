---
'@harness-engineering/cli': minor
---

comprehension: add a token-free semantic-regression gate (ADR 0109, slice 4). `harness comprehend --check --since <ref>` now additionally fails when any module's unit regressed `semantic: present → absent` versus that git ref — a frontmatter-only comparison with no provider, no LLM, and no credential. Base and head are read the same way (committed shards via git + a lenient frontmatter parse), so a shard cannot be counted present on one side and dropped on the other; an unreadable/unfetched ref fails LOUD rather than silently passing with a success message. This lets CI enforce that ordinary edits don't silently strip the committed semantic substrate, while the fix always lives on the developer's own session/subscription (never a CI API token). Wired into CI as an advisory PR gate (promotable to blocking).

Known gap (by design): the gate detects in-place `present → absent` downgrades of a module that exists on both sides. A shard **deletion** or a **module rename** that drops semantic is not flagged (the module is treated as removed, not regressed). Cross-checking deleted shards against still-present source paths is a possible future extension.
