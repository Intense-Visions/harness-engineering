---
'@harness-engineering/core': patch
---

Fix `syncRoadmap` corrupting `planned` features with named `Blockers:` into `blocked` status.

The `Blockers` field is informational — it documents a dependency relationship. `Status: blocked` is semantic: "actively waiting on something we can't influence right now". Conflating the two meant every item carrying `Blockers: <sibling-planned-item>` was silently flipped to `blocked` on the next sync, even when the dependency was just a queued sibling in the same milestone. In one observed milestone, 13 of 46 newly added items had to be reverted by hand.

The fix preserves the cascade-unblock behavior — a manually-set `blocked` feature returns to `planned` once all of its blockers reach `done` — but removes the bogus `→ blocked` proposal that conflated a documented dependency with execution state. The existing test that codified the bug (`proposes blocked when blocker is in-progress`) is replaced by three tests covering the reproduction case and the corrected semantics.
