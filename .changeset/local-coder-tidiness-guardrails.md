---
'@harness-engineering/orchestrator': patch
---

fix(orchestrator): guardrails against local-coder collateral mess

A weak local coder reliably writes the core change but botches collateral edits,
which then block a clean ship. Two complementary guardrails:

- **Stage prompt (coder guidance):** fixes a self-contradictory instruction — it
  told the coder never to use `apply_patch`, which is codex's ONLY edit tool, so
  the guidance was unfollowable and the coder fell back to destructive full-file
  rewrites (e.g. regenerating a shared reference doc, dropping every other entry).
  Reframed to be tool-agnostic: edit surgically with minimal hunks, APPEND to
  existing docs/lists (never regenerate), never create backup copies, and actually
  RUN any test you author (a test with inverted valid/invalid cases fails the gate).

- **Pipeline (coder-independent backstop):** agent scratch/backup cruft
  (`*.bak`, `*.orig`, `*.tmp`, `*.rej`, `*~`, `temp_*`, `tmp_*`) is now excluded
  from the spec-vs-diff eval (so it can't mislead the judge) and kept OUT of the
  shipped commit (so a PR never carries it), via glob pathspecs — regardless of
  whether the coder cleans up after itself.
