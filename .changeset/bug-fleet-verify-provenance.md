---
'@harness-engineering/cli': patch
---

`bug-fleet` VERIFY no longer requires provenance under `.harness/sessions/<slug>/`, a directory neither composed skill writes, which made every item fail the gate. Provenance now points at what the pipeline actually leaves behind: the `harness-tdd` reproducing-test commit (committed before any fix commit and cited with its RED/GREEN runs in the worker's `FleetHandoffRecord` `evidence[]`) and, for fix items, the `harness-debugging` session file at `.harness/debug/active/<session-id>.md` (or `.harness/debug/resolved/`), read from the worker's worktree before cleanup. Absent provenance still rejects the item. A new skills test checks that every `.harness/` path `bug-fleet` names is one a composed skill documents writing.
