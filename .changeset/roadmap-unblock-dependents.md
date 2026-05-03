---
'@harness-engineering/cli': patch
---

fix(roadmap): unblock dependents when blocker is marked done.

Previously, marking a blocker feature as `done` left its dependents in the `blocked` state until manually updated. The roadmap now propagates done-status to dependents, transitioning them back to `planned` (or whatever their pre-block status was) when the blocker is resolved.
