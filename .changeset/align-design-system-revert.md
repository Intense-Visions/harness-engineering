---
'@harness-engineering/cli': minor
---

Add `--revert` to `harness align-design-system` (design-pipeline #1, completes v1 spec SC #26 + #27). After each successful write run, the applied diffs plus a SHA-256 of each post-apply file are persisted to `.harness/align/last-batch.json`. Running `align-design-system --revert` reads that batch, content-hash-checks every file, and inverse-applies each diff — skipping files that were edited externally between apply and revert. Surface area: CLI flag, MCP `align_design_system.revert` input, `meta.revert: true` on the output, and 4-platform SKILL.md updates. The persisted batch is gitignored at `**/.harness/align/`.
