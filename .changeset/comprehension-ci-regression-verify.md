---
'@harness-engineering/cli': minor
---

comprehension: add a token-free semantic-regression gate (ADR 0109, slice 4). `harness comprehend --check --since <ref>` now additionally fails when any module's unit regressed `semantic: present → absent` versus that git ref — a frontmatter-only comparison with no provider, no LLM, and no credential. This lets CI enforce that ordinary edits don't silently strip the committed semantic substrate, while the fix always lives on the developer's own session/subscription (never a CI API token). Wired into CI as an advisory PR gate (promotable to blocking).
