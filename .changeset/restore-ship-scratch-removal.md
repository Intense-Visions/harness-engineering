---
'@harness-engineering/orchestrator': patch
---

fix(orchestrator): remove scratch cruft (not just add-exclude) before ship

Restores the ship-time scratch-file removal that was orphaned when the tidiness
guardrails landed without their follow-up commit. Excluding cruft from `git add`
is insufficient — the eval diff's `git add --intent-to-add` had already marked it,
and lint-staged's pre-commit stash then fails ("Entry not uptodate. Cannot
merge"), blocking the ship. `markUntrackedIntentToAdd` no longer marks scratch
files, and the ship physically removes them (index + disk) before committing.
